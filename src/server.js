const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const SteamTotp = require('steam-totp');
const { generateTimeBasedKey, generateFormattedKey } = require('./utils');

const app = express();
const port = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, '..', 'data', 'accounts.json');
const RAW_PATH = path.join(__dirname, '..', 'data', 'raw.txt');
const USERS_PATH = path.join(__dirname, '..', 'data', 'users.json');
const MATRIX_PASSWORD = 'M9#xK2$vP7@qL5*jW8&c';
const siteSessions = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function getAccounts() {
    const raw = fs.readFileSync(DB_PATH, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
}

function saveAccounts(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getUsers() {
    const raw = fs.readFileSync(USERS_PATH, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw);
}

function normalizeAccountType(type) {
    const typeMap = {
        '缁胯壊': '绿色',
        '鑰佸叺': '老兵'
    };

    return typeMap[type] || type;
}

function readUserInfoField(data, field) {
    if (!data || typeof data !== 'object') return '';
    if (data[field]) return data[field];

    if (Array.isArray(data)) {
        for (const item of data) {
            const value = readUserInfoField(item, field);
            if (value) return value;
        }
        return '';
    }

    for (const value of Object.values(data)) {
        const found = readUserInfoField(value, field);
        if (found) return found;
    }

    return '';
}

async function fetchPerfectUserInfo(account) {
    if (!account.pwasteamid || !account.wm_access_token) {
        throw new Error('missing pwasteamid or wm_access_token');
    }

    const response = await fetch('https://pwaweblogin.wmpvp.com/user-info', {
        method: 'POST',
        headers: {
            pwasteamid: account.pwasteamid,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ access_token: account.wm_access_token })
    });

    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error('invalid user-info response');
    }

    if (!response.ok || (data.code && data.code !== 0)) {
        throw new Error(data?.message || data?.msg || `user-info request failed: ${response.status}`);
    }

    const nickname = readUserInfoField(data, 'nickname');
    const uid = readUserInfoField(data, 'uid');

    if (!nickname || !uid) {
        throw new Error('user-info response missing nickname or uid');
    }

    return { nickname, uid };
}

const checkAuth = (req, res, next) => {
    const token = req.headers.authorization;
    if (token === MATRIX_PASSWORD) return next();
    return res.status(401).json({ success: false, msg: 'unauthorized' });
};

const checkSiteAuth = (req, res, next) => {
    const token = req.headers['x-site-token'];
    if (token && siteSessions.has(token)) return next();
    return res.status(403).json({ success: false, msg: 'site login required' });
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.post('/api/site-login', (req, res) => {
    const { username, password } = req.body;
    const user = getUsers().find((item) => item.username === username && item.password === password && item.enabled !== false);

    if (!user) {
        return res.json({ success: false, msg: '用户名或密码错误' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    siteSessions.set(token, {
        username: user.username,
        name: user.name || user.username,
        createdAt: Date.now()
    });

    return res.json({
        success: true,
        token,
        user: {
            username: user.username,
            name: user.name || user.username
        }
    });
});

app.get('/api/site-session', checkSiteAuth, (req, res) => {
    const session = siteSessions.get(req.headers['x-site-token']);
    res.json({ success: true, user: session });
});

app.use('/api', checkSiteAuth);

app.post('/api/login', (req, res) => {
    if (req.body.password === MATRIX_PASSWORD) {
        return res.json({ success: true, token: MATRIX_PASSWORD });
    }

    return res.json({ success: false, msg: 'wrong password' });
});

app.post('/api/add-account-basic', checkAuth, (req, res) => {
    const { username, password, type } = req.body;
    const accs = getAccounts();

    if (accs.find((a) => a.username === username)) {
        return res.json({ success: false, msg: 'account already exists' });
    }

    accs.push({
        username,
        password,
        type: normalizeAccountType(type),
        shared_secret: '',
        unlock_key: generateFormattedKey()
    });
    saveAccounts(accs);
    return res.json({ success: true, msg: 'account added' });
});

app.post('/api/bind-secret', checkAuth, (req, res) => {
    const { username, shared_secret } = req.body;
    const accs = getAccounts();
    const index = accs.findIndex((a) => a.username === username);

    if (index === -1) {
        return res.json({ success: false, msg: 'account not found' });
    }

    accs[index].shared_secret = shared_secret;
    saveAccounts(accs);
    return res.json({ success: true });
});

app.get('/api/accounts', (req, res) => {
    res.json(getAccounts().map((a) => ({
        username: a.username,
        password: a.password,
        type: normalizeAccountType(a.type),
        rank: a.rank,
        perfect_name: a.perfect_name,
        elo: a.elo,
        last_played: a.last_played,
        hasToken: !!a.shared_secret
    })));
});

app.get('/api/admin-data', checkAuth, (req, res) => {
    res.json(getAccounts().map((a) => ({
        username: a.username,
        password: a.password,
        type: normalizeAccountType(a.type),
        currentKey: generateTimeBasedKey(a.password)
    })));
});

app.post('/api/delete-account', checkAuth, (req, res) => {
    const accs = getAccounts().filter((a) => a.username !== req.body.username);
    saveAccounts(accs);
    res.json({ success: true });
});

app.post('/api/save-raw', checkAuth, (req, res) => {
    try {
        fs.writeFileSync(RAW_PATH, req.body.rawText, 'utf8');
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, msg: 'failed to write raw data' });
    }
});

app.post('/api/unlock', (req, res) => {
    const { username } = req.body;
    const acc = getAccounts().find((a) => a.username === username);

    if (!acc) {
        return res.json({ success: false, msg: 'account not found' });
    }

    if (!acc.shared_secret) {
        return res.json({ success: false, msg: 'account has no shared secret' });
    }

    try {
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = 30 - (now % 30);
        return res.json({
            success: true,
            code: SteamTotp.generateAuthCode(acc.shared_secret),
            expiresIn,
            window: Math.floor(now / 30),
            generatedAt: now
        });
    } catch (e) {
        return res.json({ success: false, msg: 'invalid shared secret' });
    }
});

app.post('/api/test-account', async (req, res) => {
    const { username } = req.body;
    const accounts = getAccounts();
    const index = accounts.findIndex((a) => a.username === username);

    if (index === -1) {
        return res.json({ success: false, msg: 'account not found' });
    }

    try {
        const userInfo = await fetchPerfectUserInfo(accounts[index]);
        accounts[index].perfect_name = userInfo.nickname;
        accounts[index].wm_uid = userInfo.uid;
        accounts[index].rank = 'synced';
        saveAccounts(accounts);
        return res.json({ success: true, nickname: userInfo.nickname, uid: userInfo.uid });
    } catch (e) {
        return res.json({ success: false, msg: e.message });
    }
});

app.listen(port, () => {
    console.log(`MATRIX server started on port ${port}`);
});
