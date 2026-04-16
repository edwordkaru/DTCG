const axios = require('axios');
const fs = require('fs');
const path = require('path');

const IMG_DIR = path.join(__dirname, 'img');
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR);

async function downloadImage(url, filePath) {
    try {
        const response = await axios({ method: 'GET', url, responseType: 'stream', timeout: 10000 });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
    } catch (e) { console.log(`❌ 下载失败: ${url}`); }
}

async function start() {
    console.log("🚀 正在抓取完整卡牌数据（含费用、等级等）...");
    try {
        const res = await axios.get('https://digimoncard.io/api-public/search.php?n=&series=Digimon%20Card%20Game');
        const cards = res.data;

        const localDatabase = [];

        for (const card of cards) {
            const rawId = card.cardnumber || card.id;
            if (!rawId) continue;

            const safeId = rawId.replace(/\//g, '-');
            const fileName = `${safeId}.jpg`;
            const filePath = path.join(IMG_DIR, fileName);

            const remoteUrl = card.image_url || `https://images.digimoncard.io/images/cards/${rawId}.jpg`;
            if (!fs.existsSync(filePath)) {
                try { await downloadImage(remoteUrl, filePath); } catch (e) {}
            }

            localDatabase.push({
                id: rawId,
                name: card.name,
                type: (card.type || 'unknown').toLowerCase(),
                level: card.level || null,
                playCost: card.play_cost || 0,
                digivolveCost: card.evolution_cost || 0,
                color: card.color || null,
                dp: card.dp || null,
                img: `/img/${fileName}`,
                mainEffect: card.main_effect || "",
                sourceEffect: card.source_effect || ""
            });
        }

        fs.writeFileSync('cards.json', JSON.stringify(localDatabase, null, 2));
        console.log(`✨ 完成！共保存 ${localDatabase.length} 张卡，cards.json 已更新（含费用字段）`);
    } catch (error) {
        console.error("错误:", error.message);
    }
}

start();