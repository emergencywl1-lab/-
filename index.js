const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require("discord.js");
const express = require("express");

// ─── CONFIG ─────────────────────────
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID    = process.env.CHANNEL_ID;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const ROBLOX_SECRET = process.env.ROBLOX_SECRET;
const PORT          = process.env.PORT || 3000;

// ─── STATE ──────────────────────────
const teams = {
  Police: {},
  SWAT:   {},
};

let listMessageId = null;

// ─── HELPERS ────────────────────────
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function buildEmbed() {
  const now = Date.now();

  const buildTeamField = (teamName, emoji) => {
    const members = Object.entries(teams[teamName]);

    if (members.length === 0) {
      return { name: `${emoji} ${teamName} — لا أحد متواجد`, value: "—" };
    }

    const sorted = members.sort((a, b) => a[1].joinTime - b[1].joinTime);

    const lines = sorted.map(([user, info], i) => {
      const dur = formatDuration(now - info.joinTime);
      return `\`${i + 1}\` **${info.displayName}** — \`${dur}\``;
    });

    return {
      name: `${emoji} ${teamName} (${members.length})`,
      value: lines.join("\n"),
    };
  };

  return new EmbedBuilder()
    .setTitle("📋 قائمة المتواجدين")
    .setColor(0x5865f2)
    .addFields(
      buildTeamField("Police", "🚔"),
      buildTeamField("SWAT", "🔫")
    )
    .setTimestamp();
}

async function updateListMessage(client) {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const embed = buildEmbed();

  if (listMessageId) {
    const msg = await channel.messages.fetch(listMessageId).catch(() => null);
    if (msg) return msg.edit({ embeds: [embed] });
  }

  const msg = await channel.send({ embeds: [embed] });
  listMessageId = msg.id;
}

// ─── DISCORD ────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag}`);
});

function hasAdminRole(member) {
  if (!ADMIN_ROLE_ID) return member.permissions.has(PermissionsBitField.Flags.Administrator);
  return member.roles.cache.has(ADMIN_ROLE_ID);
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!hasAdminRole(interaction.member)) {
    return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });
  }

  if (interaction.commandName === "onduty") {
    await updateListMessage(client);
    return interaction.reply({ content: "✅ تم", ephemeral: true });
  }
});

// ─── SERVER ─────────────────────────
const app = express();
app.use(express.json());

function auth(req, res, next) {
  if (ROBLOX_SECRET && req.headers["x-roblox-secret"] !== ROBLOX_SECRET) {
    return res.sendStatus(401);
  }
  next();
}

app.post("/update", auth, async (req, res) => {
  const { players } = req.body;
  if (!Array.isArray(players)) return res.sendStatus(400);

  // إعادة بناء كاملة (حل مشكلة الحذف)
  teams.Police = {};
  teams.SWAT   = {};

  for (const p of players) {
    if (!["Police", "SWAT"].includes(p.team)) continue;

    teams[p.team][p.username] = {
      displayName: p.displayName || p.username,
      joinTime: new Date(p.joinTime).getTime(),
    };
  }

  await updateListMessage(client);
  res.json({ ok: true });
});

app.get("/", (_, res) => res.json({ status: "online" }));

app.listen(PORT, () => console.log("🌐 Server running"));
client.login(DISCORD_TOKEN);
