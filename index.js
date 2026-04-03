const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require("discord.js");
const express = require("express");

// ─────────────────────────────────────────────
//  CONFIG — غيّر هذه القيم
// ─────────────────────────────────────────────
const DISCORD_TOKEN   = process.env.DISCORD_TOKEN;   // توكن البوت
const CHANNEL_ID      = process.env.CHANNEL_ID;      // معرّف القناة اللي تعرض فيها القائمة
const ADMIN_ROLE_ID   = process.env.ADMIN_ROLE_ID;   // معرّف رول الأدمن
const ROBLOX_SECRET   = process.env.ROBLOX_SECRET;   // كلمة سر بين رويلكس والسيرفر
const PORT            = process.env.PORT || 3000;

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
const teams = {
  Police: {},   // { username: { joinTime: Date, displayName: string } }
  SWAT:   {},
};

let listMessageId = null; // معرّف الرسالة المثبّتة اللي نحدّثها

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function buildEmbed() {
  const now = Date.now();

  const buildTeamField = (teamName, emoji, color) => {
    const members = Object.entries(teams[teamName]);
    if (members.length === 0) {
      return { name: `${emoji} ${teamName} — لا أحد متواجد`, value: "—", inline: false };
    }
    const sorted = members.sort((a, b) => a[1].joinTime - b[1].joinTime);
    const lines = sorted.map(([user, info], i) => {
      const dur = formatDuration(now - info.joinTime);
      return `\`${String(i + 1).padStart(2, "0")}\` **${info.displayName}** — \`${dur}\``;
    });
    return {
      name: `${emoji} ${teamName} — متواجدون (${members.length})`,
      value: lines.join("\n"),
      inline: false,
    };
  };

  return new EmbedBuilder()
    .setTitle("📋 قائمة المتواجدين على الخريطة")
    .setColor(0x5865f2)
    .addFields(
      buildTeamField("Police", "🚔", 0x3498db),
      buildTeamField("SWAT",   "🔫", 0xe74c3c)
    )
    .setFooter({ text: "يتحدث تلقائياً عند كل تغيير" })
    .setTimestamp();
}

async function updateListMessage(client, reason = null) {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const embed = buildEmbed();

  if (listMessageId) {
    const msg = await channel.messages.fetch(listMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] });
      if (reason) {
        // إرسال إشعار مؤقت جانب القائمة
        const notif = await channel.send({ content: `> 🔔 ${reason}` });
        setTimeout(() => notif.delete().catch(() => {}), 8000);
      }
      return;
    }
  }

  // أول مرة — أرسل الرسالة واحفظ معرّفها
  const msg = await channel.send({ embeds: [embed] });
  listMessageId = msg.id;
  await msg.pin().catch(() => {});
}

// ─────────────────────────────────────────────
//  DISCORD CLIENT
// ─────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`✅ بوت شغّال: ${client.user.tag}`);

  // تسجيل slash commands
  const guild = client.guilds.cache.first();
  if (!guild) return;

  await guild.commands.set([
    {
      name: "onduty",
      description: "أظهر / حدّث قائمة المتواجدين الآن",
    },
    {
      name: "clearlist",
      description: "امسح قائمة تيم معين",
      options: [
        {
          name: "team",
          description: "اختر التيم",
          type: 3, // STRING
          required: true,
          choices: [
            { name: "Police", value: "Police" },
            { name: "SWAT",   value: "SWAT"   },
            { name: "الكل",   value: "all"    },
          ],
        },
      ],
    },
    {
      name: "setstatus",
      description: "أضف أو أزل لاعب يدوياً من القائمة",
      options: [
        {
          name: "action",
          description: "إضافة أو حذف",
          type: 3,
          required: true,
          choices: [
            { name: "إضافة",  value: "add"    },
            { name: "حذف",    value: "remove" },
          ],
        },
        {
          name: "team",
          description: "التيم",
          type: 3,
          required: true,
          choices: [
            { name: "Police", value: "Police" },
            { name: "SWAT",   value: "SWAT"   },
          ],
        },
        {
          name: "username",
          description: "اسم اللاعب في رويلكس",
          type: 3,
          required: true,
        },
      ],
    },
  ]);

  console.log("✅ Slash commands مسجّلة");
});

// ─────────────────────────────────────────────
//  SLASH COMMANDS HANDLER
// ─────────────────────────────────────────────
function hasAdminRole(member) {
  if (!ADMIN_ROLE_ID) return member.permissions.has(PermissionsBitField.Flags.Administrator);
  return member.roles.cache.has(ADMIN_ROLE_ID);
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member } = interaction;

  if (!hasAdminRole(member)) {
    return interaction.reply({ content: "❌ ما عندك صلاحية تستخدم هذا الأمر.", ephemeral: true });
  }

  if (commandName === "onduty") {
    await updateListMessage(client);
    return interaction.reply({ content: "✅ تم تحديث القائمة.", ephemeral: true });
  }

  if (commandName === "clearlist") {
    const team = interaction.options.getString("team");
    if (team === "all") {
      teams.Police = {};
      teams.SWAT   = {};
    } else {
      teams[team] = {};
    }
    await updateListMessage(client, `تم مسح قائمة ${team === "all" ? "الكل" : team} بواسطة ${member.user.username}`);
    return interaction.reply({ content: `✅ تم مسح قائمة **${team}**.`, ephemeral: true });
  }

  if (commandName === "setstatus") {
    const action   = interaction.options.getString("action");
    const team     = interaction.options.getString("team");
    const username = interaction.options.getString("username");

    if (action === "add") {
      teams[team][username] = { joinTime: Date.now(), displayName: username };
      await updateListMessage(client, `${username} أُضيف يدوياً إلى ${team}`);
      return interaction.reply({ content: `✅ تمت إضافة **${username}** إلى ${team}.`, ephemeral: true });
    } else {
      delete teams[team][username];
      await updateListMessage(client, `${username} حُذف يدوياً من ${team}`);
      return interaction.reply({ content: `✅ تم حذف **${username}** من ${team}.`, ephemeral: true });
    }
  }
});

// ─────────────────────────────────────────────
//  HTTP SERVER (يستقبل من رويلكس)
// ─────────────────────────────────────────────
const app = express();
app.use(express.json());

// Middleware للتحقق من كلمة السر
function authMiddleware(req, res, next) {
  const secret = req.headers["x-roblox-secret"];
  if (ROBLOX_SECRET && secret !== ROBLOX_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// رويلكس يرسل هنا قائمة اللاعبين الكاملة كل 5 ثوانٍ
// Body: { players: [ { username, displayName, team, joinTime } ] }
app.post("/update", authMiddleware, async (req, res) => {
  const { players } = req.body;
  if (!Array.isArray(players)) return res.status(400).json({ error: "players must be array" });

  const prevState = {
    Police: { ...teams.Police },
    SWAT:   { ...teams.SWAT   },
  };

  // أعد بناء الحالة من الصفر
  teams.Police = {};
  teams.SWAT   = {};

  for (const p of players) {
    if (!["Police", "SWAT"].includes(p.team)) continue;
    // احتفظ بـ joinTime القديم لو الشخص كان موجود
    const oldEntry = prevState[p.team][p.username];
    teams[p.team][p.username] = {
      displayName: p.displayName || p.username,
      joinTime: oldEntry ? oldEntry.joinTime : (p.joinTime ? new Date(p.joinTime).getTime() : Date.now()),
    };
  }

  // تحقق إذا في تغيير
  const changes = [];
  for (const team of ["Police", "SWAT"]) {
    for (const u of Object.keys(prevState[team])) {
      if (!teams[team][u]) changes.push(`${prevState[team][u].displayName} غادر ${team}`);
    }
    for (const u of Object.keys(teams[team])) {
      if (!prevState[team][u]) changes.push(`${teams[team][u].displayName} انضم إلى ${team}`);
    }
  }

  if (changes.length > 0) {
    await updateListMessage(client, changes.join(" | "));
  }

  res.json({ ok: true, police: Object.keys(teams.Police).length, swat: Object.keys(teams.SWAT).length });
});

// Health check
app.get("/", (_, res) => res.json({ status: "online" }));

app.listen(PORT, () => console.log(`🌐 HTTP Server شغّال على port ${PORT}`));
client.login(DISCORD_TOKEN);
