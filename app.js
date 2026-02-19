const SUPABASE_URL = 'https://zkquexmmbstiakfhmfvf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprcXVleG1tYnN0aWFrZmhtZnZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNjEyMjAsImV4cCI6MjA4NjkzNzIyMH0.W5EmisLiMfQtIk93YlbtS3zsoLCtq7JQYe3zsXwHBdk';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let CLIENT_ID = null;
let categoriesChart = null;
let volumeChart = null;
let heatmapBuilt = false;
let agentIsActive = true;

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

function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('dropdown-enter');
        void dropdown.offsetWidth;
        dropdown.classList.add('dropdown-enter');
    }
}

document.addEventListener('click', (e) => {
    const btn = document.getElementById('user-avatar-btn');
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown && !dropdown.classList.contains('hidden') && btn && !btn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
});

async function toggleAgentPause() {
    const btn = document.getElementById('pause-btn');
    btn.textContent = 'Updating...';
    btn.disabled = true;
    const newState = !agentIsActive;
    const { error } = await supabaseClient.from('clients').update({ is_active: newState }).eq('id', CLIENT_ID);
    if (error) {
        console.error('Pause toggle failed:', error);
        alert('Failed to update agent status. Please try again.');
        btn.textContent = agentIsActive ? 'Pause Agent' : 'Resume Agent';
    } else {
        updatePauseUI(newState);
    }
    btn.disabled = false;
}

function updatePauseUI(isActive, adminPaused) {
    agentIsActive = isActive;
    const banner = document.getElementById('paused-banner');
    const btn = document.getElementById('pause-btn');
    const card = document.getElementById('pause-card');
    const desc = document.getElementById('pause-desc');
    if (adminPaused) {
        banner.classList.remove('hidden');
        banner.className = 'hidden mb-5 bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 flex items-center gap-4';
        banner.classList.remove('hidden');
        banner.innerHTML = '<div class="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0"><svg class="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div><div><div class="font-semibold text-orange-400 mb-0.5">Paused by Administrator</div><p class="text-sm text-orange-400/70">Your account has been paused. Please contact your administrator.</p></div>';
        card.style.display = 'none';
    } else if (isActive) {
        banner.classList.add('hidden');
        card.style.display = '';
        btn.textContent = 'Pause Agent';
        btn.className = 'pill-badge bg-red-500/10 text-red-400 border border-red-500/20 cursor-pointer hover:bg-red-500/20 transition';
        card.style.borderColor = '';
        desc.textContent = 'Immediately halt all email processing';
    } else {
        banner.classList.remove('hidden');
        banner.className = 'hidden mb-5 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center gap-4';
        banner.classList.remove('hidden');
        banner.innerHTML = '<div class="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0"><svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div><div><div class="font-semibold text-red-400 mb-0.5">Agent Paused</div><p class="text-sm text-red-400/70">All email processing is suspended. No emails will be handled until resumed.</p></div>';
        card.style.display = '';
        btn.textContent = 'Resume Agent';
        btn.className = 'pill-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20 transition';
        card.style.borderColor = 'rgba(239,68,68,0.4)';
        desc.textContent = 'Agent is paused — click to resume processing';
    }
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
            const initials = client.company_name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
            document.getElementById('user-initials').textContent = initials;
            document.getElementById('auto-send-toggle').checked = !client.config.approval_mode;
            updatePauseUI(client.is_active, client.admin_paused);
            await loadStats();
            await loadVolumeChart();
            await loadHeatmap();
            await loadPendingEmails();
            await loadRecentEmails();
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadStats() {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthStart = currentMonth + '-01';

    // Total — every email received this month regardless of type
    const { count: totalCount } = await supabaseClient.from('emails').select('*', { count: 'exact', head: true }).eq('client_id', CLIENT_ID).gte('created_at', monthStart);
    document.getElementById('total-emails').textContent = totalCount || 0;

    // Actionable — excludes spam and OOO
    const { count: actionableCount } = await supabaseClient.from('emails').select('*', { count: 'exact', head: true }).eq('client_id', CLIENT_ID).gte('created_at', monthStart).in('status', ['auto_replied', 'escalated', 'pending_approval', 'approved', 'rejected']);
    document.getElementById('actionable-count').textContent = actionableCount || 0;

    // Auto-replied count + % of actionable
    const { count: autoRepliedCount } = await supabaseClient.from('emails').select('*', { count: 'exact', head: true }).eq('client_id', CLIENT_ID).gte('created_at', monthStart).eq('status', 'auto_replied');
    document.getElementById('auto-replied').textContent = autoRepliedCount || 0;
    const pct = actionableCount > 0 ? Math.round(((autoRepliedCount || 0) / actionableCount) * 100) : 0;
    document.getElementById('auto-replied-pct').textContent = pct + '% of actionable';

    // Escalated count + % of actionable
    const { count: escalatedCount } = await supabaseClient.from('emails').select('*', { count: 'exact', head: true }).eq('client_id', CLIENT_ID).gte('created_at', monthStart).eq('status', 'escalated');
    document.getElementById('escalated-count').textContent = escalatedCount || 0;
    const escPct = actionableCount > 0 ? Math.round(((escalatedCount || 0) / actionableCount) * 100) : 0;
    document.getElementById('escalated-pct').textContent = escPct + '% of actionable';

    // Pending
    const { count: pendingCount } = await supabaseClient.from('emails').select('*', { count: 'exact', head: true }).eq('client_id', CLIENT_ID).eq('status', 'pending_approval');
    document.getElementById('pending-count').textContent = pendingCount || 0;
    const bellDot = document.getElementById('bell-dot');
    if (bellDot) bellDot.classList.toggle('hidden', !pendingCount || pendingCount === 0);

    // Not Actioned (Spam + OOO)
    const { count: spamCount } = await supabaseClient.from('emails').select('*', { count: 'exact', head: true }).eq('client_id', CLIENT_ID).eq('status', 'spam').gte('created_at', monthStart);
    const { count: oooCount }  = await supabaseClient.from('emails').select('*', { count: 'exact', head: true }).eq('client_id', CLIENT_ID).eq('status', 'auto_reply').gte('created_at', monthStart);
    document.getElementById('not-actioned-count').textContent = (spamCount || 0) + (oooCount || 0);
    document.getElementById('not-actioned-breakdown').textContent = `${spamCount || 0} Spam · ${oooCount || 0} OOO`;

    // Chart — query emails grouped by category and status
    const { data: emailsForChart } = await supabaseClient.from('emails').select('category, status').eq('client_id', CLIENT_ID).gte('created_at', monthStart).in('status', ['auto_replied', 'escalated', 'pending_approval']);
    const chartData = {};
    (emailsForChart || []).forEach(e => {
        if (!chartData[e.category]) chartData[e.category] = { auto_replied: 0, escalated: 0, pending_approval: 0 };
        chartData[e.category][e.status]++;
    });
    updateChart(chartData);
}

function updateChart(categories) {
    const ctx = document.getElementById('categoriesChart');
    const labels = Object.keys(categories);
    if (labels.length === 0) labels.push('No data yet');
    const autoReplied = labels.map(l => (categories[l] || {}).auto_replied || 0);
    const escalated  = labels.map(l => (categories[l] || {}).escalated || 0);
    const pending    = labels.map(l => (categories[l] || {}).pending_approval || 0);

    if (categoriesChart) {
        if (categoriesChart.data.datasets.length === 3) {
            categoriesChart.data.labels = labels;
            categoriesChart.data.datasets[0].data = autoReplied;
            categoriesChart.data.datasets[1].data = escalated;
            categoriesChart.data.datasets[2].data = pending;
            categoriesChart.update('none');
            return;
        }
        categoriesChart.destroy();
        categoriesChart = null;
    }

    categoriesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Auto-Replied', data: autoReplied, backgroundColor: 'rgba(16,185,129,0.8)' },
                { label: 'Escalated',   data: escalated,   backgroundColor: 'rgba(249,115,22,0.8)' },
                { label: 'Pending',     data: pending,     backgroundColor: 'rgba(245,158,11,0.8)' },
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: '#a1a1aa', font: { size: 12 }, boxWidth: 12, boxHeight: 12, borderRadius: 4, useBorderRadius: true, padding: 20 }
                },
                tooltip: {
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    titleColor: '#000',
                    bodyColor: '#666',
                    borderColor: 'rgba(124,58,237,0.2)',
                    borderWidth: 1,
                    padding: 12,
                    bodyFont: { size: 13, weight: '600' }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { color: '#71717a', font: { size: 11 }, stepSize: 1 },
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    border: { display: false }
                },
                y: {
                    stacked: true,
                    ticks: { color: '#e4e4e7', font: { size: 12, weight: '500' } },
                    grid: { display: false },
                    border: { display: false }
                }
            }
        }
    });
}

async function loadHeatmap() {
    if (heatmapBuilt) return;
    const from = new Date();
    from.setDate(from.getDate() - 90);

    const { data: emails } = await supabaseClient.from('emails').select('created_at').eq('client_id', CLIENT_ID).gte('created_at', from.toISOString());

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const slots = [
        { label: '12–4am', start: 0,  end: 3  },
        { label: '4–8am',  start: 4,  end: 7  },
        { label: '8–11am', start: 8,  end: 10 },
        { label: '11–2pm', start: 11, end: 13 },
        { label: '2–5pm',  start: 14, end: 16 },
        { label: '5–8pm',  start: 17, end: 19 },
        { label: '8pm–12', start: 20, end: 23 },
    ];

    const grid = Array.from({ length: 7 }, () => Array(slots.length).fill(0));
    (emails || []).forEach(e => {
        const d = new Date(e.created_at);
        const day = (d.getDay() + 6) % 7;
        const hour = d.getHours();
        const si = slots.findIndex(s => hour >= s.start && hour <= s.end);
        if (si !== -1) grid[day][si]++;
    });

    const maxCount = Math.max(...grid.flat(), 1);
    const cellSize = 'height:28px;border-radius:4px;';

    let html = '<div style="display:grid;grid-template-columns:36px repeat(' + slots.length + ',1fr);gap:3px;font-size:10px;">';
    // Header row
    html += '<div></div>';
    slots.forEach(s => {
        html += '<div style="color:#71717a;text-align:center;padding-bottom:4px;white-space:nowrap;overflow:hidden;font-size:9px;">' + s.label + '</div>';
    });
    // Data rows
    dayNames.forEach((day, di) => {
        html += '<div style="color:#e4e4e7;display:flex;align-items:center;font-size:10px;font-weight:500;">' + day + '</div>';
        slots.forEach((_, si) => {
            const count = grid[di][si];
            const intensity = count / maxCount;
            const alpha = count === 0 ? 0.06 : 0.12 + intensity * 0.78;
            const title = count + ' email' + (count !== 1 ? 's' : '');
            html += '<div title="' + title + '" style="' + cellSize + 'background:rgba(124,58,237,' + alpha.toFixed(2) + ');cursor:default;"></div>';
        });
    });
    html += '</div>';
    // Legend
    html += '<div style="display:flex;align-items:center;gap:6px;margin-top:10px;justify-content:flex-end;">';
    html += '<span style="color:#71717a;font-size:9px;">Less</span>';
    [0.06, 0.25, 0.45, 0.65, 0.9].forEach(a => {
        html += '<div style="width:12px;height:12px;border-radius:2px;background:rgba(124,58,237,' + a + ');"></div>';
    });
    html += '<span style="color:#71717a;font-size:9px;">More</span></div>';

    document.getElementById('heatmapContainer').innerHTML = html;
    heatmapBuilt = true;
}

async function loadVolumeChart() {
    const days = 30;
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - days + 1);
    from.setHours(0, 0, 0, 0);

    const { data: emails } = await supabaseClient.from('emails').select('created_at').eq('client_id', CLIENT_ID).gte('created_at', from.toISOString());

    const buckets = {};
    for (let i = 0; i < days; i++) {
        const d = new Date(from);
        d.setDate(d.getDate() + i);
        buckets[d.toISOString().slice(0, 10)] = 0;
    }
    (emails || []).forEach(e => {
        const day = e.created_at.slice(0, 10);
        if (buckets[day] !== undefined) buckets[day]++;
    });

    const labels = Object.keys(buckets).map(d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
    const data = Object.values(buckets);

    const ctx = document.getElementById('volumeChart');
    if (volumeChart) {
        volumeChart.data.labels = labels;
        volumeChart.data.datasets[0].data = data;
        volumeChart.update('none');
        return;
    }

    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, 'rgba(124, 58, 237, 0.35)');
    gradient.addColorStop(1, 'rgba(124, 58, 237, 0)');

    volumeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data,
                borderColor: '#7c3aed',
                borderWidth: 2.5,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 5,
                pointHoverBackgroundColor: '#7c3aed',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
            }]
        },
        options: {
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
                    callbacks: { label: (item) => `${item.raw} email${item.raw !== 1 ? 's' : ''}` }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#71717a', font: { size: 11 }, maxTicksLimit: 8, maxRotation: 0 },
                    grid: { display: false },
                    border: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#71717a', font: { size: 11 }, stepSize: 1, precision: 0 },
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    border: { display: false }
                }
            }
        },
        plugins: [{
            id: 'glowLine',
            beforeDatasetsDraw(chart) {
                chart.ctx.save();
                chart.ctx.shadowColor = 'rgba(124, 58, 237, 0.7)';
                chart.ctx.shadowBlur = 16;
            },
            afterDatasetsDraw(chart) {
                chart.ctx.restore();
            }
        }]
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
    const { data: emails } = await supabaseClient.from('emails').select('*').eq('client_id', CLIENT_ID).in('status', ['auto_replied', 'approved', 'rejected', 'escalated', 'spam', 'auto_reply']).order('created_at', { ascending: false }).limit(10);
    const container = document.getElementById('recent-emails-container');
    
    if (!emails || emails.length === 0) {
        container.innerHTML = '<div class="glass-card rounded-3xl p-12 text-center"><div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center"><svg class="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg></div><div class="text-sm font-semibold text-gray-400 mb-1">No activity yet</div><p class="text-xs text-gray-600">Processed emails appear here</p></div>';
        return;
    }
    
    const statusConfig = {
        'auto_replied': { class: 'bg-emerald-500/10 text-emerald-400', label: 'Auto-Replied' },
        'approved': { class: 'bg-blue-500/10 text-blue-400', label: 'Approved' },
        'rejected': { class: 'bg-red-500/10 text-red-400', label: 'Rejected' },
        'escalated': { class: 'bg-amber-500/10 text-amber-400', label: 'Escalated' },
        'spam': { class: 'bg-red-900/20 text-red-400', label: 'Spam' },
        'auto_reply': { class: 'bg-gray-500/10 text-gray-400', label: 'OOO' }
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
