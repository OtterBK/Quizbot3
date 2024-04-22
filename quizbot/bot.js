'use strict';

//외부 modules
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { ClusterClient, getInfo } = require('discord-hybrid-sharding');
const fs = require('fs');
const ytdl = require('discord-ytdl-core');
const { Koreanbots } = require('koreanbots');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

//로컬 modules
const PRIVATE_CONFIG = require('../config/private_config.json');
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE, QUIZ_MAKER_TYPE } = require('../config/system_setting.js');

const command_register = require('./commands.js');
const quizbot_ui = require('./quizbot-ui.js');
const quiz_system = require('./quiz_system.js');
const option_system = require("./quiz_option.js");
const utility = require('../utility/utility.js');
const logger = require('../utility/logger.js')('Main');
const db_manager = require('./managers/db_manager.js');
const ipc_manager = require('./managers/ipc_manager.js');

/** global 변수 **/

const client = new Client(
  { 
    shards: getInfo().SHARD_LIST, // An array of shards that will get spawned
    shardCount: getInfo().TOTAL_SHARDS, // Total number of shards,
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  })
client.cluster = new ClusterClient(client); // initialize the Client, so we access the .broadcastEval()

let koreanbots = undefined;
if(PRIVATE_CONFIG.BOT.KOREANBOT_TOKEN != undefined && PRIVATE_CONFIG.BOT.KOREANBOT_TOKEN != "")
{
  try
  {
    koreanbots = new Koreanbots({
      api: {
        token: PRIVATE_CONFIG.BOT.KOREANBOT_TOKEN,
      },
      clientID: PRIVATE_CONFIG.BOT.CLIENT_ID
    });
  }
  catch(err)
  {
    logger.error(err.stack); 
    koreanbots = undefined;
  }
}

let admin_instance = undefined;

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
  client.user.setActivity(`/퀴즈 | /퀴즈만들기`);

  ///////////
  logger.info(`Started Quizbot! tag name: ${client.user.tag}!`);

  if(koreanbots != undefined && client.cluster.id == 0) //0번 클러스터에서만
  {
    const update = () => 
    {
      let servers_count = ipc_manager.sync_objects.get('guild_count');
      if(servers_count == undefined || servers_count == 0)
      {
        servers_count = client.guilds.cache.size;
      }

      if(servers_count >= 10000) //10000 이상이면 업뎃 못하고 문의해달라고 한다...귀찮으니 걍 9900정도만
      {
        const min = 9900;
        const max = 9990;

        // Generate a random decimal number between 0 and 1
        const randomDecimal = Math.random();

        // Scale and shift the random decimal to fit the desired range
        servers_count = Math.floor(randomDecimal * (max - min + 1) + min);
      }

      logger.info(`Updating Korean bot server count: ${servers_count}`);
      koreanbots.mybot.update({ servers: servers_count, shards: getInfo().TOTAL_SHARDS }) 
      .then(res => logger.info("서버 수를 정상적으로 업데이트하였습니다!\n반환된 정보:" + JSON.stringify(res)))
      .catch(err =>  logger.error(`${err.stack ?? err.message}`));
    }

    setInterval(() => update(), 3600000) // 60분마다 서버 수를 업데이트합니다.
  }

  ///////////
  if(PRIVATE_CONFIG.ADMIN_ID != undefined) //해당 cluster에서 admin instance 찾아본다
  {
    const admin_id = PRIVATE_CONFIG.ADMIN_ID;

    logger.info(`Finding Admin instance for ${admin_id}`); 

    client.users.fetch(admin_id)
    .then((instance) => 
      {
        if(instance == undefined)
        {
          return;
        }

        admin_instance = instance;
        admin_instance.send(`Hello Quizbot Admin! Quizbot has been started! this is ${client.cluster.id} cluster`); //찾았으면 인사해주자

        logger.info(`Found admin instance in cluster ${client.cluster.id}! syncing this admin instance`);
        client.cluster.send(  //cluster manager 한테 알림
        {
          ipc_message_type: ipc_manager.IPC_MESSAGE_TYPE.SYNC_ADMIN,
          admin_instance: admin_instance,
        });
      }
    ).catch((err) =>
    {
      logger.error(`Cannot find admin instance in cluster ${client.cluster.id} err: ${err.message}`);
    });
  }

  ///////////
  createCleanUp();

});

//명령어별 처리
const command_handlers = {};

const start_quiz_handler = async (interaction) => {
  if(interaction.guild == undefined)
  {
    interaction.reply({content: '>>> 개인 메시지 채널에서는 퀴즈 플레이가 불가능합니다.', ephemeral: true});
    return;
  }

  const uiHolder = quizbot_ui.createMainUIHolder(interaction); //메인 메뉴 전송

  if((interaction.guild.members.me).permissionsIn(interaction.channel.id).has(PermissionsBitField.Flags.SendMessages) == false)
  {
    interaction.reply({content: '>>> 이 채널에 메시지를 보낼 권한이 없습니다.😥\n퀴즈 시스템이 정상적으로 동작하지 않을겁니다.\n서버 관리자에게 봇을 추방하고 다시 초대하도록 요청해보세요.', ephemeral: true});
    return;
  }

  //임시로 잠시 해둠
  if(fs.existsSync(SYSTEM_CONFIG.current_notice_path))
  {
    const current_notice = fs.readFileSync(SYSTEM_CONFIG.current_notice_path, {encoding: 'utf8', flag:'r'});
    interaction.channel.send({content: '```' + current_notice + '```'});
  }
};

const create_quiz_tool_btn_component = new ActionRowBuilder()
.addComponents(
  new ButtonBuilder()
  .setCustomId('btn_create_quiz_tool')
  .setLabel('퀴즈만들기')
  .setStyle(ButtonStyle.Success),
);
const create_quiz_handler = async (interaction) => {
  //나중에 시간마다 조회하는 방식으로 변경할 것
  if(fs.existsSync(SYSTEM_CONFIG.banned_user_path)) //퀴즈만들기 ban 시스템
  {
    const banned_list = fs.readFileSync(SYSTEM_CONFIG.banned_user_path, {encoding: 'utf8', flag:'r'});
    const user_id = interaction.user.id;

    const banned_list_array = banned_list.split('\n');

    for(const banned_id of banned_list_array)
    {
      if(banned_id.trim() == user_id)
      {
        interaction.reply({content: `something wrong`});
        return;
      }
    }
  }
  
  if(interaction.guild != undefined && interaction.guild !== null) //샤딩돼 있어서 길드에서 요청할경우 ui_holder_map 주소가 달라 못찾음
  {
    interaction.reply({content: '>>> 퀴즈 제작에 참여해주셔서 감사합니다!\n퀴즈봇이 메시지를 보낼거에요. 확인해보세요!', ephemeral: true});
    interaction.member.send({content: '>>> **퀴즈만들기**는 개인채널(DM)으로만 요청 가능해요!\n여기서 다시 한번 __**/퀴즈만들기**__를 입력하시거나 버튼을 클릭하세요!', components: [ create_quiz_tool_btn_component ], ephemeral: true});
    return;
  }
  
  const uiHolder = quizbot_ui.createQuizToolUIHolder(interaction);
  interaction.reply({content: '>>> 개인 메시지로 퀴즈 제작 화면을 보내드렸어요!\n퀴즈봇과의 개인 메시지를 확인해주세요 🛠', ephemeral: true});
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
    await start_quiz_handler(interaction);
    return;
  }

  if(main_command === '퀴즈만들기' || interaction.customId == 'btn_create_quiz_tool') 
  {
    await create_quiz_handler(interaction);
    return;
  }

  //그 외의 명령어
  let already_deferred = false;
  const quiz_session = (interaction.guild == undefined ? undefined : quiz_system.getQuizSession(interaction.guild.id));
  if(quiz_session != undefined && quiz_session.suspended == false) //지연되지 않은 세션이 존재할 경우
  {
    if(already_deferred == false 
      && interaction.isButton() //퀴즈 진행 중 버튼 클릭(힌트, 스킵 등)
      && interaction.customId != 'like') //추천하기 버튼은 예외다...(이렇게 커스텀이 늘어간다...ㅜㅜ)
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

  //ui button, select menu, modal 이벤트
  const holder_id = (interaction.guild == undefined ? interaction.user.id : interaction.guild.id);
  const uiHolder = quizbot_ui.getUIHolder(holder_id);
  if(uiHolder != undefined)
  {
    if((already_deferred == false)
      && (interaction.isButton() || interaction.isStringSelectMenu())
      && interaction.customId.startsWith('request_modal') == false //modal 요청 interaction은 defer하면 안됨
      && interaction.customId != 'like') //추천하기 버튼은 예외다...(이렇게 커스텀이 늘어간다...ㅜㅜ)) 
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
let error_count = 0;
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception error!!! err_message: ${err.message}\nerr_stack: ${err.stack}`);

  if(err.message.startsWith("Status code:")) //403 또는 410 에러 발생 시,
  {
    ++error_count;
    logger.info(`Current error count ${error_count}`);

    if(error_count >= 3)
    {
      if(admin_instance != undefined) //해당 클러스터에서 admin_instance 알고 있을 경우
      {
        logger.warn(`Detected Expect Audio Error Status! Alerting to Admin ${admin_id}`);
        try // 이 조차도 try로 안묶으면 아예 bot 죽음
        {
          admin_instance.send("Status code error detected! Check Log!");
        }
        catch(err)
        {
          logger.error(`Cannot send Admin Alert Message. err: ${err.message}`);
        }
      }

      error_count = 0;
    }
  }
});

const createCleanUp = function()
{
  const interval = 60000;
  logger.info(`Creating cleanup timer. current interval: ${interval}ms`);

  let recent_error_count = 0;
  setInterval(() => 
  {
    if(recent_error_count == error_count) //1분동안 에러 난거 없으면 카운트 초기화
    {
      logger.debug(`Cleaning up error count ${error_count} -> 0`)
      error_count = 0;
      return;
    }

    recent_error_count = error_count;

  }, interval) // 1분마다 cleanup
}


/** 메인 **/
//봇 활성화
client.login(PRIVATE_CONFIG.BOT.TOKEN);
