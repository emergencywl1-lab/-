const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const https = require('https');
const http = require('http');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const UNIVERSE_ID = process.env.UNIVERSE_ID;
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY;
const ROBLOX_SECRET = process.env.ROBLOX_SECRET;

// روم لكل فريق + روم الكل - عدّلها
const CHANNELS = {
    Police: process.env.CHANNEL_POLICE,
    SWAT: process.env.CHANNEL_SWAT,
    Civilian: process.env.CHANNEL_CIVILIAN,
    all: process.env.CHANNEL_ALL
};

// ID الرسائل المثبتة عشان نعدّل عليها
const pinnedMessages = {
    Police: null,
    SWAT: null,
    Civilian: null,
    all: null
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function sendToRoblox(data) {
    const body = JSON.stringify({
        message: JSON.stringify({ secret: ROBLOX_SECRET, ...data })
    });
    const options = {
        hostname: 'apis.roblox.com',
        path: `/messaging-service/v1/universes/${UNIVERSE_ID}/topics/DiscordCommands`,
        method: 'POST',
        headers: {
            'x-api-key': ROBLOX_API_KEY,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    };
    const req = https.request(options);
    req.on('error', e => console.error('خطأ:', e));
    req.write(body);
    req.end();
}

// استقبال بيانات من Roblox عبر polling
function pollRoblox() {
    const options = {
        hostname: 'apis.roblox.com',
        path: `/messaging-service/v1/universes/${UNIVERSE_ID}/topics/RobloxToDiscord`,
        method: 'GET',
        headers: { 'x-api-key': ROBLOX_API_KEY }
    };
    // ملاحظة: Roblox لا يدعم polling مباشر
    // نستخدم نظام push من Roblox
}

function buildTeamEmbed(teamName, members) {
    const colors = { Police: 0x3498DB, SWAT: 0x2ECC71, Civilian: 0xE67E22 };
    const emojis = { Police: '👮', SWAT: '🪖', Civilian: '👤' };

    const embed = new EmbedBuilder()
        .setTitle(`${emojis[teamName] || '👥'} فريق ${teamName}`)
        .setColor(colors[teamName] || 0x5865F2)
        .setTimestamp();

    if (members.length === 0) {
        embed.setDescription('لا يوجد أعضاء متواجدين حالياً');
    } else {
        const list = members.map((m, i) => `${i + 1}. ${m}`).join('\n');
        embed.setDescription(list);
        embed.setFooter({ text: `المجموع: ${members.length} لاعب` });
    }
    return embed;
}

function buildAllEmbed(teams) {
    const emojis = { Police: '👮', SWAT: '🪖', Civilian: '👤' };
    const embed = new EmbedBuilder()
        .setTitle('📊 إحصائيات الفرق')
        .setColor(0x5865F2)
        .setTimestamp();

    let total = 0;
    for (const [team, members] of Object.entries(teams)) {
        total += members.length;
        embed.addFields({
            name: `${emojis[team] || '👥'} ${team} (${members.length})`,
            value: members.length > 0 ? members.join(', ') : 'لا يوجد',
            inline: false
        });
    }
    embed.setFooter({ text: `إجمالي اللاعبين: ${total}` });
    return embed;
}

async function updateMessage(channelId, messageId, embed) {
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) return null;

        if (messageId) {
            try {
                const msg = await channel.messages.fetch(messageId);
                await msg.edit({ embeds: [embed] });
                return messageId;
            } catch {
                // الرسالة انحذفت، نرسل جديدة
            }
        }
        const sent = await channel.send({ embeds: [embed] });
        return sent.id;
    } catch (e) {
        console.error('خطأ في تحديث الرسالة:', e);
        return null;
    }
}

// تسجيل الأوامر
const commands = [
    new SlashCommandBuilder()
        .setName('staff')
        .setDescription('عرض المتواجدين في فريق معين')
        .addStringOption(opt =>
            opt.setName('team')
                .setDescription('اسم الفريق')
                .setRequired(true)
                .addChoices(
                    { name: 'Police', value: 'Police' },
                    { name: 'SWAT', value: 'SWAT' },
                    { name: 'Civilian', value: 'Civilian' }
                )
        ),
    new SlashCommandBuilder()
        .setName('allstaff')
        .setDescription('عرض جميع الفرق ومتواجديها')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log(`✅ البوت شغال: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'staff') {
        const team = interaction.options.getString('team');
        await interaction.reply({ content: `⏳ جاري جلب بيانات ${team}...`, ephemeral: true });
        sendToRoblox({ type: 'get_team', teamName: team });
    }

    if (interaction.commandName === 'allstaff') {
        await interaction.reply({ content: '⏳ جاري جلب بيانات جميع الفرق...', ephemeral: true });
        sendToRoblox({ type: 'get_all' });
    }
});

// استقبال بيانات من Roblox عبر webhook endpoint
const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/roblox') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                if (data.secret !== ROBLOX_SECRET) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return;
                }

                if (data.type === 'team_response' || data.type === 'auto_update_team') {
                    const team = data.teamName;
                    const channelId = CHANNELS[team];
                    if (channelId) {
                        const embed = buildTeamEmbed(team, data.members || []);
                        pinnedMessages[team] = await updateMessage(channelId, pinnedMessages[team], embed);
                    }
                }

                if (data.type === 'all_response' || data.type === 'auto_update') {
                    // تحديث روم الكل
                    const channelId = CHANNELS.all;
                    if (channelId) {
                        const embed = buildAllEmbed(data.teams || {});
                        pinnedMessages.all = await updateMessage(channelId, pinnedMessages.all, embed);
                    }

                    // تحديث كل روم فريق
                    for (const [team, members] of Object.entries(data.teams || {})) {
                        const channelId = CHANNELS[team];
                        if (channelId) {
                            const embed = buildTeamEmbed(team, members);
                            pinnedMessages[team] = await updateMessage(channelId, pinnedMessages[team], embed);
                        }
                    }
                }

                res.writeHead(200);
                res.end('OK');
            } catch (e) {
                console.error(e);
                res.writeHead(500);
                res.end('Error');
            }
        });
    } else {
        res.writeHead(200);
        res.end('Bot is running!');
    }
});

server.listen(3000);
client.login(TOKEN);
