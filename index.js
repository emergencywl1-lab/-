const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const express = require("express");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const ROBLOX_SECRET = process.env.ROBLOX_SECRET;
const PORT = process.env.PORT || 3000;

const teams = { Police: {}, SWAT: {} };
let listMessageId = null;

function buildEmbed() {
  const buildTeamField = (teamName, emoji) => {
    const members = Object.values(teams[teamName]);
    if (members.length === 0) return { name: `${emoji} ${teamName} — لا أحد متواجد`, value: "—" };
    return { name: `${emoji} ${teamName} (${members.length})`, value: members.join("\n") };
  };

  return new EmbedBuilder()
    .setTitle("📋 قائمة المتواجدين")
    .setColor(0x5865f2)
    .addFields(
      buildTeamField("Police", "🚔"),
      buildTeamField("SWAT", "🔫")
    );
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

// Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once("ready", ()=>console.log(`✅ ${client.user.tag} شغّال`));

// Express
const app = express();
app.use(express.json());

app.post("/update", (req,res)=>{
  if (ROBLOX_SECRET && req.headers["x-roblox-secret"]!==ROBLOX_SECRET) return res.sendStatus(401);
  const { players } = req.body;
  if (!Array.isArray(players)) return res.sendStatus(400);

  // إعادة بناء كامل للقائمة (يحذف تلقائي)
  teams.Police = {};
  teams.SWAT = {};

  for(const p of players){
    if(["Police","SWAT"].includes(p.team)){
      teams[p.team][p.username] = p.username;
    }
  }

  updateListMessage(client);
  res.json({ ok:true });
});

app.listen(PORT, ()=>console.log(`🌐 Server شغّال على port ${PORT}`));
client.login(DISCORD_TOKEN);
