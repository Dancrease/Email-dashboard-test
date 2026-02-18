// Supabase Configuration
const SUPABASE_URL = 'https://zkquexmmbstiakfhmfvf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprcXVleG1tYnN0aWFrZmhtZnZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjEyMjAsImV4cCI6MjA4NjkzNzIyMH0.W5EmisLiMfQtIk93YlbtS3zsoLCtq7JQYe3zsXwHBdk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let CLIENT_ID = null;
let categoriesChart = null;

async function loadDashboard() {
    try {
        const { data: clients } = await supabase
            .from('clients')
            .select('*')
            .eq('company_name', 'Acme Plumbing')
            .single();
        
        if (!clients) {
            console.error('Client not found');
            return;
        }
        
        CLIENT_ID = clients.id;
        
        // Update company names
        document.getElementById('company-name').textContent = clients.company_name;
        document.getElementById('nav-company-name').textContent = clients.company_name;
        
        // Update auto-send toggle
        const autoSendToggle = document.getElementById('auto-send-toggle');
        autoSendToggle.checked = !clients.config.approval_mode;
        
        await loadStats();
        await loadPendingEmails();
        await loadRecentEmails();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadStats() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const { data: stats } = await supabase
        .from('monthly_stats')
        .select('*')
        .eq('client_id', CLIENT_ID)
        .eq('month', currentMonth)
        .single();
    
    document.getElementById('total-emails').textContent = stats?.total_emails || 0;
    document.getElementById('auto-replied').textContent = stats?.auto_replied || 0;
    
    const { count } = await supabase
        .from('emails')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', CLIENT_ID)
        .eq('status', 'pending_approval');
    
    document.getElementById('pending-count').textContent = count || 0;
    
    updateCategoriesChart(stats?.categories || {});
}

function updateCategoriesChart(categories) {
    const ctx = document.getElementById('categoriesChart');
    
    if (categoriesChart) {
        categoriesChart.destroy();
    }
    
    const labels = Object.keys(categories);
    const data = Object.values(categories);
    
    if (labels.length === 0) {
        labels.push('No categories yet');
        data.push(0);
    }
    
    const purpleShades = ['#a855f7', '#9333ea', '#7e22ce', '#6b21a8', '#581c87'];
    
    categoriesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Emails',
                data: data,
                backgroundColor: purpleShades.slice(0, labels.length),
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#111827',
                    bodyColor: '#6b7280',
                    borderColor: 'rgba(147, 51, 234, 0.2)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 14, weight: '700' },
                    callbacks: {
                        label: (context) => `${context.parsed.x} emails`
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        color: '#6b7280',
                        font: { size: 12 },
                        precision: 0
                    },
                    grid: {
                        color: 'rgba(147, 51, 234, 0.05)',
                        drawBorder: false,
                    },
                    border: { display: false }
                },
                y: {
                    ticks: {
                        color: '#111827',
                        font: { size: 13, weight: '500' }
                    },
                    grid: { display: false },
                    border: { display: false }
                }
            }
        }
    });
}

async function loadPendingEmails() {
    const { data: emails } = await supabase
        .from('emails')
        .select('*')
        .eq('client_id', CLIENT_ID)
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false });
    
    const container = document.getElementById('pending-emails-container');
    
    if (!emails || emails.length === 0) {
        container.innerHTML = `
            <div class="surface-elevated rounded-2xl p-12 text-center">
                <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                </div>
                <h3 class="text-lg font-semibold text-gray-900 mb-2">All caught up!</h3>
                <p class="text-sm text-gray-500">No pending approvals at the moment</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = emails.map(email => `
        <div class="surface-elevated rounded-2xl p-6 mb-4">
            <div class="flex items-start justify-between mb-4">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="status-pill bg-amber-100 text-amber-700">Pending Review</span>
                    </div>
                    <h4 class="text-lg font-semibold text-gray-900 mb-1">${escapeHtml(email.subject)}</h4>
                    <p class="text-sm text-gray-500">From: ${escapeHtml(email.sender)} • ${formatDate(email.created_at)}</p>
                </div>
            </div>
            
            <div class="mb-6">
                <div class="text-sm font-semibold text-gray-700 mb-2">Customer Message:</div>
                <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">${escapeHtml(email.body)}</div>
            </div>
            
            <div class="mb-6">
                <div class="text-sm font-semibold text-gray-700 mb-2">AI Response:</div>
                <div class="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <textarea 
                        id="response-${email.id}" 
                        class="w-full bg-transparent text-sm text-gray-700 resize-none focus:outline-none leading-relaxed"
                        rows="5"
                    >${escapeHtml(email.ai_response)}</textarea>
                </div>
            </div>
            
            <div class="flex gap-3">
                <button 
                    onclick="approveEmail('${email.id}')"
                    class="btn-primary flex-1">
                    <span class="flex items-center justify-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        Approve & Send
                    </span>
                </button>
                <button 
                    onclick="rejectEmail('${email.id}')"
                    class="btn-secondary">
                    Reject
                </button>
            </div>
        </div>
    `).join('');
}

async function loadRecentEmails() {
    const { data: emails } = await supabase
        .from('emails')
        .select('*')
        .eq('client_id', CLIENT_ID)
        .in('status', ['auto_replied', 'approved', 'rejected', 'escalated'])
        .order('created_at', { ascending: false })
        .limit(10);
    
    const container = document.getElementById('recent-emails-container');
    
    if (!emails || emails.length === 0) {
        container.innerHTML = `
            <div class="surface-elevated rounded-2xl p-12 text-center">
                <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
                    </svg>
                </div>
                <h3 class="text-lg font-semibold text-gray-900 mb-2">No activity yet</h3>
                <p class="text-sm text-gray-500">Processed emails will appear here</p>
            </div>
        `;
        return;
    }
    
    const statusConfig = {
        'auto_replied': { class: 'bg-green-100 text-green-700', label: 'Auto-Replied', icon: 'M5 13l4 4L19 7' },
        'approved': { class: 'bg-blue-100 text-blue-700', label: 'Approved', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
        'rejected': { class: 'bg-red-100 text-red-700', label: 'Rejected', icon: 'M6 18L18 6M6 6l12 12' },
        'escalated': { class: 'bg-amber-100 text-amber-700', label: 'Escalated', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' }
    };
    
    container.innerHTML = `
        <div class="surface-elevated rounded-2xl overflow-hidden">
            ${emails.map((email, index) => `
                <div class="p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-4 flex-1 min-w-0">
                            <div class="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                                <svg class="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                                </svg>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-semibold text-gray-900 truncate">${escapeHtml(email.subject)}</h4>
                                <p class="text-sm text-gray-500 truncate">${escapeHtml(email.sender)}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 flex-shrink-0">
                            <span class="text-xs text-gray-500 hidden sm:block">${formatDate(email.created_at)}</span>
                            <span class="status-pill ${statusConfig[email.status].class}">
                                ${statusConfig[email.status].label}
                            </span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function approveEmail(emailId) {
    try {
        const responseText = document.getElementById(`response-${emailId}`).value;
        
        const { data: email } = await supabase
            .from('emails')
            .select('*')
            .eq('id', emailId)
            .single();
        
        if (!email) {
            alert('Email not found');
            return;
        }
        
        await supabase
            .from('emails')
            .update({ 
                status: 'approved',
                ai_response: responseText
            })
            .eq('id', emailId);
        
        alert('✓ Email approved! (Sending functionality coming next)');
        await loadDashboard();
        
    } catch (error) {
        console.error('Error approving email:', error);
        alert('Error approving email');
    }
}

async function rejectEmail(emailId) {
    if (!confirm('Are you sure you want to reject this email?')) {
        return;
    }
    
    try {
        await supabase
            .from('emails')
            .update({ status: 'rejected' })
            .eq('id', emailId);
        
        alert('Email rejected');
        await loadDashboard();
        
    } catch (error) {
        console.error('Error rejecting email:', error);
        alert('Error rejecting email');
    }
}

document.getElementById('auto-send-toggle').addEventListener('change', async (e) => {
    try {
        const approvalMode = !e.target.checked;
        const config = await getClientConfig();
        config.approval_mode = approvalMode;
        
        await supabase
            .from('clients')
            .update({ config: config })
            .eq('id', CLIENT_ID);
        
        alert(approvalMode ? 'Approval mode enabled' : 'Auto-send mode enabled ✓');
        
    } catch (error) {
        console.error('Error updating auto-send:', error);
        alert('Error updating setting');
        e.target.checked = !e.target.checked;
    }
});

async function getClientConfig() {
    const { data } = await supabase
        .from('clients')
        .select('config')
        .eq('id', CLIENT_ID)
        .single();
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

window.addEventListener('DOMContentLoaded', loadDashboard);
setInterval(loadDashboard, 30000);
