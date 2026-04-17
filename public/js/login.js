const form = document.getElementById('login-form');
const message = document.getElementById('login-message');

const existingToken = localStorage.getItem('site_token');
if (existingToken) {
    fetch('/api/site-session', { headers: { 'X-Site-Token': existingToken } })
        .then((response) => {
            if (response.ok) {
                window.location.replace('/');
                return;
            }

            localStorage.removeItem('site_token');
        })
        .catch(() => localStorage.removeItem('site_token'));
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.innerText = '';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/site-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (!data.success) {
            message.innerText = data.msg || '登录失败';
            return;
        }

        localStorage.setItem('site_token', data.token);
        window.location.replace('/');
    } catch (error) {
        message.innerText = '网络错误，请稍后再试';
    }
});
