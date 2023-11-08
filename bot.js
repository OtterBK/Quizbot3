'use strict';

//외부 modules
const { Client, GatewayIntentBits, } = require('discord.js');
const { ClusterClient, getInfo } = require('discord-hybrid-sharding');
const fs = require('fs');
const ytdl = require('discord-ytdl-core');
const { KoreanbotsClient } = require('koreanbots');

//로컬 modules
const PRIVATE_CONFIG = require('./private_config.json');
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE, QUIZ_MAKER_TYPE } = require('./system_setting.js');

const command_register = require('./commands.js');
const quizbot_ui = require('./quizbot-ui.js');
const quiz_system = require('./quiz_system.js');
const option_system = require("./quiz_option.js");
const utility = require('./utility.js');
const logger = require('./logger.js')('Main');
const db_manager = require('./db_manager.js');
const ipc_manager = require('./ipc_manager.js');

/** global 변수 **/

const client = new KoreanbotsClient(
  { 
    shards: getInfo().SHARD_LIST, // An array of shards that will get spawned
    shardCount: getInfo().TOTAL_SHARDS, // Total number of shards,
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    koreanbots: {
      api: {
        token: PRIVATE_CONFIG.BOT.KOREANBOT_TOKEN,
      }
    },
  });
// const client = new Client(
//   { 
//     shards: getInfo().SHARD_LIST, // An array of shards that will get spawned
//     shardCount: getInfo().TOTAL_SHARDS, // Total number of shards,
//     intents: [
//       GatewayIntentBits.Guilds,
//       GatewayIntentBits.GuildVoiceStates,
//       GatewayIntentBits.GuildMessages,
//       GatewayIntentBits.MessageContent,
//     ],
//   });
  
client.cluster = new ClusterClient(client); // initialize the Client, so we access the .broadcastEval()

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

  logger.info(`Starting Database Manager`);
  db_manager.initialize(client)
  .then(result => {
    if(result == false) return;

    logger.info(`Loading Option Data from Database...`);
    client.guilds.cache.forEach(guild => {
      if(guild != undefined) option_system.loadOptionData(guild.id);
    });
  });

  logger.info(`Starting IPC Manager`);
  ipc_manager.initialize(client);

  logger.info(`Starting UI Holder Aging Manager`);
  quizbot_ui.startUIHolderAgingManager();

  // logger.info(`Starting FFMPEG Aging Manager`);
  // quiz_system.startFFmpegAgingManager();

  ///////////
  logger.info(`Register commands...`);

  command_register.registerGlobalCommands(PRIVATE_CONFIG.BOT.TOKEN, PRIVATE_CONFIG.BOT.CLIENT_ID);

  ///////////
  logger.info(`Setting bot Status...`);
  client.user.setActivity(`/퀴즈 | /quiz `);

  ///////////
  logger.info(`Started Quizbot! tag name: ${client.user.tag}!`);

});

//명령어별 처리
const command_handlers = {};

const start_quiz_handler = async (interaction) => {
  const uiHolder = quizbot_ui.createMainUIHolder(interaction);

  //임시로 잠시 해둠
  if(fs.existsSync(SYSTEM_CONFIG.current_notice_path))
  {
    const current_notice = fs.readFileSync(SYSTEM_CONFIG.current_notice_path, {encoding: 'utf8', flag:'r'});
    interaction.channel.send({content: '```' + current_notice + '```'});
  }
};

const create_quiz_handler = async (interaction) => {
  const uiHolder = quizbot_ui.createQuizToolUIHolder(interaction);
};

const test_handler = async (interaction) => {
  console.log("start test");

  let quiz_info = {};
  quiz_info['title']  = '테스트';
  quiz_info['icon'] = '👩';

  quiz_info['type_name'] = ''; 
  quiz_info['description'] = ''; 

  quiz_info['author'] = '제육보끔#1916';
  quiz_info['author_icon'] = 'https://user-images.githubusercontent.com/28488288/208116143-24828069-91e7-4a67-ac69-3bf50a8e1a02.png';
  quiz_info['thumbnail'] = 'https://user-images.githubusercontent.com/28488288/106536426-c48d4300-653b-11eb-97ee-445ba6bced9b.jpg'; //썸네일은 그냥 quizbot으로 해두자

  quiz_info['quiz_size'] = 3; 
  quiz_info['repeat_count'] = 1; 
  quiz_info['winner_nickname'] = '테스터';
  quiz_info['quiz_id'] = 'test';
  quiz_info['quiz_type'] = QUIZ_TYPE.CUSTOM;
  quiz_info['quiz_maker_type'] = QUIZ_MAKER_TYPE.CUSTOM;

  quiz_system.startQuiz(interaction.guild, interaction.member, interaction.channel, quiz_info); //퀴즈 시작
}


command_handlers["시작"] = start_quiz_handler;
// command_handlers["start"] = start_quiz_handler;
command_handlers["start"] = test_handler;

command_handlers["만들기"] = create_quiz_handler;
command_handlers["create"] = create_quiz_handler;

// 상호작용 이벤트
client.on(CUSTOM_EVENT_TYPE.interactionCreate, async interaction => {

  let guildID = interaction.guild.id;

  const main_command = interaction.commandName
  if(main_command === '퀴즈' || main_command === 'quiz') 
  {
    const sub_command = interaction.options.getSubcommand();
    const handler = command_handlers[sub_command];

    if(handler != undefined)
    {
      await handler(interaction);
    }

    return;
  }

  let already_deferred = false;
  const quiz_session = quiz_system.getQuizSession(guildID);
  if(quiz_session != undefined)
  {
    if(already_deferred == false && interaction.isButton())
    {
      already_deferred = true;
      try
      {
        await interaction.deferUpdate(); //우선 응답 좀 보내고 처리함
      }
      catch(err)
      {
        return; //이 경우에는 아마 unknown interaction 에러임
      }
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
client.on(CUSTOM_EVENT_TYPE.messageCreate, async message => {

  let guildID = message.guild.id;

  const quiz_session = quiz_system.getQuizSession(guildID);
  if(quiz_session != undefined)
  {
    quiz_session.on(CUSTOM_EVENT_TYPE.message, message);
  }

});

//전역 에러 처리
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception error!!! err: ${err.stack}`);
});

/** 메인 **/
//봇 활성화
client.login(PRIVATE_CONFIG.BOT.TOKEN);
