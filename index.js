'use strict';

//외부 modules
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
] });

//로컬 modules
const BOT_CONFIG = require('./bot_config.json');
const { CUSTOM_EVENT_TYPE } = require('./system_setting.js');

const command_register = require('./commands.js');
const quizbot_ui = require('./quizbot-ui.js');
const quiz_system = require('./quiz_system.js');
const utility = require('./utility.js');

/** global 변수 **/


/**  이벤트 등록  **/
//봇 최초 실행 이벤트
client.on('ready', () => {
  console.log(`Initializing Quizbot...`);

  ///////////
  console.log(`Starting UI Holder Aging Manager`);
  quizbot_ui.startUIHolderAgingManager();
  console.log(`Starting GuildCount Manager`);
  quizbot_ui.startGuildsCountManager(client);

  ///////////
  console.log(`Register commands...`);
  try{
    command_register.registerCommands(BOT_CONFIG.BOT_TOKEN, BOT_CONFIG.CLIENT_ID, "733548069169397842"); //봇 테스트 서버    
    client.user.setActivity(`/퀴즈 | /quiz `);
  }catch(exc){
    console.log(exc);
  }

  ///////////
  console.log(`Started Quizbot! tag name: ${client.user.tag}!`);

});

// 상호작용 이벤트
client.on('interactionCreate', async interaction => {

  let guildID = interaction.guild.id;

  if(interaction.commandName === '퀴즈' || interaction.commandName === 'quiz') 
  {
    const uiHolder = quizbot_ui.createUIHolder(interaction);

    return;
  }

  let already_deferred = false;
  const quiz_session = quiz_system.getQuizSession(guildID);
  if(quiz_session != undefined)
  {
    if(already_deferred == false && interaction.isButton())
    {
      already_deferred = true;
      await interaction.deferUpdate(); //우선 응답 좀 보내고 처리함
    } 
    quiz_session.on(CUSTOM_EVENT_TYPE.interactionCreate, interaction);
  }

  const uiHolder = quizbot_ui.getUIHolder(guildID);
  if(uiHolder != undefined)
  {
    if(already_deferred == false && (interaction.isButton() || interaction.isStringSelectMenu()))
    {
      already_deferred = true;
      await interaction.deferUpdate(); //우선 응답 좀 보내고 처리함
    } 
    uiHolder.on(CUSTOM_EVENT_TYPE.interactionCreate, interaction);
  }

});

//전역 에러 처리
process.on('uncaughtException', (err) => {
  console.error(err);
});

/** 메인 **/
//봇 활성화
client.login(BOT_CONFIG.BOT_TOKEN);
