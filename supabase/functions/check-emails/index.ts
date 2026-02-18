import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getAccessToken, fetchNewEmails, sendGmailReply, labelEmail } from './gmail-helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: clients, error: clientsError } = await supabase.from('clients').select('*').eq('is_active', true);
    if (clientsError) throw clientsError;
    const results = [];
    for (const client of (clients as any[])) {
      try {
        const result = await processClientEmails(client, supabase);
        results.push({ client: client.monitored_email, ...result });
      } catch (error) {
        console.error(`Error processing client ${client.monitored_email}:`, error);
        results.push({ client: client.monitored_email, error: error.message, stack: error.stack });
      }
    }
    return new Response(JSON.stringify({ success: true, processed: results.length, results }), { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

async function processClientEmails(client: any, supabase: any) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  if (client.current_month_count >= client.email_limit) return { status: 'limit_reached' };
  if (!client.gmail_oauth_token) return { status: 'no_oauth_token' };

  const accessToken = await getAccessToken(client.gmail_oauth_token);
  const sent = await sendApprovedEmails(client, supabase, accessToken);

  const newEmails = await fetchNewEmails(accessToken, client.last_check || undefined);
  if (newEmails.length === 0) {
    await supabase.from('clients').update({ last_check: new Date().toISOString() }).eq('id', client.id);
    return { status: 'no_new_emails', sent_approved: sent };
  }

  const processed = [];
  const errors = [];

  for (const email of newEmails) {
    try {
      const { data: existing } = await supabase.from('emails').select('id').eq('client_id', client.id).eq('gmail_message_id', email.id).single();
      if (existing) continue;

      const shouldEscalate = checkEscalation(email, client.config);
      let aiResponse = null;
      let status = 'pending_approval';
      let category = 'General Inquiry';

      if (!shouldEscalate) {
        aiResponse = await generateAIResponse(email, client);
        category = await categorizeEmail(email, client);
        if (!client.config.approval_mode) {
          await sendGmailReply(accessToken, email.from, email.subject, aiResponse, email.threadId);
          await labelEmail(accessToken, email.id, 'AI-Handled');
          status = 'auto_replied';
        }
      } else {
        status = 'escalated';
      }

      const deleteAfter = new Date();
      deleteAfter.setDate(deleteAfter.getDate() + (client.config.data_retention_days || 7));

      const { error: insertError } = await supabase.from('emails').insert({
        client_id: client.id, gmail_message_id: email.id, gmail_thread_id: email.threadId,
        sender: email.from, subject: email.subject, body: email.body,
        ai_response: aiResponse, category, status, delete_after: deleteAfter.toISOString()
      });
      if (insertError) throw insertError;

      await updateMonthlyStats(supabase, client.id, currentMonth, category, status);
      await supabase.from('clients').update({ current_month_count: client.current_month_count + 1, last_check: new Date().toISOString() }).eq('id', client.id);
      processed.push({ email: email.subject, status, category });
    } catch (error) {
      errors.push({ email: email.subject, error: error.message });
    }
  }
  return { status: 'success', new_emails: newEmails.length, processed: processed.length, sent_approved: sent, details: processed, errors };
}

async function sendApprovedEmails(client: any, supabase: any, accessToken: string): Promise<number> {
  const { data: approvedEmails } = await supabase.from('emails').select('*').eq('client_id', client.id).eq('status', 'approved');
  if (!approvedEmails || approvedEmails.length === 0) return 0;
  let sent = 0;
  for (const email of approvedEmails) {
    try {
      await sendGmailReply(accessToken, email.sender, email.subject, email.ai_response, email.gmail_thread_id);
      await labelEmail(accessToken, email.gmail_message_id, 'Replied To');
      await supabase.from('emails').update({ status: 'auto_replied' }).eq('id', email.id);
      sent++;
    } catch (error) {
      console.error(`Error sending approved email ${email.id}:`, error);
    }
  }
  return sent;
}

function checkEscalation(email: any, config: any): boolean {
  const keywords = config.escalation_keywords || [];
  // Strip quoted lines (lines starting with >) so AI's own quoted text doesn't trigger escalation
  const strippedBody = email.body.split('
').filter((line: string) => !line.trimStart().startsWith('>')).join('
');
  const emailText = `${email.subject} ${strippedBody}`.toLowerCase();
  return keywords.some((keyword: string) => emailText.includes(keyword.toLowerCase()));
}

async function generateAIResponse(email: any, client: any): Promise<string> {
  const prompt = `You are a customer service AI assistant for ${client.config.business_description}.\n\nBusiness Hours: ${client.config.business_hours}\nCommunication Tone: ${client.config.tone}\n\nFAQs:\n${client.config.faqs?.map((faq: any) => `Q: ${faq.question}\\nA: ${faq.answer}`).join('\\n\\n')}\n\nCustomer Email:\nFrom: ${email.from}\nSubject: ${email.subject}\nBody: ${email.body}\n\nPlease write a helpful, ${client.config.tone} response to this customer email. Be concise and professional.`;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
  });
  const data = await response.json();
  return data.content[0].text;
}

async function categorizeEmail(email: any, client: any): Promise<string> {
  const categories: string[] = client.config.categories || ['General Inquiry'];
  // Strip quoted lines (lines starting with >) so AI's own quoted text doesn't trigger escalation
  const strippedBody = email.body.split('
').filter((line: string) => !line.trimStart().startsWith('>')).join('
');
  const emailText = `${email.subject} ${strippedBody}`.toLowerCase();

  for (const category of categories) {
    const keywords = category.toLowerCase().split(/[\s_-]+/).filter((w: string) => w.length > 4).map((w: string) => w.substring(0, 5));
    if (keywords.some((kw: string) => emailText.includes(kw))) return category;
  }

  try {
    const prompt = `Categorise this customer email into exactly one of these categories: ${categories.join(', ')}.\n\nEmail Subject: ${email.subject}\nEmail Body: ${email.body}\n\nReply with ONLY the category name, nothing else.`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 50, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await response.json();
    const aiCategory = data.content[0].text.trim();
    const matched = categories.find((c: string) => c.toLowerCase() === aiCategory.toLowerCase());
    if (matched) return matched;
  } catch (e) {
    console.error('AI categorisation failed:', e);
  }
  return categories[categories.length - 1] || 'General Inquiry';
}

async function updateMonthlyStats(supabase: any, clientId: string, month: string, category: string, status: string) {
  const { data: existing } = await supabase.from('monthly_stats').select('*').eq('client_id', clientId).eq('month', month).single();
  if (existing) {
    const categories = existing.categories || {};
    categories[category] = (categories[category] || 0) + 1;
    await supabase.from('monthly_stats').update({
      total_emails: existing.total_emails + 1,
      auto_replied: existing.auto_replied + (status === 'auto_replied' ? 1 : 0),
      escalated: existing.escalated + (status === 'escalated' ? 1 : 0),
      categories
    }).eq('client_id', clientId).eq('month', month);
  } else {
    await supabase.from('monthly_stats').insert({
      client_id: clientId, month, total_emails: 1,
      auto_replied: status === 'auto_replied' ? 1 : 0,
      escalated: status === 'escalated' ? 1 : 0,
      categories: { [category]: 1 }
    });
  }
}
