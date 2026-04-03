const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const express = require("express");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const ROBLOX_SECRET = process.env.ROBLOX_SECRET;
const PORT = process.env.PORT || 3000;

const teams = { Police: {}, SWAT: {} };
let listMessageId = null;

// Helpers
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
    if (members.length === 0) return { name: `${emoji} ${teamName} — لا أحد متواجد`, value: "—" };
    const sorted = members.sort((a, b) => a[1].joinTime - b[1].joinTime);
    const lines = sorted.map(([user, info], i) => `\`${i+1}\` **${info.displayName}** — \`${formatDuration(now - info.joinTime)}\``);
    return { name: `${emoji} ${teamName} (${members.length})`, value: lines.join("\n") };
  };
  return new EmbedBuilder().setTitle("📋 قائمة المتواجدين").setColor(0x5865f2).addFields(
    buildTeamField("Police", "🚔"),
    buildTeamField("SWAT", "🔫")
  ).setTimestamp();
}

async function updateListMessage(client) {
  const channel = await client.channels.fetch(CHANNEL_ID).catch(()=>null);
  if (!channel) return;
  const embed = buildEmbed();
  if (listMessageId) {
    const msg = await channel.messages.fetch(listMessageId).catch(()=>null);
    if (msg) return msg.edit({ embeds: [embed] });
  }
  const msg = await channel.send({ embeds: [embed] });
  listMessageId = msg.id;
}

// Discord Client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once("ready", ()=>console.log(`✅ ${client.user.tag} شغّال`));

// Express Server
const app = express();
app.use(express.json());

app.post("/update", (req, res) => {
  const secret = req.headers["x-roblox-secret"];
  if (ROBLOX_SECRET && secret !== ROBLOX_SECRET) return res.sendStatus(401);
  const { players } = req.body;
  if (!Array.isArray(players)) return res.sendStatus(400);

  // إعادة بناء الحالة بالكامل
  teams.Police = {};
  teams.SWAT = {};
  for (const p of players) {
    if (!["Police","SWAT"].includes(p.team)) continue;
    teams[p.team][p.username] = {
      displayName: p.displayName || p.username,
      joinTime: new Date(p.joinTime).getTime(),
    };
  }

  updateListMessage(client);
  res.json({ ok: true });
});

app.get("/", (_, res)=>res.json({ status:"online" }));
app.listen(PORT, ()=>console.log(`🌐 Server شغّال على port ${PORT}`));
client.login(DISCORD_TOKEN);
