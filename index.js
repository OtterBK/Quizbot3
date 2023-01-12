'use strict';

//외부 modules
const { Client, GatewayIntentBits, } = require('discord.js');
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
] });

//로컬 modules
const PRIVATE_CONFIG = require('./private_config.json');
const { CUSTOM_EVENT_TYPE } = require('./system_setting.js');

const command_register = require('./commands.js');
const quizbot_ui = require('./quizbot-ui.js');
const quiz_system = require('./quiz_system.js');
const option_system = require("./quiz_option.js");
const utility = require('./utility.js');
const logger = require('./logger.js')('Main');
const db_manager = require('./db_manager.js');

/** global 변수 **/


/**  이벤트 등록  **/
//봇 최초 실행 이벤트
client.on('ready', () => {
  logger.info(`Initializing Quizbot...`);

  ///////////
  logger.info(`Initializing BGM Resources`);
  utility.initializeBGM();

  logger.info(`Initializing Quiz System`);
  quiz_system.initialize(client);

  logger.info(`Initializing Quiz UI`);
  quizbot_ui.initialize(client);

  logger.info(`Starting GuildCount Manager`);
  db_manager.initialize(client);

  logger.info(`Starting UI Holder Aging Manager`);
  quizbot_ui.startUIHolderAgingManager();

  logger.info(`Starting GuildCount Manager`);
  quizbot_ui.startGuildsCountManager(client);

  logger.info(`Loading Option Data from Database...`);
  client.guilds.cache.forEach(guild => {
    if(guild != undefined) option_system.loadOptionData(guild.id);
  });
  
  ///////////
  logger.info(`Register commands...`);

  command_register.registerGlobalCommands(PRIVATE_CONFIG.BOT.TOKEN, PRIVATE_CONFIG.BOT.CLIENT_ID);

  client.guilds.cache.forEach(guild => {
    if(guild != undefined) command_register.registerCommands(PRIVATE_CONFIG.BOT.TOKEN, PRIVATE_CONFIG.BOT.CLIENT_ID, guild.id);
  });

  ///////////
  logger.info(`Setting bot Status...`);
  client.user.setActivity(`/퀴즈 | /quiz `);

  ///////////
  logger.info(`Started Quizbot! tag name: ${client.user.tag}!`);

});

// 상호작용 이벤트
client.on(CUSTOM_EVENT_TYPE.interactionCreate, async interaction => {

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

//메시지 이벤트
client.on(CUSTOM_EVENT_TYPE.messageCreate, async interaction => {

  let guildID = interaction.guild.id;

  const quiz_session = quiz_system.getQuizSession(guildID);
  if(quiz_session != undefined)
  {
    quiz_session.on(CUSTOM_EVENT_TYPE.message, interaction);
  }

});

//전역 에러 처리
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception error!!! err: ${err.stack}`);
});

/** 메인 **/
//봇 활성화
client.login(PRIVATE_CONFIG.BOT.TOKEN);
