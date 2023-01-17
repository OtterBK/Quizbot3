'use strict';

//외부 modules
const { Client, GatewayIntentBits, } = require('discord.js');
const fs = require('fs');
const ytdl = require('ytdl-core');
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
] });

//로컬 modules
const PRIVATE_CONFIG = require('./private_config.json');
const { CUSTOM_EVENT_TYPE, QUIZ_TYPE, QUIZ_MAKER_TYPE } = require('./system_setting.js');

const command_register = require('./commands.js');
const quizbot_ui = require('./quizbot-ui.js');
const quiz_system = require('./quiz_system.js');
const option_system = require("./quiz_option.js");
const utility = require('./utility.js');
const logger = require('./logger.js')('Main');
const db_manager = require('./db_manager.js');
const { start } = require('repl');

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

  if(interaction.commandName === 'qtest')
  {
    ytdl.getInfo('https://www.youtube.com/watch?v=mnpQsM-tqQU')
    .then(info => 
    {
      let audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      if(audioFormats.length == 0) return;
      const audioFormat = audioFormats[audioFormats.length - 1]; //맨 뒤에 있는게 가장 low 퀄리티, 반대로 맨 앞이면 high 퀄리티

      const start_point = 30;
      const audio_duration = audioFormat.approxDurationMs;
      const audio_size = audioFormat.contentLength;
      const bitrate = audioFormat.averageBitrate;
      const byterate = bitrate / 8;

      const audio = ytdl.downloadFromInfo(info, { format: audioFormat, range: {start: parseInt(start_point * byterate), end: Infinity} });
      audio.pipe(fs.createWriteStream(`./test.mp3`));
    });

    let quiz_info = {};
    quiz_info['title']  = '테스트퀴즈';
    quiz_info['icon'] = 'Ⓜ';

    quiz_info['type_name'] = '테스트용 퀴즈입니다'; 
    quiz_info['description'] = '테스트용 퀴즈입니다.' ;

    quiz_info['author'] = '제육보끔#1916';
    quiz_info['author_icon'] = 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png';
    quiz_info['thumbnail'] = 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg'; //썸네일은 그냥 quizbot으로 해두자

    quiz_info['quiz_size'] = '10'; 
    quiz_info['repeat_count'] = 0; 
    quiz_info['winner_nickname'] = '테스터';
    quiz_info['quiz_id'] = 'test';//dev quiz는 quiz_path 필요
    quiz_info['quiz_type'] = QUIZ_TYPE.CUSTOM;
    quiz_info['quiz_maker_type'] = QUIZ_MAKER_TYPE.CUSTOM;
    quiz_system.startQuiz(interaction.guild, interaction.member, interaction.channel, quiz_info); //퀴즈 시작
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
