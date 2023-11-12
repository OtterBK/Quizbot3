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

  if(interaction.guild == undefined)
  {
    interaction.reply("개인 메시지 채널에서는 퀴즈 플레이가 불가능합니다.");
    return;
  }

  //임시로 잠시 해둠
  if(fs.existsSync(SYSTEM_CONFIG.current_notice_path))
  {
    const current_notice = fs.readFileSync(SYSTEM_CONFIG.current_notice_path, {encoding: 'utf8', flag:'r'});
    interaction.channel.send({content: '```' + current_notice + '```'});
  }
};

const create_quiz_handler = async (interaction) => {
  const uiHolder = quizbot_ui.createQuizToolUIHolder(interaction);
  interaction.reply({content: '>>> 개인 메시지로 퀴즈 제작 화면을 보내드렸어요!\n퀴즈봇과의 개인 메시지를 확인해주세요 🛠', ephemeral: true})
};

command_handlers["시작"] = start_quiz_handler;
command_handlers["start"] = start_quiz_handler;

command_handlers["만들기"] = create_quiz_handler;
command_handlers["create"] = create_quiz_handler;

// 상호작용 이벤트
client.on(CUSTOM_EVENT_TYPE.interactionCreate, async interaction => {

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
  const quiz_session = (interaction.guild == undefined ? undefined : quiz_system.getQuizSession(interaction.guild.id));
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

  const holder_id = (interaction.guild == undefined ? interaction.user.id : interaction.guild.id);
  const uiHolder = quizbot_ui.getUIHolder(holder_id);
  if(uiHolder != undefined)
  {
    if((already_deferred == false)
      && (interaction.isButton() || interaction.isStringSelectMenu())
      && (interaction.customId.startsWith('request_modal') == false)) //modal 요청 interaction은 defer하면 안됨
    {
      already_deferred = true;
      await interaction.deferUpdate(); 
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
