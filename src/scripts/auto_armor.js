const fs = require('fs');
const path = require('path');
const { LoginSession, EAuthTokenPlatformType } = require('steam-session');
const SteamCommunity = require('steamcommunity');
const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });

const ask = (query) => new Promise(resolve => readline.question(query, resolve));
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'accounts.json');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function forgeArmor() {
    console.log("=========================================");
    console.log("   🛡️ MATRIX 矩阵装甲锻造车间已启动");
    console.log("=========================================\n");

    let accounts = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

    // 寻找一个还没有绑令牌的号
    let targetAcc = accounts.find(a => !a.shared_secret);
    if (!targetAcc) {
        console.log("✅ 报告指挥官，账本中所有账号均已装备令牌装甲！");
        process.exit();
    }

    console.log(`🚀 锁定目标裸奔号: [${targetAcc.username}]`);
    let session = new LoginSession(EAuthTokenPlatformType.MobileApp);

    try {
        // 1. 登录 Steam (裸奔号直接进)
        console.log("-> 正在突破 Steam 登录防线...");
        await new Promise((resolve, reject) => {
            session.on('authenticated', resolve);
            session.on('error', reject);
            session.startWithCredentials({ accountName: targetAcc.username, password: targetAcc.password }).catch(reject);
        });

        console.log("-> 🔓 登录成功！获取底层权限...");
        let webCookies = await session.getWebCookies();
        let community = new SteamCommunity();
        community.setCookies(webCookies);
        // 关键：接管手机 App 权限
        community.setMobileAppAccessToken(session.accessToken); 

        // 2. 检查并绑定手机号
        let hasPhone = await new Promise((resolve, reject) => {
            community.hasPhone((err, hasPhone) => err ? reject(err) : resolve(hasPhone));
        });

        if (!hasPhone) {
            console.log("\n⚠️ 检测到账号未绑定手机，触发前置绑定程序！");
            let phoneNum = await ask("👉 请输入用于绑定的手机号 (需带国家代码，如 +8613800138000): ");
            
            await new Promise((resolve, reject) => {
                community.addPhoneNumber(phoneNum, (err) => err ? reject(err) : resolve());
            });

            let smsCode1 = await ask("👉 短信已发送！请输入用于【绑定手机】的 6 位短信验证码: ");
            await new Promise((resolve, reject) => {
                community.verifyPhoneNumber(smsCode1, (err) => err ? reject(err) : resolve());
            });
            console.log("-> ✅ 手机号绑定成功！");
        } else {
            console.log("-> 📱 账号已绑定手机，直接进入令牌生成阶段。");
        }

        // 3. 核心：申请开启双重验证，获取 Shared Secret
        console.log("\n-> ⚙️ 正在向 Steam 申请最高级别的令牌种子...");
        let bindRes = await new Promise((resolve, reject) => {
            community.enableTwoFactor((err, response) => err ? reject(err) : resolve(response));
        });

        console.log(`-> 🔑 成功截获未激活的种子: ${bindRes.shared_secret}`);
        console.log(`-> 🚨 注意！Steam 刚才向你的手机发送了另一条带有【激活码】的短信。`);

        // 4. 提交激活码，焊死后门
        let smsCode2 = await ask("👉 请输入包含在短信中的【5位激活码】(如 R3X9T): ");
        await new Promise((resolve, reject) => {
            community.finalizeTwoFactor(bindRes.shared_secret, smsCode2, (err) => err ? reject(err) : resolve());
        });

        // 5. 写入矩阵账本
        targetAcc.shared_secret = bindRes.shared_secret;
        // 把最重要的解绑代码(R码)也存下来以防万一
        targetAcc.revocation_code = bindRes.revocation_code; 
        
        fs.writeFileSync(DB_PATH, JSON.stringify(accounts, null, 2));
        
        console.log(`\n=========================================`);
        console.log(`🎉 锻造成功！账号 [${targetAcc.username}] 已被矩阵永久接管！`);
        console.log(`🛡️ 救援代码 (R码): ${bindRes.revocation_code} (请妥善保管)`);
        console.log(`=========================================\n`);

    } catch (e) {
        console.log(`\n❌ 锻造失败: ${e.message}`);
    }
    process.exit();
}

forgeArmor();
