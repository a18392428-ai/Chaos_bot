const fs = require('fs');
const path = require('path');
const { tmpdir } = require('os');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');

const messageStore = new Map();
const CONFIG_PATH = path.join(__dirname, '../data/antidelete.json');
const TEMP_MEDIA_DIR = path.join(__dirname, '../tmp');

// التأكد من وجود مجلد الملفات المؤقتة
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// دالة لحساب حجم المجلد بالميجابايت
const getFolderSizeInMB = (folderPath) => {
    try {
        const files = fs.readdirSync(folderPath);
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            if (fs.statSync(filePath).isFile()) {
                totalSize += fs.statSync(filePath).size;
            }
        }

        return totalSize / (1024 * 1024); // تحويل البايت إلى ميجابايت
    } catch (err) {
        console.error('خطأ في حساب حجم المجلد:', err);
        return 0;
    }
};

// دالة لتنظيف مجلد المؤقتات إذا تجاوز الحجم 200 ميجابايت
const cleanTempFolderIfLarge = () => {
    try {
        const sizeMB = getFolderSizeInMB(TEMP_MEDIA_DIR);
        
        if (sizeMB > 200) {
            const files = fs.readdirSync(TEMP_MEDIA_DIR);
            for (const file of files) {
                const filePath = path.join(TEMP_MEDIA_DIR, file);
                fs.unlinkSync(filePath);
            }
        }
    } catch (err) {
        console.error('خطأ في تنظيف مجلد المؤقتات:', err);
    }
};

// فحص وتنظيف دوري كل دقيقة
setInterval(cleanTempFolderIfLarge, 60 * 1000);

// قراءة الإعدادات
function loadAntideleteConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return { enabled: false };
        return JSON.parse(fs.readFileSync(CONFIG_PATH));
    } catch {
        return { enabled: false };
    }
}

// حفظ الإعدادات
function saveAntideleteConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error('خطأ في حفظ الإعدادات:', err);
    }
}

const isOwnerOrSudo = require('../lib/isOwner');

// معالج الأوامر
async function handleAntideleteCommand(sock, chatId, message, match) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
    
    if (!message.key.fromMe && !isOwner) {
        return sock.sendMessage(chatId, { text: '```هذا الأمر مخصص لمالك بوت (chaos-bot) فقط.```' }, { quoted: message });
    }

    const config = loadAntideleteConfig();

    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*🛡️ إعدادات منع الحذف (chaos-bot)*\n\nالحالة الحالية: ${config.enabled ? '✅ مفعل' : '❌ معطل'}\n\n*.منع-الحذف تشغيل* - لتفعيل النظام\n*.منع-الحذف ايقاف* - لإيقاف النظام`
        }, {quoted: message});
    }

    if (match === 'on' || match === 'تشغيل') {
        config.enabled = true;
    } else if (match === 'off' || match === 'ايقاف') {
        config.enabled = false;
    } else {
        return sock.sendMessage(chatId, { text: '*أمر غير صحيح. استخدم .منع-الحذف لمعرفة طريقة الاستخدام.*' }, {quoted:message});
    }

    saveAntideleteConfig(config);
    return sock.sendMessage(chatId, { text: `*تم ${config.enabled ? 'تفعيل' : 'إلغاء تفعيل'} نظام منع الحذف بنجاح في chaos-bot.*` }, {quoted:message});
}

// تخزين الرسائل الواردة (مع معالجة العرض لمرة واحدة الفورية)
async function storeMessage(sock, message) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return; // عدم التخزين إذا كان النظام معطلاً

        if (!message.key?.id) return;

        const messageId = message.key.id;
        let content = '';
        let mediaType = '';
        let mediaPath = '';
        let isViewOnce = false;

        const sender = message.key.participant || message.key.remoteJid;

        // اكتشاف المحتوى (بما في ذلك وسائط العرض لمرة واحدة)
        const viewOnceContainer = message.message?.viewOnceMessageV2?.message || message.message?.viewOnceMessage?.message;
        if (viewOnceContainer) {
            if (viewOnceContainer.imageMessage) {
                mediaType = 'image';
                content = viewOnceContainer.imageMessage.caption || '';
                const buffer = await downloadContentFromMessage(viewOnceContainer.imageMessage, 'image');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
                await writeFile(mediaPath, buffer);
                isViewOnce = true;
            } else if (viewOnceContainer.videoMessage) {
                mediaType = 'video';
                content = viewOnceContainer.videoMessage.caption || '';
                const buffer = await downloadContentFromMessage(viewOnceContainer.videoMessage, 'video');
                mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
                await writeFile(mediaPath, buffer);
                isViewOnce = true;
            }
        } else if (message.message?.conversation) {
            content = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            content = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage) {
            mediaType = 'image';
            content = message.message.imageMessage.caption || '';
            const buffer = await downloadContentFromMessage(message.message.imageMessage, 'image');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.jpg`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.stickerMessage) {
            mediaType = 'sticker';
            const buffer = await downloadContentFromMessage(message.message.stickerMessage, 'sticker');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.webp`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.videoMessage) {
            mediaType = 'video';
            content = message.message.videoMessage.caption || '';
            const buffer = await downloadContentFromMessage(message.message.videoMessage, 'video');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.mp4`);
            await writeFile(mediaPath, buffer);
        } else if (message.message?.audioMessage) {
            mediaType = 'audio';
            const mime = message.message.audioMessage.mimetype || '';
            const ext = mime.includes('mpeg') ? 'mp3' : (mime.includes('ogg') ? 'ogg' : 'mp3');
            const buffer = await downloadContentFromMessage(message.message.audioMessage, 'audio');
            mediaPath = path.join(TEMP_MEDIA_DIR, `${messageId}.${ext}`);
            await writeFile(mediaPath, buffer);
        }

        messageStore.set(messageId, {
            content,
            mediaType,
            mediaPath,
            sender,
            group: message.key.remoteJid.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString()
        });

        // توجيه رسائل العرض لمرة واحدة للمالك فوراً عند التقاطها
        if (isViewOnce && mediaType && fs.existsSync(mediaPath)) {
            try {
                const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const senderName = sender.split('@')[0];
                const mediaOptions = {
                    caption: `*👀 كشف عرض لمرة واحدة (${mediaType}) - chaos-bot*
المرسل: @${senderName}`,
                    mentions: [sender]
                };
                if (mediaType === 'image') {
                    await sock.sendMessage(ownerNumber, { image: { url: mediaPath }, ...mediaOptions });
                } else if (mediaType === 'video') {
                    await sock.sendMessage(ownerNumber, { video: { url: mediaPath }, ...mediaOptions });
                }
                try { fs.unlinkSync(mediaPath); } catch {}
            } catch (e) {
                // تجاهل الأخطاء
            }
        }

    } catch (err) {
        console.error('خطأ في تخزين الرسالة:', err);
    }
}

// معالجة حذف الرسائل
async function handleMessageRevocation(sock, revocationMessage) {
    try {
        const config = loadAntideleteConfig();
        if (!config.enabled) return;

        const messageId = revocationMessage.message.protocolMessage.key.id;
        const deletedBy = revocationMessage.participant || revocationMessage.key.participant || revocationMessage.key.remoteJid;
        const ownerNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        if (deletedBy.includes(sock.user.id) || deletedBy === ownerNumber) return;

        const original = messageStore.get(messageId);
        if (!original) return;

        const sender = original.sender;
        const senderName = sender.split('@')[0];
        const groupName = original.group ? (await sock.groupMetadata(original.group)).subject : '';

        const time = new Date().toLocaleString('en-US', {
            timeZone: 'Africa/Cairo',
            hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        let text = `*🔰 تقرير منع الحذف (chaos-bot) 🔰*\n\n` +
            `*🗑️ تم الحذف بواسطة:* @${deletedBy.split('@')[0]}\n` +
            `*👤 مرسل الرسالة:* @${senderName}\n` +
            `*📱 الرقم:* ${sender}\n` +
            `*🕒 الوقت:* ${time}\n`;

        if (groupName) text += `*👥 المجموعة:* ${groupName}\n`;

        if (original.content) {
            text += `\n*💬 الرسالة المحذوفة:*\n${original.content}`;
        }

        await sock.sendMessage(ownerNumber, {
            text,
            mentions: [deletedBy, sender]
        });

        // إرسال الوسائط المحذوفة
        if (original.mediaType && fs.existsSync(original.mediaPath)) {
            const mediaOptions = {
                caption: `*تم حذف ${original.mediaType}*\nالمرسل: @${senderName} (عبر chaos-bot)`,
                mentions: [sender]
            };

            try {
                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(ownerNumber, {
                            image: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'sticker':
                        await sock.sendMessage(ownerNumber, {
                            sticker: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'video':
                        await sock.sendMessage(ownerNumber, {
                            video: { url: original.mediaPath },
                            ...mediaOptions
                        });
                        break;
                    case 'audio':
                        await sock.sendMessage(ownerNumber, {
                            audio: { url: original.mediaPath },
                            mimetype: 'audio/mpeg',
                            ptt: false,
                            ...mediaOptions
                        });
                        break;
                }
            } catch (err) {
                await sock.sendMessage(ownerNumber, {
                    text: `⚠️ خطأ أثناء إرسال الوسائط: ${err.message}`
                });
            }

            // تنظيف الملف المؤقت
            try {
                fs.unlinkSync(original.mediaPath);
            } catch (err) {
                console.error('خطأ في تنظيف الوسائط:', err);
            }
        }

        messageStore.delete(messageId);

    } catch (err) {
        console.error('خطأ في معالجة استرجاع الرسائل المحذوفة:', err);
    }
}

module.exports = {
    handleAntideleteCommand,
    handleMessageRevocation,
    storeMessage
};
