const { handleAntiBadwordCommand } = require('../lib/antibadword');
const isAdminHelper = require('../lib/isAdmin');

async function antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '```هذا الأمر مخصص لمشرفي المجموعات فقط!```' }, { quoted: message });
            return;
        }

        // استخراج النص أو الأمر المرسل
        const text = message.message?.conversation || 
                    message.message?.extendedTextMessage?.text || '';
        const match = text.split(' ').slice(1).join(' ');

        await handleAntiBadwordCommand(sock, chatId, message, match);
    } catch (error) {
        console.error('خطأ في أمر منع الكلمات البذيئة (chaos-bot):', error);
        await sock.sendMessage(chatId, { text: '*حدث خطأ أثناء معالجة أمر منع الكلمات البذيئة*' }, { quoted: message });
    }
}

module.exports = antibadwordCommand;
