const crypto = require('crypto');

/**
 * 根据种子和当前时间(30秒步长)生成 XXXX_XXXX_XXXX_XXXX_XXXX 格式密钥
 */
function generateTimeBasedKey(seed) {
    // 获取当前 30 秒的时间窗数值
    const timeWindow = Math.floor(Date.now() / 30000);
    
    // 使用 HMAC-SHA256 算法计算哈希
    const hmac = crypto.createHmac('sha256', seed);
    hmac.update(timeWindow.toString());
    const hash = hmac.digest('hex').toUpperCase();

    // 从哈希中提取字符并格式化
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 5; i++) {
        let segment = '';
        for (let j = 0; j < 4; j++) {
            // 每 4 位取一个字符
            const index = parseInt(hash.substr((i * 4 + j) * 2, 2), 16) % chars.length;
            segment += chars[index];
        }
        key += segment + (i < 4 ? '_' : '');
    }
    return key;
}

module.exports = { generateTimeBasedKey };
// 在文件末尾添加以下代码：
function generateFormattedKey() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 20; i++) {
        if (i > 0 && i % 4 === 0) key += '-';
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

// ⚠️ 替换最后一行的 module.exports：
module.exports = { generateTimeBasedKey, generateFormattedKey };
