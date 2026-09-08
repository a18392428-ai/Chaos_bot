const fs = require('fs');

const ANTICALL_PATH = './data/anticall.json';

function readState() {
    try {
        if (!fs.existsSync(ANTICALL_PATH)) return { enabled: false };
        const raw = fs.readFileSync(ANTICALL_PATH, 'utf8');
        const data = JSON.parse(raw || '{}');
        return { enabled: !!data.enabled };
    } catch {
        return { enabled: false };
    }
}

function writeState(enabled) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        fs.writeFileSync(ANTICALL_PATH, JSON.stringify({ enabled: !!enabled }, null, 2));
    } catch {}
}

async function anticallCommand(sock, chatId, message, args) {
    const state = readState();
    const sub = (args || '').trim().toLowerCase();

    // التحقق من المدخلات أو عرض قائمة المساعدة باللغة العربية
    if (!sub || (sub !== 'on' && sub !== 'off' && sub !== 'status' && sub !== 'تشغيل' && sub !== 'ايقاف' && sub !== 'حالة')) {
        await sock.sendMessage(chatId, { text: '*🛡️ نظام منع المكالمات (chaos-bot)*\n\n.منع-المكالمات تشغيل  - لتفعيل الحظر التلقائي للمكالمات الواردة\n.منع-المكالمات ايقاف - لإلغاء تفعيل منع المكالمات\n.منع-المكالمات حالة - لعرض الحالة الحالية' }, { quoted: message });
        return;
    }

    if (sub === 'status' || sub === 'حالة') {
        await sock.sendMessage(chatId, { text: `حالة منع المكالمات في *chaos-bot* هي: *${state.enabled ? 'مفعل 🟢' : 'معطل 🔴'}*.` }, { quoted: message });
        return;
    }

    const enable = (sub === 'on' || sub === 'تشغيل');
    writeState(enable);
    await sock.sendMessage(chatId, { text: `تم ${enable ? 'تفعيل (تشغيل)' : 'إلغاء تفعيل (إيقاف)'} نظام منع المكالمات بنجاح في *chaos-bot*.` }, { quoted: message });
}

module.exports = { anticallCommand, readState };
