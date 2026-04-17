const fs = require('fs');
const path = require('path');
const { LoginSession, EAuthTokenPlatformType } = require('steam-session');
const SteamCommunity = require('steamcommunity');
const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });

const ask = (query) => new Promise(resolve => readline.question(query, resolve));
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'accounts.json');
const RAW_PATH = path.join(__dirname, '..', '..', 'data', 'raw.txt');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runBatchArmor() {
    console.log("=========================================");
    console.log("   🛡️ MATRIX 批量装甲锻造车间已启动");
    console.log("=========================================\n");

    // 1. 读取并解析生肉账号 (raw.txt)
    if (!fs.existsSync(RAW_PATH)) {
        console.log("❌ 找不到 raw.txt！请在同目录下创建它并粘贴账号。");
        process.exit();
    }
    const rawText = fs.readFileSync(RAW_PATH, 'utf8');
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
    
    let parsedAccounts = [];
    for (let line of lines) {
        // 🌟 智能提取优化：自动从复杂的文本中精准抓取 Steam 账密
        let userMatch = line.match(/Steam账号[:：]?([a-zA-Z0-9_]+)/);
        let passMatch = line.match(/Steam密码[:：]?([a-zA-Z0-9_A-Za-z]+)/);
        
        if (userMatch && passMatch) {
            parsedAccounts.push({
                username: userMatch[1],
                password: passMatch[1],
                type: "5E", // 默认归类
                shared_secret: ""
            });
        } else {
            // 兼容最简单的 "账号----密码" 格式
            let parts = line.split('----');
            if (parts.length >= 2) {
                parsedAccounts.push({
                    username: parts[0].trim(),
                    password: parts[1].trim(),
                    type: "5E",
                    shared_secret: ""
                });
            }
        }
    }
    console.log(`📦 成功解析 ${parsedAccounts.length} 个 Steam 账号准备锻造！\n`);

    // 2. 加载现有的矩阵账本
    let dbAccounts = [];
    if (fs.existsSync(DB_PATH)) {
        dbAccounts = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }

    // 3. 核心循环：无情推进
    for (let i = 0; i < parsedAccounts.length; i++) {
        let acc = parsedAccounts[i];
        console.log(`\n=========================================`);
        console.log(`[${i + 1}/${parsedAccounts.length}] 🚀 开始处理账号: [${acc.username}]`);

        // 检查是否已经锻造过
        let existingIndex = dbAccounts.findIndex(a => a.username === acc.username);
        if (existingIndex !== -1 && dbAccounts[existingIndex].shared_secret) {
            console.log(`-> ⏩ 该账号已存在于矩阵并拥有令牌，自动跳过！`);
            continue;
        }

        // 🌟 核心防御装甲：Try-Catch 异常捕获
        try {
            let session = new LoginSession(EAuthTokenPlatformType.MobileApp);
            console.log("-> 正在突破 Steam 登录防线...");
            
            await new Promise((resolve, reject) => {
                session.on('authenticated', resolve);
                session.on('error', reject); 
                session.startWithCredentials({ accountName: acc.username, password: acc.password }).catch(reject);
            });

            console.log("-> 🔓 登录成功！获取底层控制权...");
            let webCookies = await session.getWebCookies();
            let community = new SteamCommunity();
            community.setCookies(webCookies);
            community.setMobileAppAccessToken(session.accessToken); 

            let bindRes;
            try {
                // 战术变更：不检查手机，直接强行申请令牌
                console.log("-> ⚙️ 正在直接向 Steam 申请令牌种子...");
                bindRes = await new Promise((resolve, reject) => {
                    community.enableTwoFactor((err, response) => err ? reject(err) : resolve(response));
                });
            } catch (err) {
                // 如果申请失败，99%是因为这是纯“裸奔号”，没绑手机
                console.log(`-> ⚠️ 申请受阻 (${err.message})。检测到账号未绑定手机！`);
                console.log("-> 🔄 自动切换至【前置手机绑定】流程...");
                
                let phoneNum = await ask("👉 请输入用于绑定的手机号 (带国家代码如 +86138...): ");
                await new Promise((resolve, reject) => {
                    community.addPhoneNumber(phoneNum, (err) => err ? reject(err) : resolve());
                });
                let smsCode1 = await ask("👉 短信已发送！请输入【绑定手机】的 6 位验证码: ");
                await new Promise((resolve, reject) => {
                    community.verifyPhoneNumber(smsCode1, (err) => err ? reject(err) : resolve());
                });
                console.log("-> ✅ 手机号绑定成功！");

                // 手机绑完，再次申请令牌
                console.log("-> ⚙️ 再次申请令牌种子...");
                bindRes = await new Promise((resolve, reject) => {
                    community.enableTwoFactor((err, response) => err ? reject(err) : resolve(response));
                });
            }

            console.log(`-> 🔑 成功截获令牌种子！准备终极激活...`);
            let smsCode2 = await ask("👉 请输入带有【5位激活码】的短信 (如 R3X9T): ");
            await new Promise((resolve, reject) => {
                community.finalizeTwoFactor(bindRes.shared_secret, smsCode2, (err) => err ? reject(err) : resolve());
            });

            // 如果成功，写入/更新账本
            if (existingIndex !== -1) {
                dbAccounts[existingIndex].shared_secret = bindRes.shared_secret;
                dbAccounts[existingIndex].password = acc.password; // 更新密码
            } else {
                acc.shared_secret = bindRes.shared_secret;
                dbAccounts.push(acc);
            }
            
            fs.writeFileSync(DB_PATH, JSON.stringify(dbAccounts, null, 2));
            console.log(`🎉 锻造大成功！账号 [${acc.username}] 已存入矩阵核心！`);

        } catch (e) {
            console.log(`❌ 账号突破失败: ${e.message}`);
            console.log(`-> ⏭️ 标记为坏件，自动放弃，准备处理下一个...`);
        }

        // ⚠️ 这是你刚才不小心删掉的代码
        await sleep(3000); 
    }

    console.log(`\n=========================================`);
    console.log(`🏁 所有批处理任务执行完毕！去检查你的矩阵面板吧！`);
    process.exit();
}

runBatchArmor();
