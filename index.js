//외부 modules
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
] });

//로컬 modules
const CONFIG = require('./config.json');
const command_register = require('./commands.js');
const quizbot_ui = require('./quizbot-ui.js');

var uiHolder_map = {};

/**  이벤트 등록  **/
//봇 최초 실행 이벤트
client.on('ready', () => {
  console.log(`Initializing Quizbot...`);

  try{
    command_register.registerCommands(CONFIG.BOT_TOKEN, CONFIG.CLIENT_ID, "733548069169397842"); //봇 테스트 서버    
    client.user.setActivity(`/퀴즈 | /quiz `);
  }catch(exc){
    console.log(exc);
  }

  console.log(`Started Quizbot! tag name: ${client.user.tag}!`);

});

// 상호작용 이벤트
client.on('interactionCreate', async interaction => {

  let guildID = interaction.guild.id;

  if(interaction.commandName === '퀴즈') {
    
    let uiHolder = quizbot_ui.createUIHolder(interaction);
    uiHolder_map[guildID] = uiHolder; //UIHolder 새로 등록

    return;
  }

  if(uiHolder_map.hasOwnProperty(guildID))
  {
    await interaction.deferUpdate(); //우선 응답 좀 보내고 처리함
    let uiHolder = uiHolder_map[guildID];
    await uiHolder.on('interactionCreate', interaction);
  }

});

/** 메인 **/
//봇 활성화
client.login(CONFIG.BOT_TOKEN);

//전역 에러 처리
process.on('uncaughtException', (err) => {
  console.error(err);
});