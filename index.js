const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');
const http = require('http');

// ============ إعدادات - عدّلها ============
const TOKEN = process.env.TOKEN;           // توكن البوت
const CLIENT_ID = process.env.CLIENT_ID;  // ID البوت
const ANNOUNCE_CHANNEL = process.env.CHANNEL_ID; // ID روم الإعلانات
const ROBLOX_SECRET = process.env.ROBLOX_SECRET; // كلمة سر سرية بينك وبين Roblox
// ==========================================

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// تسجيل الأوامر
const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('افتح لوحة التحكم')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log(`✅ البوت شغال: ${client.user.tag}`);
});

// متغيرات الريستارت
let restartTimer = null;
let minutesLeft = 5;
let restartChannelId = null;

client.on('interactionCreate', async interaction => {

  // ===== أمر /panel =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'panel') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_announce').setLabel('📢 إرسال تنبيه').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_restart').setLabel('🔄 إعلان ريستارت').setStyle(ButtonStyle.Danger)
    );
    await interaction.reply({ content: '### 🎮 لوحة التحكم', components: [row], ephemeral: true });
  }

  // ===== زر التنبيه العام =====
  if (interaction.isButton() && interaction.customId === 'btn_announce') {
    const modal = new ModalBuilder().setCustomId('modal_announce').setTitle('📢 إرسال تنبيه');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('عنوان التنبيه').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('message').setLabel('نص التنبيه').setStyle(TextInputStyle.Paragraph).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('duration').setLabel('مدة العرض (بالثواني) - اتركه فاضي إذا ما تبي').setStyle(TextInputStyle.Short).setRequired(false)
      )
    );
    await interaction.showModal(modal);
  }

  // ===== إرسال التنبيه =====
  if (interaction.isModalSubmit() && interaction.customId === 'modal_announce') {
    const title = interaction.fields.getTextInputValue('title');
    const message = interaction.fields.getTextInputValue('message');
    const duration = interaction.fields.getTextInputValue('duration') || '0';

    const channel = client.channels.cache.get(ANNOUNCE_CHANNEL);
    const embed = new EmbedBuilder()
      .setTitle(`📢 ${title}`)
      .setDescription(message)
      .setColor(0x5865F2)
      .setFooter({ text: `أرسله: ${interaction.user.username}` })
      .setTimestamp();

    await channel.send({ content: '@everyone', embeds: [embed] });

    // أرسل للـ Roblox
    sendToRoblox({ type: 'announce', title, message, duration: parseInt(duration) });

    await interaction.reply({ content: '✅ تم إرسال التنبيه!', ephemeral: true });
  }

  // ===== زر الريستارت =====
  if (interaction.isButton() && interaction.customId === 'btn_restart') {
    restartChannelId = interaction.channelId;
    minutesLeft = 5;

    const channel = client.channels.cache.get(ANNOUNCE_CHANNEL);
    const embed = new EmbedBuilder()
      .setTitle('🔄 تنبيه ريستارت!')
      .setDescription('**ريستارت قادم بعد 5 دقائق!**\nجهّزوا أنفسكم وضعوا أغراضكم بالخزنة 🗃️')
      .setColor(0xFF0000)
      .setTimestamp();

    await channel.send({ content: '@everyone', embeds: [embed] });
    sendToRoblox({ type: 'restart_start', minutes: 5 });

    await interaction.reply({ content: '✅ بدأ العداد! سيتم إشعار الأعضاء كل دقيقة.', ephemeral: true });

    // عداد كل دقيقة
    restartTimer = setInterval(async () => {
      minutesLeft--;
      const ch = client.channels.cache.get(ANNOUNCE_CHANNEL);

      if (minutesLeft === 1) {
        const embed1 = new EmbedBuilder()
          .setTitle('⚠️ باقي دقيقة واحدة!')
          .setDescription('**سيتم سحب جميع اللاعبين للبداية لوضع الأغراض بالخزنة!**')
          .setColor(0xFF6600);
        await ch.send({ content: '@everyone', embeds: [embed1] });
        sendToRoblox({ type: 'restart_1min' });

      } else if (minutesLeft <= 0) {
        clearInterval(restartTimer);
        const embed0 = new EmbedBuilder()
          .setTitle('🔴 الريستارت الآن!')
          .setDescription('**جاري إعادة تشغيل جميع سيرفرات الماب...**')
          .setColor(0x000000);
        await ch.send({ content: '@everyone', embeds: [embed0] });
        sendToRoblox({ type: 'restart_now' });

      } else {
        const embedN = new EmbedBuilder()
          .setTitle(`⏳ باقي ${minutesLeft} دقائق على الريستارت`)
          .setColor(0xFFA500);
        await ch.send({ embeds: [embedN] });
        sendToRoblox({ type: 'restart_countdown', minutes: minutesLeft });
      }
    }, 60000); // كل دقيقة
  }
});

// ===== إرسال أوامر للـ Roblox عبر HTTP =====
function sendToRoblox(data) {
  const body = JSON.stringify({ secret: ROBLOX_SECRET, ...data });
  // هذا يحتاج Roblox HttpService - سنشرحه في الجزء الثاني
  console.log('📤 إرسال للـ Roblox:', body);
}

// سيرفر بسيط عشان Replit ما يوقف البوت
http.createServer((req, res) => res.end('Bot is running!')).listen(3000);

client.login(TOKEN);