interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  body: string;
  isAutoReply: boolean;
}

export async function getAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET')!;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' })
  });
  const data = await response.json();
  if (!data.access_token) throw new Error(`OAuth error: ${JSON.stringify(data)}`);
  return data.access_token;
}

export async function fetchNewEmails(accessToken: string, lastCheckTime?: string): Promise<GmailMessage[]> {
  let query = 'in:inbox';
  if (lastCheckTime) {
    const timestamp = Math.floor(new Date(lastCheckTime).getTime() / 1000);
    query += ` after:${timestamp}`;
  }
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`;
  const listResponse = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const listData = await listResponse.json();
  if (!listData.messages || listData.messages.length === 0) return [];
  const messages: GmailMessage[] = [];
  for (const msg of listData.messages) {
    const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
    const msgResponse = await fetch(msgUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const msgData = await msgResponse.json();
    const headers = msgData.payload.headers;
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'Thanks for getting in touch';
    const body = extractBody(msgData.payload);

    const autoSubmitted = headers.find((h: any) => h.name.toLowerCase() === 'auto-submitted')?.value || '';
    const precedence = headers.find((h: any) => h.name.toLowerCase() === 'precedence')?.value || '';
    const xAutoreply = headers.find((h: any) => h.name.toLowerCase() === 'x-autoreply')?.value || '';
    const xAutoResponseSuppress = headers.find((h: any) => h.name.toLowerCase() === 'x-auto-response-suppress')?.value || '';
    const headerAutoReply =
      (autoSubmitted !== '' && autoSubmitted.toLowerCase() !== 'no') ||
      precedence.toLowerCase().includes('auto') ||
      xAutoreply.toLowerCase() === 'yes' ||
      xAutoResponseSuppress !== '';
    const subjectPatterns = ['out of office', 'automatic reply', 'auto reply', 'auto:', 'vacation reply', 'on holiday', 'on annual leave', 'away from the office'];
    const subjectAutoReply = subjectPatterns.some(p => subject.toLowerCase().includes(p));
    const isAutoReply = headerAutoReply || subjectAutoReply;

    messages.push({ id: msgData.id, threadId: msgData.threadId, from, subject, body, isAutoReply });
  }
  return messages;
}

export async function sendGmailReply(accessToken: string, to: string, subject: string, body: string, threadId?: string): Promise<void> {
  const email = [`To: ${to}`, `Subject: Re: ${subject}`, threadId ? `In-Reply-To: ${threadId}` : '', threadId ? `References: ${threadId}` : '', 'Content-Type: text/plain; charset=utf-8', '', body].filter(line => line !== '').join('\r\n');
  const encodedEmail = btoa(email).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodedEmail, threadId })
  });
}

function decodeBase64(data: string): string {
  return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBody(payload: any): string {
  // Simple single-part message
  if (payload.body?.data) {
    const decoded = decodeBase64(payload.body.data);
    return payload.mimeType === 'text/html' ? stripHtml(decoded) : decoded;
  }
  if (!payload.parts) return '';

  // Prefer text/plain in direct parts
  const plainPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
  if (plainPart?.body?.data) return decodeBase64(plainPart.body.data);

  // Recurse into nested multipart (e.g. multipart/alternative inside multipart/mixed)
  for (const part of payload.parts) {
    if (part.mimeType?.startsWith('multipart/')) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  // Fall back to HTML
  const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
  if (htmlPart?.body?.data) return stripHtml(decodeBase64(htmlPart.body.data));

  return '';
}

export async function labelEmail(accessToken: string, messageId: string, labelName: string = 'AI-Handled'): Promise<void> {
  const labelsUrl = 'https://gmail.googleapis.com/gmail/v1/users/me/labels';
  const labelsResponse = await fetch(labelsUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const labelsData = await labelsResponse.json();
  let labelId = labelsData.labels.find((l: any) => l.name === labelName)?.id;
  if (!labelId) {
    const createResponse = await fetch(labelsUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show' })
    });
    const createData = await createResponse.json();
    labelId = createData.id;
  }
  await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ addLabelIds: [labelId], removeLabelIds: ['UNREAD'] })
  });
}
