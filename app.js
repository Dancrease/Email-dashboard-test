const SUPABASE_URL = 'https://zkquexmmbstiakfhmfvf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprcXVleG1tYnN0aWFrZmhtZnZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjEyMjAsImV4cCI6MjA4NjkzNzIyMH0.W5EmisLiMfQtIk93YlbtS3zsoLCtq7JQYe3zsXwHBdk';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let CLIENT_ID = null;
let categoriesChart = null;

async function signInWithGoogle() {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: "https://dancrease.github.io/Email-dashboard-test/"
        }
    });
    if (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
    }
}

async function signOut() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        console.log('User logged in:', session.user.email);
        const { data: client, error } = await supabaseClient.from('clients').select('*').eq('monitored_email', session.user.email).single();
        
        if (error || !client) {
            alert('No client account found for: ' + session.user.email);
            await signOut();
            return;
        }
        
        if (!client.auth_user_id) {
            await supabaseClient.from('clients').update({ auth_user_id: session.user.id }).eq('id', client.id);
        }
        
        CLIENT_ID = client.id;
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('dashboard-screen').style.display = 'block';
        await loadDashboard();
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('dashboard-screen').style.display = 'none';
    }
});

async function loadDashboard() {
    try {
        const { data: client } = await supabaseClient.from('clients').select('*').eq('id', CLIENT_ID).single();
        if (client) {
            document.getElementById('company-name').textContent = client.company_name;
            document.getElementById('auto-send-toggle').checked = !client.config.approval_mode;
            await loadStats();
            await loadPendingEmails();
            await loadRecentEmails();
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadStats() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { data: stats } = await supabaseClient.from('monthly_stats').select('*').eq('client_id', CLIENT_ID).eq('month', currentMonth).single();
    
    document.getElementById('total-emails').textContent = stats?.total_emails || 0;
    document.getElementById('auto-replied').textContent = stats?.auto_replied || 0;
    
    const { count } = await supabaseClient.from('emails').select('*', { count: 'exact', head: true }).eq('client_id', CLIENT_ID).eq('status', 'pending_approval');
    document.getElementById('pending-count').textContent = count || 0;
    
    updateChart(stats?.categories || {});
}

function updateChart(categories) {
    const ctx = document.getElementById('categoriesChart');
    if (categoriesChart) categoriesChart.destroy();
    
    const labels = Object.keys(categories);
    const data = Object.values(categories);
    if (labels.length === 0) {
        labels.push('No data yet');
        data.push(0);
    }
    
    categoriesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Emails',
                data: data,
                backgroundColor: ['#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95'],
                borderRadius: 12,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    titleColor: '#000',
                    bodyColor: '#666',
                    borderColor: 'rgba(124,58,237,0.2)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    bodyFont: { size: 14, weight: '700' }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: '#71717a', font: { size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    border: { display: false }
                },
                y: {
                    ticks: { color: '#e4e4e7', font: { size: 12, weight: '500' } },
                    grid: { display: false },
                    border: { display: false }
                }
            }
        }
    });
}

async function loadPendingEmails() {
    const { data: emails } = await supabaseClient.from('emails').select('*').eq('client_id', CLIENT_ID).eq('status', 'pending_approval').order('created_at', { ascending: false });
    const container = document.getElementById('pending-emails-container');
    
    if (!emails || emails.length === 0) {
        container.innerHTML = '<div class="glass-card rounded-3xl p-12 text-center"><div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center"><svg class="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div class="text-sm font-semibold text-gray-400 mb-1">All caught up</div><p class="text-xs text-gray-600">No pending approvals</p></div>';
        return;
    }
    
    container.innerHTML = emails.map(email => `
        <div class="glass-card rounded-3xl p-6 mb-4">
            <div class="flex items-start justify-between mb-5">
                <div>
                    <span class="pill-badge bg-amber-500/10 text-amber-400 inline-block mb-3">Pending Review</span>
                    <h4 class="text-base font-semibold text-white mb-1">${escapeHtml(email.subject)}</h4>
                    <p class="text-xs text-gray-500">${escapeHtml(email.sender)} • ${formatDate(email.created_at)}</p>
                </div>
            </div>
            <div class="mb-5">
                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer Message</div>
                <div class="bg-white/5 border border-white/5 rounded-2xl p-4 text-sm text-gray-300">${escapeHtml(email.body)}</div>
            </div>
            <div class="mb-5">
                <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI Response</div>
                <div class="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4">
                    <textarea id="response-${email.id}" class="w-full bg-transparent text-sm text-gray-200 resize-none focus:outline-none" rows="5">${escapeHtml(email.ai_response)}</textarea>
                </div>
            </div>
            <div class="flex gap-3">
                <button onclick="approveEmail('${email.id}')" class="btn-primary flex-1">Approve & Send</button>
                <button onclick="rejectEmail('${email.id}')" class="btn-ghost">Reject</button>
            </div>
        </div>
    `).join('');
}

async function loadRecentEmails() {
    const { data: emails } = await supabaseClient.from('emails').select('*').eq('client_id', CLIENT_ID).in('status', ['auto_replied', 'approved', 'rejected', 'escalated']).order('created_at', { ascending: false }).limit(10);
    const container = document.getElementById('recent-emails-container');
    
    if (!emails || emails.length === 0) {
        container.innerHTML = '<div class="glass-card rounded-3xl p-12 text-center"><div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center"><svg class="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg></div><div class="text-sm font-semibold text-gray-400 mb-1">No activity yet</div><p class="text-xs text-gray-600">Processed emails appear here</p></div>';
        return;
    }
    
    const statusConfig = {
        'auto_replied': { class: 'bg-emerald-500/10 text-emerald-400', label: 'Auto-Replied' },
        'approved': { class: 'bg-blue-500/10 text-blue-400', label: 'Approved' },
        'rejected': { class: 'bg-red-500/10 text-red-400', label: 'Rejected' },
        'escalated': { class: 'bg-amber-500/10 text-amber-400', label: 'Escalated' }
    };
    
    container.innerHTML = `<div class="glass-card rounded-3xl overflow-hidden">${emails.map(email => `
        <div class="p-5 border-b border-white/5 last:border-0 hover:bg-white/5 transition">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4 flex-1 min-w-0">
                    <div class="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                        <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-medium text-white text-sm truncate">${escapeHtml(email.subject)}</h4>
                        <p class="text-xs text-gray-600 truncate">${escapeHtml(email.sender)}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3 flex-shrink-0">
                    <span class="text-xs text-gray-600 hidden sm:block">${formatDate(email.created_at)}</span>
                    <span class="pill-badge ${statusConfig[email.status].class}">${statusConfig[email.status].label}</span>
                </div>
            </div>
        </div>
    `).join('')}</div>`;
}

async function approveEmail(emailId) {
    try {
        const responseText = document.getElementById(`response-${emailId}`).value;
        const { data: email } = await supabaseClient.from('emails').select('*').eq('id', emailId).single();
        
        if (email) {
            await supabaseClient.from('emails').update({ status: 'approved', ai_response: responseText }).eq('id', emailId);
            alert('✓ Email approved!');
            await loadDashboard();
        }
    } catch (error) {
        console.error(error);
        alert('Error approving email');
    }
}

async function rejectEmail(emailId) {
    if (!confirm('Reject this email?')) return;
    try {
        await supabaseClient.from('emails').update({ status: 'rejected' }).eq('id', emailId);
        alert('Email rejected');
        await loadDashboard();
    } catch (error) {
        console.error(error);
        alert('Error');
    }
}

document.getElementById('auto-send-toggle').addEventListener('change', async (e) => {
    try {
        const approvalMode = !e.target.checked;
        const config = await getClientConfig();
        config.approval_mode = approvalMode;
        await supabaseClient.from('clients').update({ config: config }).eq('id', CLIENT_ID);
        alert(approvalMode ? 'Approval mode enabled' : 'Auto-send enabled ✓');
    } catch (error) {
        console.error(error);
        alert('Error');
        e.target.checked = !e.target.checked;
    }
});

async function getClientConfig() {
    const { data } = await supabaseClient.from('clients').select('config').eq('id', CLIENT_ID).single();
    return data?.config || {};
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

setInterval(loadDashboard, 30000);
