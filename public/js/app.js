        let siteToken = localStorage.getItem('site_token');
        if (!siteToken) window.location.replace('/login.html');

        let token = localStorage.getItem('matrix_token');
        let currentFilter = '绿色'; 
        let allAccountsCache = [];
        let allStatusesCache = {};
        let tokenCountdownTimers = {};

        async function apiCall(endpoint, method = 'GET', body = null) {
            const options = { method, headers: { 'Authorization': token || '', 'X-Site-Token': siteToken || '', 'Content-Type': 'application/json' } };
            if (body) options.body = JSON.stringify(body);
            const res = await fetch(endpoint, options);
            if (res.status === 403) { localStorage.removeItem('site_token'); window.location.replace('/login.html'); throw new Error("请先登录"); }
            if (res.status === 401) { localStorage.removeItem('matrix_token'); token = null; throw new Error("未授权"); }
            return res.json();
        }

        function checkAdminState() {
            const adminLink = document.getElementById('admin-entrance');
            const addAccountBtn = document.getElementById('add-account-btn');
            const siteLogoutBtn = document.getElementById('site-logout-btn');
            const manageTab = document.getElementById('tab-btn-manage');
            if (token) {
                addAccountBtn.style.display = "inline-block";
                siteLogoutBtn.style.display = "none";
                adminLink.innerText = "退出管理员";
                adminLink.style.background = "var(--danger)";
                adminLink.style.color = "#fff";
                manageTab.style.display = "inline-block";
                loadManage();
            } else {
                addAccountBtn.style.display = "none";
                siteLogoutBtn.style.display = "inline-block";
                adminLink.innerText = "管理员登录";
                adminLink.style.background = "var(--accent)";
                adminLink.style.color = "#fff";
                manageTab.style.display = "none";
                switchTab('dash');
            }
        }

        function triggerAdminLogin() {
            if (token) { localStorage.removeItem('matrix_token'); token = null; checkAdminState(); } 
            else { document.getElementById('login-modal').style.display = 'flex'; }
        }

        function logoutSite() {
            if (token) {
                alert("请先退出管理员登录");
                return;
            }

            localStorage.removeItem('site_token');
            window.location.replace('/login.html');
        }

        async function performLogin() {
            const pass = document.getElementById('auth-pass').value;
            try {
                const res = await fetch('/api/login', { method: 'POST', headers: { 'X-Site-Token': siteToken || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass }) });
                const data = await res.json();
                if (data.success) { token = data.token; localStorage.setItem('matrix_token', token); closeModals(); checkAdminState(); } 
                else alert(data.msg);
            } catch (e) { alert("网络错误"); }
        }

        function switchTab(tab) {
            document.getElementById('view-dash').style.display = tab === 'dash' ? 'block' : 'none';
            document.getElementById('view-manage').style.display = tab === 'manage' ? 'block' : 'none';
            document.getElementById('tab-btn-dash').className = tab === 'dash' ? 'nav-tab active' : 'nav-tab';
            if(token) document.getElementById('tab-btn-manage').className = tab === 'manage' ? 'nav-tab active' : 'nav-tab';
        }

        function setFilter(type) {
            currentFilter = type;
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('filter-' + type).classList.add('active');
            renderDashboard();
        }

        async function loadDashboard() {
            try {
                const res = await fetch('/api/accounts', { headers: { 'X-Site-Token': siteToken || '' } });
                if (res.status === 403) { localStorage.removeItem('site_token'); window.location.replace('/login.html'); return; }
                allAccountsCache = await res.json();
                renderDashboard();
            } catch(e) {}
        }

        function renderDashboard() {
            if(!Array.isArray(allAccountsCache)) return;
            const listContainer = document.getElementById('account-list');
            let html = '';
            const filteredAccounts = allAccountsCache.filter(acc => acc.type === currentFilter);

            if (filteredAccounts.length === 0) {
                listContainer.innerHTML = `<div style="text-align:center; color:#64748b; padding: 40px; background:var(--panel); border-radius:10px; border:1px solid #1e293b;">该平台下暂未接入账号</div>`;
                return;
            }

            filteredAccounts.forEach(acc => {
                const platformTag = acc.type === '5E' ? '5E 对战平台' : (acc.type === '绿色' ? '完美世界 (绿色)' : '完美世界 (老兵)');
                const hasPerfectInfo = acc.rank === 'synced';
                let rankDisplay = `⚡ ${platformTag} · 数据待同步`;
                if (hasPerfectInfo) rankDisplay = `🏅 完美用户信息`;
                else if (acc.rank) rankDisplay = `🏅 ${acc.rank}`;
                const perfectName = acc.perfect_name || '';
                const perfectElo = acc.elo || '';
                const lastPlayed = acc.last_played || '';

                html += `
                <div class="card">
                    <div class="card-header">
                        <div class="card-header-left">
                            <div class="card-actions">
                                <span class="rank-tag">${rankDisplay}</span>
                                <button class="data-chip" onclick="testAccount(event, '${acc.username}')">🔄 获取数据</button>
                            </div>
                            <div class="perfect-info">
                                <div class="perfect-info-title">完美用户信息</div>
                                <div class="perfect-info-grid">
                                    <div>
                                        <div class="perfect-info-label">用户名称</div>
                                        <div class="perfect-info-value">${perfectName}</div>
                                    </div>
                                    <div>
                                        <div class="perfect-info-label">ELO</div>
                                        <div class="perfect-info-value">${perfectElo}</div>
                                    </div>
                                    <div>
                                        <div class="perfect-info-label">最后一次游玩</div>
                                        <div class="perfect-info-value">${lastPlayed}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <span class="status-badge status-online">✅ 监控中</span>
                    </div>
                    <div class="info-group">
                        <div class="info-row">
                            <span class="info-label">账号</span>
                            <span class="info-value">${acc.username}</span>
                            <button class="copy-btn" onclick="copyText('${acc.username}', this)">复制</button>
                        </div>
                        <div class="info-row">
                            <span class="info-label">密码</span>
                            <span class="info-value mono hover-secret">${acc.password || '未录入'}</span>
                            <button class="copy-btn" onclick="copyText('${acc.password || ''}', this)">复制</button>
                        </div>
                    </div>
                    <div class="token-zone">
                        <div id="code-${acc.username}" class="token-text"></div>
                        <div id="actions-${acc.username}" style="display: flex; gap: 10px;">
                            <button id="btn-${acc.username}" class="btn" onclick="unlock('${acc.username}')">获取 Steam 令牌</button>
                        </div>
                    </div>
                </div>`;
            });
            listContainer.innerHTML = html;
        }

        function copyText(text, btnElement) {
            if (!text) return;
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                const originalText = btnElement.innerText;
                btnElement.innerText = '已复制!'; btnElement.style.color = 'var(--success)'; btnElement.style.borderColor = 'var(--success)';
                setTimeout(() => { btnElement.innerText = originalText; btnElement.style.color = ''; btnElement.style.borderColor = ''; }, 2000);
            } catch (err) {}
            document.body.removeChild(textArea);
        }

        async function loadManage() {
            if(!token) return;
            try {
                const accounts = await apiCall('/api/admin-data');
                const tbody = document.getElementById('manage-tbody');
                tbody.innerHTML = accounts.map(acc => {
                    const tagColor = acc.type === '5E' ? '#eab308' : '#10b981';
                    return `<tr>
                        <td>${acc.username}</td>
                        <td class="mono">${acc.password || '未录入'}</td>
                        <td><span style="border: 1px solid ${tagColor}; color: ${tagColor}; padding:2px 8px; border-radius:4px; font-size:0.8em; font-weight:bold;">${acc.type}</span></td>
                        <td class="mono">${acc.currentKey}</td>
                        <td><button class="btn btn-danger" style="padding:6px 12px; font-size:0.8em;" onclick="deleteAcc('${acc.username}')">移除</button></td>
                    </tr>`}).join('');
            } catch(e){}
        }

        async function unlock(username) {
            try {
                const response = await fetch('/api/unlock', { method: 'POST', headers: { 'X-Site-Token': siteToken || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username }) });
                const data = await response.json();
                if (data.success) {
                    const codeDiv = document.getElementById('code-' + username);
                    const actionsDiv = document.getElementById('actions-' + username);
                    let remaining = Number(data.expiresIn) || 30;
                    if (tokenCountdownTimers[username]) clearInterval(tokenCountdownTimers[username]);

                    const renderToken = () => {
                        codeDiv.innerHTML = '';
                        const codeText = document.createElement('div');
                        codeText.className = 'token-code';
                        codeText.innerText = data.code;

                        const progressWrap = document.createElement('div');
                        progressWrap.className = 'token-progress-wrap';

                        const progress = document.createElement('div');
                        progress.className = 'token-progress';

                        const progressFill = document.createElement('div');
                        progressFill.className = 'token-progress-fill';

                        const timerText = document.createElement('div');
                        timerText.className = 'token-expire-text';

                        progress.appendChild(progressFill);
                        progressWrap.appendChild(progress);
                        progressWrap.appendChild(timerText);
                        codeDiv.appendChild(codeText);
                        codeDiv.appendChild(progressWrap);
                    };

                    const updateTokenProgress = () => {
                        const percent = Math.max(0, Math.min(100, (remaining / 30) * 100));
                        const progressFill = codeDiv.querySelector('.token-progress-fill');
                        const timerText = codeDiv.querySelector('.token-expire-text');
                        if (!progressFill || !timerText) return;

                        progressFill.style.width = percent + '%';
                        progressFill.style.backgroundColor = remaining <= 5 ? 'var(--danger)' : 'var(--success)';
                        timerText.innerText = remaining + ' 秒后过期';
                        timerText.style.color = remaining <= 5 ? 'var(--danger)' : '#94a3b8';
                    };

                    renderToken();
                    updateTokenProgress();
                    codeDiv.style.display = 'block'; 
                    actionsDiv.style.display = 'none'; 
                    tokenCountdownTimers[username] = setInterval(() => {
                        remaining -= 1;
                        if (remaining <= 0) {
                            clearInterval(tokenCountdownTimers[username]);
                            delete tokenCountdownTimers[username];
                            codeDiv.style.display = 'none';
                            actionsDiv.style.display = 'flex';
                            codeDiv.innerHTML = '';
                            return;
                        }
                        updateTokenProgress();
                    }, 1000);
                } else alert(`❌ ${data.msg}`);
            } catch(e) { alert("网络请求失败"); }
        }

        async function testAccount(event, username) {
            const btn = event.target;
            const originalText = btn.innerText;
            btn.innerText = "⏳ 正在同步..."; btn.disabled = true;
            try {
                const response = await fetch('/api/test-account', { method: 'POST', headers: { 'X-Site-Token': siteToken || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username }) });
                const data = await response.json();
                if (data.success) {
                    btn.innerText = "✅ 同步成功"; btn.style.color = "var(--success)";
                    setTimeout(() => { btn.innerText = originalText; btn.disabled = false; btn.style.color = ""; loadDashboard(); }, 2000);
                } else { alert(`❌ 获取失败：${data.msg || '未知错误'}`); btn.innerText = originalText; btn.disabled = false; }
            } catch (e) { btn.innerText = originalText; btn.disabled = false; }
        }

        async function deleteAcc(username) {
            if(!confirm(`危险操作！确认移除 ${username} 吗？`)) return;
            await apiCall('/api/delete-account', 'POST', { username });
            loadDashboard(); loadManage();
        }

        function openAddModal() { if(!token) return alert("仅管理员可添加！"); document.getElementById('add-modal').style.display = 'flex'; }
        function closeModals() { document.getElementById('add-modal').style.display='none'; document.getElementById('login-modal').style.display='none'; document.getElementById('step1').style.display='block'; }
        
        async function submitDirectAdd() {
            const user = document.getElementById('new-user').value, pass = document.getElementById('new-pass').value, secret = document.getElementById('new-secret').value, type = document.getElementById('new-type').value;
            if(!user || !secret) return alert("账号和 Shared Secret 为必填项！");
            let res = await apiCall('/api/add-account-basic', 'POST', { username: user, password: pass, type });
            if (!res.success && res.msg !== "账号已存在于矩阵中") return alert(res.msg);
            res = await apiCall('/api/bind-secret', 'POST', { username: user, shared_secret: secret });
            if (res.success) { alert("✅ 账号与令牌直接接入成功！"); closeModals(); loadDashboard(); loadManage(); } else alert(res.msg);
        }

        // 🌟 网页端注入生肉数据并呼叫终端协同
        async function startWebArmor() {
            const rawData = document.getElementById('web-raw-data').value;
            if (!rawData) return alert("请先粘贴需要处理的账号数据！");
            const term = document.getElementById('forge-terminal');
            term.style.display = 'block';
            term.innerHTML = `> 🚀 正在将 ${rawData.split('\n').filter(l=>l.trim()).length} 行数据传输至星舰引擎...`;
            
            try {
                let res = await apiCall('/api/save-raw', 'POST', { rawText: rawData });
                if(res.success) {
                    term.innerHTML += `<br>> ✅ 数据写入成功 (已存入 raw.txt)<br>> ⚠️ 协同指令：<span style="color:var(--success);">请前往服务器 SSH 终端，输入 <b>node batch_armor.js</b> 开始全自动锻造！</span>`;
                } else {
                    term.innerHTML += `<br>> ❌ 写入失败: ${res.msg}`;
                }
            } catch(e) {
                term.innerHTML += `<br>> ❌ 网络通信故障，请检查中枢。`;
            }
        }

        checkAdminState(); loadDashboard();
        setInterval(() => {
            if (Object.keys(tokenCountdownTimers).length === 0) loadDashboard();
            if(token && document.getElementById('view-manage').style.display === 'block') loadManage();
        }, 10000);
        setInterval(() => {
            const s = 30 - (Math.floor(Date.now() / 1000) % 30);
            const timerEl = document.getElementById('timer');
            if(timerEl) timerEl.innerText = s;
            if(s === 30 && token && document.getElementById('view-manage').style.display === 'block') loadManage();
        }, 1000);
