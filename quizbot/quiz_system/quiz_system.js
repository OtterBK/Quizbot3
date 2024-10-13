'use strict';

//voice 용으로 libsodium-wrapper 를 쓸 것! sodium 으로 하면 cpu 사용량 장난아님;

//#region 외부 모듈 로드
const fs = require('fs');
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, RESTJSONErrorCodes, TeamMemberMembershipState } = require('discord.js');
const pathToFfmpeg = require('ffmpeg-static');
process.env.FFMPEG_PATH = pathToFfmpeg;
const cloneDeep = require("lodash/cloneDeep.js");
//#endregion

//#region 로컬 모듈 로드
const ipc_manager = require('../managers/ipc_manager.js');
const { CLIENT_SIGNAL, SERVER_SIGNAL } = require('../managers/multiplayer_signal.js');

const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE, EXPLAIN_TYPE, BGM_TYPE, QUIZ_MAKER_TYPE, ANSWER_TYPE } = require('../../config/system_setting.js');
const option_system = require("../quiz_option/quiz_option.js");
const OPTION_TYPE = option_system.OPTION_TYPE;
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const utility = require('../../utility/utility.js');
const logger = require('../../utility/logger.js')('QuizSystem');
const { SeekStream } = require('../../utility/SeekStream/SeekStream.js');
const feedback_manager = require('../managers/feedback_manager.js');
const { loadQuestionListFromDBByTags, loadQuestionListByBasket } = require('../managers/user_quiz_info_manager.js');
const tagged_dev_quiz_manager = require('../managers/tagged_dev_quiz_manager.js');
const audio_cache_manager = require('../managers/audio_cache_manager.js');
const {
  multiplayer_participant_select_menu,
  multiplayer_participant_select_row,
  multiplayer_chat_comp,
} = require("../quiz_ui/components.js");
const e = require('express');

//#endregion

//#region 상수 타입 정의
const CYCLE_TYPE = 
{
  UNDEFINED: 'UNDEFINED',
  INITIALIZING: 'INITIALIZING', //초기화 cycle
  EXPLAIN: 'EXPLAIN', //게임 설명 cycle
  PREPARE: 'PREPARE', //문제 제출 준비 중
  QUESTIONING: 'QUESTIONING', //문제 제출 중
  CORRECTANSWER: 'CORRECTANSWER', //정답 맞췄을 시
  TIMEOVER: 'TIMEOVER', //정답 못맞추고 제한 시간 종료 시
  CLEARING: 'CLEARING', //한 문제 끝날 때마다 호출, 음악 종료, 메시지 삭제 등
  ENDING: 'ENDING', //점수 발표
  FINISH: 'FINISH', //세션 정상 종료. 삭제 대기 중
  FORCEFINISH: 'FORCEFINISH', //세션 강제 종료. 삭제 대기 중
  HOLD: 'HOLD', //그냥 아무것도 안하고 홀딩
};

const QUIZ_SESSION_TYPE = 
{
  NORMAL: 'NORMAL', //
  DUMMY: 'DUMMY', //
  MULTIPLAYER_LOBBY: 'MULTIPLAYER_LOBBY', //
  MULTIPLAYER: 'MULTIPLAYER', //  
};

exports.QUIZ_SESSION_TYPE = QUIZ_SESSION_TYPE;

//#endregion

//#region global 변수 정의
/** global 변수 **/
let quiz_session_map = {};
let bot_client = undefined;

//#endregion

//#region exports 정의
/** exports **/

exports.initialize = (client) =>
{
  if(client == undefined)
  {
    logger.error(`Failed to Initialize Quiz system. ${'Client is undefined'}`);
    return false;
  }
  bot_client = client;

  return true;
};

exports.checkReadyForStartQuiz = (guild, owner) => 
{
  let result = false;
  let reason = '';
  if(!owner.voice.channel) //음성 채널 참가 중인 사람만 시작 가능
  {
    reason = text_contents.reason.no_in_voice_channel;
    return { 'result': result, 'reason': reason };
  }

  if(this.getQuizSession(guild.id) != undefined)
  {
    reason = text_contents.reason.already_ingame;
    return { 'result': result, 'reason': reason };
  }

  result = true;
  reason = text_contents.reason.can_play;
  return { 'result': result, 'reason': reason };
};

exports.getQuizSession = (guild_id) => 
{

  if(quiz_session_map.hasOwnProperty(guild_id) == false)
  {
    return undefined;
  }

  return quiz_session_map[guild_id];
};

exports.startQuiz = (guild, owner, channel, quiz_info, quiz_session_type=QUIZ_SESSION_TYPE.NORMAL) =>
{
  const guild_id = guild.id;
  if(quiz_session_map.hasOwnProperty(guild_id))
  {
    const prev_quiz_session = quiz_session_map[guild_id];
    prev_quiz_session.free();
  }

  let quiz_session = undefined;
  if(quiz_session_type === QUIZ_SESSION_TYPE.DUMMY)
  {
    quiz_session = new DummyQuizSession(guild, owner, channel, quiz_info);
  }
  else if(quiz_session_type === QUIZ_SESSION_TYPE.MULTIPLAYER_LOBBY)
  {
    quiz_session = new MultiplayerLobbySession(guild, owner, channel, quiz_info);
  }
  else if(quiz_session_type === QUIZ_SESSION_TYPE.MULTIPLAYER)
  {
    quiz_session = new MultiplayerQuizSession(guild, owner, channel, quiz_info);
  }
  else if(quiz_session_type === QUIZ_SESSION_TYPE.NORMAL)
  {
    quiz_session = new NormalQuizSession(guild, owner, channel, quiz_info);
  }

  quiz_session_map[guild_id] = quiz_session;

  return quiz_session;
};

exports.getLocalQuizSessionCount = () => 
{
  return Object.keys(quiz_session_map).length;
};

exports.getMultiplayerQuizSessionCount = () => 
{
  let multiplayer_session_count = 0;
  for(const quiz_session of Object.values(quiz_session_map))
  {
    if(quiz_session.isMultiplayerSession())
    {
      ++multiplayer_session_count;
    }
  }

  return multiplayer_session_count; 
};

exports.startFFmpegAgingManager = () => 
{
  return ffmpegAgingManager();
};

exports.relayMultiplayerSignal = (multiplayer_signal) => //관련 세션에 멀티플레이 신호 전달
{
  let handled = false; //한 곳이라도 handle 했으면 한거임
  const guild_ids = multiplayer_signal.guild_ids;
  for(const guild_id of guild_ids)
  {
    const quiz_session = quiz_session_map[guild_id];
    if(quiz_session != undefined)
    {
      try
      {
        handled = quiz_session.on(CUSTOM_EVENT_TYPE.receivedMultiplayerSignal, multiplayer_signal);
      }
      catch(err)
      {
        logger.error(`Quiz system Relaying multiplayer Signal error occurred! ${err.stack}`);
      }
    }
  }

  return handled;
};

exports.forceStopSession = (guild) => 
{
  logger.info(`${guild.id} called force stop session`);

  const guild_id = guild.id;
  const quiz_session = quiz_session_map[guild_id];

  delete quiz_session_map[guild_id];

  if(quiz_session != undefined)
  {
    quiz_session.forceStop();
    delete quiz_session_map[guild_id];
    logger.debug(`destroy quiz_session by force stop ${guild.id}`);
  }

  const voice_state = guild.members.me.voice;
  if(voice_state && voice_state.channel)
  {
    voice_state.disconnect();
    logger.debug(`disconnected voice state by force stop ${guild.id}`);
  }
};

let ffmpeg_aging_map = new Map();
//FFmpeg Aging Manager
function ffmpegAgingManager() //TODO ps-node 모듈을 이용한 방식으로 수정해야함
{
  const ffmpeg_aging_for_oldkey_value = SYSTEM_CONFIG.ffmpeg_aging_manager_criteria * 1000; //last updated time이 일정 값 이전인 ffmpeg는 종료할거임
  const ffmpeg_aging_manager = setInterval(()=>
  {
      
    const criteria_value = Date.now() - ffmpeg_aging_for_oldkey_value; //이거보다 이전에 update 된 것은 삭제
    logger.info(`Aginging FFmpeg... targets: ${ffmpeg_aging_map.size} ,criteria: ${criteria_value}`);

    let kill_count = 0;

    const iter = ffmpeg_aging_map.entries();
    const target_keys = [];
    for(let i = 0; i < ffmpeg_aging_map.size; ++i)
    {
      const [ffmpeg_handler, created_date] = iter.next().value;
      if(created_date < criteria_value)
      {
        ffmpeg_handler.kill();
        ++kill_count;
        target_keys.push(ffmpeg_handler);
      }
    }

    target_keys.forEach(key => 
    {
      ffmpeg_aging_map.delete(key);
    });

    logger.info(`Done FFmpeg aging manager... kill count: ${kill_count}`);
  }, SYSTEM_CONFIG.ffmpeg_aging_manager_interval * 1000); //체크 주기

  return ffmpeg_aging_manager;
}

//#region 퀴즈 플레이에 사용될 UI
class QuizPlayUI
{
  constructor(channel)
  {
    this.channel = channel;
    this.ui_instance = undefined;

    this.embed = {
      color: 0xFED049,
      title: '초기화 중입니다.',
      description: '잠시만 기다려주세요...',
      image: {
        url: undefined,
      },
    };

    this.quiz_play_comp = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('hint')
          .setLabel('힌트')
        //   .setEmoji(`${text_contents.icon.ICON_HINT}`) //이모지 없는게 더 낫다
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('skip')
          .setLabel('스킵')
        // .setEmoji(`${text_contents.icon.ICON_SKIP}`)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('force_stop')
          .setLabel('그만하기')
        // .setEmoji(`${text_contents.icon.ICON_STOP}`)
          .setStyle(ButtonStyle.Danger),
      );
 
    this.ox_quiz_comp = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('choice_O')
          .setEmoji(`${text_contents.icon.ICON_O}`) 
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('choice_X')
          .setEmoji(`${text_contents.icon.ICON_X}`)
          .setStyle(ButtonStyle.Secondary),
      );

    this.multiple_quiz_comp = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('choice_1')
          .setLabel('1')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('choice_2')
          .setLabel('2')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('choice_3')
          .setLabel('3')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('choice_4')
          .setLabel('4')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('choice_5')
          .setLabel('5')
          .setStyle(ButtonStyle.Secondary),
      );


    this.components = [ ];
  }

  setImage(image_resource)
  {

    if(image_resource == undefined) 
    {
      this.embed.image = { url: '' };
      return;
    }

    if(image_resource.includes(SYSTEM_CONFIG.dev_quiz_path) == true) //dev path 포함하면 로컬 이미지 취급
    {
      const file_name = image_resource.split('/').pop(); 
      this.files = [ { attachment: image_resource, name: file_name } ];
      this.embed.image = { url: "attachment://" + file_name };
    }
    else
    {
      this.embed.image = {
        url: utility.isValidURL(image_resource) ? image_resource : '',
      };
    }
  }

  setTitle(title)
  {
    this.embed.title = title;
  }

  async send(previous_delete, remember_ui = true)
  {
    if(previous_delete == true)
    {
      this.delete(); //이전 UI는 삭제
    }

    const objects = this.createSendObject();
    await this.channel.send(objects) //await로 대기
      .then((ui_instance) => 
      {
        if(remember_ui == false)
        {
          return;
        }
        this.ui_instance = ui_instance;
      })
      .catch(err => 
      {
        if(err.code === RESTJSONErrorCodes.UnknownChannel || err.code === RESTJSONErrorCodes.MissingPermissions || err.code === RESTJSONErrorCodes.MissingAccess)
        {
          const guild_id = this.channel.guild.id;
          const quiz_session = exports.getQuizSession(guild_id);
          logger.error(`Unknown channel for ${this.channel.id}, guild_id: ${guild_id}`);
          if(quiz_session != undefined)
          {
            quiz_session.forceStop();
          }
		
          if(err.code === RESTJSONErrorCodes.MissingPermissions || err.code === RESTJSONErrorCodes.MissingAccess) //권한 부족해서 종료된거면 알려주자
          {
            quiz_session.owner.send({content: `\`\`\`🔸 ${guild_id}에서 진행한 퀴즈가 강제 종료되었습니다.\n이유: 봇에게 메시지 보내기 권한이 부족합니다.\n봇을 추방하고 관리자가 다시 초대하도록 해보세요.\n${err.code}\`\`\``});
		        logger.info(`Send Forcestop Reason MissingPermissions to ${quiz_session.owner.id}, guild_id: ${guild_id}, err.code: ${err.code}`);
          }
	
          return;
        }
        logger.error(`Failed to Send QuizPlayUI, guild_id:${this.guild_id}, embed: ${JSON.stringify(this.embed)}, objects:${JSON.stringify(objects)}, err: ${err.stack}`);
      })
      .finally(() => 
      {
        
      });
    this.files = undefined; //파일은 1번 send하면 해제
  }

  async delete()
  {
    if(this.ui_instance == undefined)
    {
      return;
    }
    this.ui_instance.delete()
      .catch(err => 
      {
        if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //이미 삭제됐으면 땡큐지~
        {
          return;
        }
        logger.error(`Failed to Delete QuizPlayUI, guild_id:${this.guild_id}, err: ${err.stack}`);
      });
    this.ui_instance = undefined;
  }

  async update()
  {
    if(this.ui_instance != undefined)
    {
      if(this.files != undefined)
      {
        await this.send(true); //첨부 파일 보낼게 있다면 update로 들어와도 send해야한다.
        return;
      }

      const objects = this.createSendObject();
      await this.ui_instance.edit(objects)
        .catch(err => 
        {
          if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //뭔가 이상함
          {
            return;
          }
          logger.error(`Failed to Update QuizPlayUI, guild_id:${this.guild_id}, embed: ${JSON.stringify(this.embed)}, objects:${JSON.stringify(objects)}, err: ${err.stack}`);
        })
        .finally(() => 
        {
            
        });
    }
  }

  createSendObject()
  {
    if(this.files != undefined)
    {
      return {
        files: this.files, 
        embeds: [ this.embed ], 
        components: this.components
      };
    }

    return {
      embeds: [ this.embed ], 
      components: this.components
    };
  }

  setButtonStatus(button_index, status)
  {
    const components = this.quiz_play_comp.components;
    if(button_index >= components.length)
    {
      return;
    }
    let button = components[button_index];
    button.setDisabled(!status);
  }

}
//#endregion


//#region 퀴즈 게임용 세션
class QuizSession
{
  constructor(guild, owner, channel, quiz_info, quiz_session_type)
  {
    logger.info(`Creating ${quiz_session_type} Quiz Session, guild_id: ${guild.id}`);

    this.guild = guild;
    this.owner = owner;
    this.channel = channel;
    this.quiz_info = quiz_info;
    this.voice_channel = owner.voice.channel;

    this.guild_id = guild.id;
    this.quiz_ui = undefined; //직접 새로 UI만들자

    this.voice_connection = undefined;
    this.audio_player = undefined;

    this.lifecycle_map = {};
    this.current_cycle_type = CYCLE_TYPE.UNDEFINED;

    this.quiz_data = undefined; //얘는 처음 initialize 후 바뀌지 않는다.
    this.game_data = undefined; //얘는 자주 바뀐다.
    this.option_data = undefined; //옵션

    this.scoreboard = new Map(); //scoreboard 

    this.force_stop = false; //강제종료 여부

    this.ipv4 = undefined; 
    this.ipv6 = undefined; 

    this.already_liked = true; //이미 like 버튼 눌렀는지 여부. 기본 true 깔고 initializeCustom에서만 false 또는 true 다시 정함

    this.quiz_session_type = quiz_session_type;

    this.is_multiplayer_session = false;
  }

  free() //자원 해제
  {
    const guild_id = this.guild_id;

    this.audio_player.stop(true); //stop 걸어주고

    let free_stream_count = 0;
    if(SYSTEM_CONFIG.explicit_close_audio_stream) //오디오 STREAM 명시적으로 닫음
    {
      const audio_stream_for_close = this.game_data['audio_stream_for_close'];
      if(audio_stream_for_close != undefined && audio_stream_for_close.length != 0)
      {
        audio_stream_for_close.forEach((audio_stream_array) => 
        {
          audio_stream_array.forEach((audio_stream) => 
          {
            if(audio_stream == undefined) return;

            if(audio_stream.closed == false)
              audio_stream.close();
            if(audio_stream.destroyed == false)
              audio_stream.destroy();

            ++free_stream_count;
          });
        });
        audio_stream_for_close.splice(0, audio_stream_for_close.length);
      }
    }
    logger.debug(`free stream count, ${free_stream_count}`);

    for(const cycle of Object.values(this.lifecycle_map))
    {
      // cycle.free();
    }

    delete quiz_session_map[this.guild_id];

    this.guild = null;
    this.owner = null;
    this.channel = null;
    this.quiz_info = null;
    this.voice_channel = null;

    this.quiz_ui = null; //직접 새로 UI만들자

    this.voice_connection = null;
    this.audio_player = null;

    this.lifecycle_map = null;

    this.quiz_data = null; //얘는 처음 initialize 후 바뀌지 않는다.
    this.game_data = null; //얘는 자주 바뀐다.
    this.option_data = null; //옵션

    this.scoreboard = null; //scoreboard 

    this.ipv4 = null;
    this.ipv6 = null;

    this.already_liked = null;

    this.multiplayer = null;

    logger.info(`Free Quiz Session, guild_id: ${this.guild_id}`);
  }

  createCycle()
  {
    const quiz_info = this.quiz_info;
    this.cycle_info = '';

    const quiz_maker_type = quiz_info['quiz_maker_type'];
    //Initialize 단계 선택
    if(quiz_maker_type == QUIZ_MAKER_TYPE.BY_DEVELOPER)
    {
      this.inputLifeCycle(CYCLE_TYPE.INITIALIZING, new InitializeDevQuiz(this));
    }
    else if(quiz_maker_type == QUIZ_MAKER_TYPE.CUSTOM)
    {
      this.inputLifeCycle(CYCLE_TYPE.INITIALIZING, new InitializeCustomQuiz(this));
    }
    else if(quiz_maker_type == QUIZ_MAKER_TYPE.OMAKASE)
    {
      this.inputLifeCycle(CYCLE_TYPE.INITIALIZING, new InitializeOmakaseQuiz(this));
    }
    else
    {
      this.inputLifeCycle(CYCLE_TYPE.INITIALIZING, new InitializeUnknownQuiz(this));
    }

    this.inputLifeCycle(CYCLE_TYPE.EXPLAIN, new Explain(this));

    this.inputLifeCycle(CYCLE_TYPE.PREPARE, new Prepare(this));

    //Questioning 단계 선택

    const quiz_type = quiz_info['quiz_type'];
    switch(quiz_type)
    {
    case QUIZ_TYPE.SONG: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionSong(this)); break;
    case QUIZ_TYPE.IMAGE: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionImage(this)); break;
    case QUIZ_TYPE.INTRO: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionIntro(this)); break;
    case QUIZ_TYPE.SCRIPT: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionIntro(this)); break;
    case QUIZ_TYPE.IMAGE_LONG: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionImage(this)); break;
    case QUIZ_TYPE.TEXT: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionText(this)); break;
    case QUIZ_TYPE.TEXT_LONG: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionText(this)); break;
    case QUIZ_TYPE.OX: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionOX(this)); break;
    case QUIZ_TYPE.OX_LONG: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionOX(this)); break;

    case QUIZ_TYPE.CUSTOM: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionCustom(this)); break;
    case QUIZ_TYPE.OMAKASE: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionOmakase(this)); break;

    default: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionUnknown(this));            
    }

    this.inputLifeCycle(CYCLE_TYPE.CORRECTANSWER, new CorrectAnswer(this));
    this.inputLifeCycle(CYCLE_TYPE.TIMEOVER, new TimeOver(this));
    this.inputLifeCycle(CYCLE_TYPE.CLEARING, new Clearing(this));

    //이 아래는 공통
    this.inputLifeCycle(CYCLE_TYPE.ENDING, new Ending(this));
    this.inputLifeCycle(CYCLE_TYPE.FINISH, new Finish(this));

    this.inputLifeCycle(CYCLE_TYPE.HOLD, new HOLD(this));

    logger.info(`Created Cycle of Quiz Session, guild_id: ${this.guild_id}, Cycle: ${this.cycle_info}`);
  }

  inputLifeCycle(cycle_type, cycle)
  {
    this.cycle_info += `${cycle.constructor.name} -> `;
    this.lifecycle_map[cycle_type] = cycle;
  }

  cycleLoop() //비동기로 처리해주자
  {
    this.goToCycle(CYCLE_TYPE.INITIALIZING);
  }

  getCycle(cycle_type)
  {
    if(this.lifecycle_map?.hasOwnProperty(cycle_type) == false)
    {
      return undefined;
    }
    return this.lifecycle_map[cycle_type];
  }

  getCurrentCycle()
  {
    const cycle = this.lifecycle_map[this.current_cycle_type];
    if(cycle === undefined)
    {
      logger.error(`get current cycle is undefined!. cycle_type: ${this.current_cycle_type}}`);
    }

    return cycle;
  }

  goToCycle(cycle_type)
  {
    const target_cycle = this.getCycle(cycle_type);
    if(target_cycle == undefined)
    {
      logger.error(`Failed to go to cycle, guild_id:${this.quiz_session.guild_id}, cycle_type: ${cycle_type}, cycle_info: ${this.cycle_info}`);
      return;
    }
    this.current_cycle_type = cycle_type;
    target_cycle.do();
  }

  async forceStop() //세션에서 강제 종료 시,
  {
    this.force_stop = true;
    const current_cycle_type = this.current_cycle_type;
    logger.info(`Call force stop quiz session, guild_id: ${this.guild_id}, current cycle type: ${current_cycle_type}`);

    if(this.isMultiplayerSession())
    {
      this.sendLeave();
    }

    const cycle = this.getCycle(current_cycle_type);
    cycle?.forceStop();
  }

  /** 세션 이벤트 핸들링 **/
  on(event_name, event_object)
  {
    const current_cycle = this.getCurrentCycle();
    if(current_cycle == undefined)
    {
      return;
    }
    current_cycle.on(event_name, event_object);
  }

  sendMessage(message)
  {
    this.channel.send(message);
  }

  sendMultiplayerSignal(signal)
  {
    signal.guild_id = this.guild_id;
    return ipc_manager.sendMultiplayerSignal(signal);
  }

  createVoiceConnection()
  {
    const guild = this.guild;
    const voice_channel = this.voice_channel;

    //보이스 커넥션
    const voice_connection = joinVoiceChannel({
      channelId: voice_channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
    });
    logger.info(`Joined Voice channel, guild_id:${this.guild_id}, voice_channel_id:${voice_channel.id}`);

    //보이스 끊겼을 때 핸들링
    voice_connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => 
    {

      if(this.force_stop == true || this.current_cycle_type == CYCLE_TYPE.FINISH) //강종이나 게임 종료로 끊긴거면
      {
        return;
      }

      try 
      {
        //우선 끊어졌으면 재연결 시도를 해본다.
        logger.info(`Try voice reconnecting..., guild_id:${this.guild_id}`);
        await Promise.race([
          entersState(voice_connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(voice_connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      }
      catch (error) 
      {
        //근데 정말 연결 안되면 강제 종료한다.
        logger.info(`Failed to voice reconnecting, force stop this quiz session, guild_id:${this.guild_id}`);
        try
        {
          voice_connection.destroy();
        }
        catch(error) 
        {
          return;
        }
                
        await this.forceStop();
      }
    });
		
    //보이스 커넥션 생성 실패 문제 해결 방안 https://github.com/discordjs/discord.js/issues/9185, https://github.com/umutxyp/MusicBot/issues/97
    const networkStateChangeHandler = (oldNetworkState, newNetworkState) => 
    {
      const newUdp = Reflect.get(newNetworkState, 'udp');
      clearInterval(newUdp?.keepAliveInterval);
    };

    voice_connection.on('stateChange', (oldState, newState) => 
    {
      const oldNetworking = Reflect.get(oldState, 'networking');
      const newNetworking = Reflect.get(newState, 'networking');

      oldNetworking?.off('stateChange', networkStateChangeHandler);
      newNetworking?.on('stateChange', networkStateChangeHandler);
    });

    const audio_player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Stop,
      },
    });
    voice_connection.subscribe(audio_player);

    this.voice_connection = voice_connection;
    this.audio_player = audio_player;
  }

  isMultiplayerSession()
  {
    return this.is_multiplayer_session;
  }

  hasMoreQuestion()
  {
    return this.game_data['question_num'] < this.quiz_data['quiz_size'];
  }
}

class NormalQuizSession extends QuizSession
{
  constructor(guild, owner, channel, quiz_info)
  {
    super(guild, owner, channel, quiz_info, QUIZ_SESSION_TYPE.NORMAL);

    //퀴즈 타입에 따라 cycle을 다른걸 넣어주면된다.
    //기본 LifeCycle 동작은 다음과 같다
    //Initialize ->
    //EXPLAIN ->
    //Prepare -> if quiz_finish Ending else -> Question
    //Question ->
    //(CorrectAnswer 또는 Timeover) -> Question

    this.createCycle(); //Normal 은 바로 시작
    this.cycleLoop();
  } 
}

class DummyQuizSession extends QuizSession
{
  constructor(guild, owner, channel, quiz_info, quiz_session_type=QUIZ_SESSION_TYPE.DUMMY)
  {
    super(guild, owner, channel, quiz_info, quiz_session_type); //dummy 세션으로 생성

    //DUMMY도 이 정도는 넣어주자
    this.inputLifeCycle(CYCLE_TYPE.HOLD, new HOLD(this));
    this.inputLifeCycle(CYCLE_TYPE.FINISH, new Finish(this)); 

    this.goToCycle(CYCLE_TYPE.HOLD);
  } 
}

const MULTIPLAYER_STATE =
{
  LOBBY: 'LOBBY',
  INITIALIZING: 'initializing',
  WAITING_FOR_QUESTION_LIST: 'waiting_for_question_list',
  QUESTION_LIST_READY: 'question_list_ready',
  WAITING_FOR_NEXT_QUESTION: 'waiting_for_next_question',
  NEXT_QUESTION_READY: 'next_question_ready',
  WAITING_FOR_SYNC_DONE: 'waiting_for_sync_done',
  QUESTIONING: 'questioning',
  FINISH_UP: 'finish_up',
};

const MULTIPLAYER_COMMON_OPTION =
{
  quiz: {
    audio_play_time: 35000,
    hint_type: OPTION_TYPE.HINT_TYPE.VOTE, 
    skip_type: OPTION_TYPE.SKIP_TYPE.VOTE,
    use_similar_answer: OPTION_TYPE.DISABLED,
    score_type: OPTION_TYPE.SCORE_TYPE.TIME,
    improved_audio_cut: OPTION_TYPE.ENABLED,
    use_message_intent: OPTION_TYPE.ENABLED,
    score_show_max: OPTION_TYPE.UNLIMITED,
    max_chance: OPTION_TYPE.UNLIMITED,
  }
};

//Mix in 패턴. Base 클래스 달라도 공통 함수 정의하기 위해 사용
const MultiplayerSessionMixin = Base => class extends Base 
{
  constructor(...args)
  {
    super(...args);

    this.is_multiplayer_session = true;

    this.session_id = undefined;
    this.ignore_chat = false; 

    this.participant_guilds_info = undefined;

    this.sync_ready = false;
    this.sync_failed = false;
    this.leaved = false;

    this.session_expired = false;

    this.multiplayer_state = undefined;
  }

  setSessionId(session_id)
  {
    this.session_id = session_id;
  }

  setIgnoreChat(value, who=undefined)
  {
    this.ignore_chat = value;

    if(who === undefined)
    {
      return;
    }

    if(this.isIgnoreChat())
    {
      this.sendMessage(`\`\`\`🔸 ${who} 님이 전체 채팅을 껐습니다.\n'/채팅전환' 명령어로 켜거나 끌 수 있습니다.\`\`\``);
    }
    else
    {
      this.sendMessage(`\`\`\`🔸 ${who} 님이 전체 채팅을 켰습니다.\`\`\``);
    }
  }

  toggleIgnoreChat(who=undefined)
  {
    this.setIgnoreChat(!this.ignore_chat, who);

    return this.isIgnoreChat();
  }

  isIgnoreChat()
  {
    return this.ignore_chat;
  }

  isMultiplayerSessionExpired()
  {
    return this.session_expired;
  }

  isHostSession()
  {
    return this.session_id === this.guild_id;
  }

  isIngame()
  {
    return this.multiplayer_state !== MULTIPLAYER_STATE.LOBBY;
  }

  isLeavedGame()
  {
    return this.leaved;
  }

  getParticipant(guild_id)
  {
    for(const guild_info of this.participant_guilds_info)
    {
      if(guild_info.guild_id === guild_id)
      {
        return guild_info;
      }
    }

    return undefined;
  }

  sendSignal(signal, handle_failed=true)
  {
    if(this.isMultiplayerSessionExpired())
    {
      return;
    }

    if(this.sync_failed || this.leaved)
    {
      return;
    }

    signal.guild_id = this.guild_id;
    signal.session_id = this.session_id;

    ipc_manager.sendMultiplayerSignal(
      signal
    )
      .then(result =>
      {
        if(handle_failed === false)
        {
          return;
        }

        if(result.state === false)
        {
          this.sendMessage(`\`\`\`🔸 요청 전송에 실패했습니다. 멀티플레이 퀴즈를 종료합니다.\n원인: ${result.reason}\`\`\``);
          this.syncFailed();
        }
      });
  }

  syncFailed()
  {
    this.sendMessage({content:`\`\`\`🌐 멀티플레이 동기화에 실패하였습니다. (timeout/ sync_ready: ${this.sync_ready} / sequence_num: ${this.sync_done_sequence_num})\n퇴장으로 처리되지만, 패배 처리는 되지 않습니다.\`\`\``});
    logger.error(`Multiplayer quiz session sync client timeout. 
      guild_id: ${this.guild_id},  /
      sequence_info: (timeout/ sync_ready: ${this.sync_ready}, sequence_num: ${this.sync_done_sequence_num}) /
      prepared question queue length: ${this.game_data.prepared_question_queue.length} /   
      remaining question list length: ${this.quiz_data.question_list.length} /   
    `);

    this.sync_failed = true;
    
    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.SYNC_FAILED,
      }
    );

    this.forceStop();
  }

  sendLeave()
  {
    if(this.multiplayer_state === MULTIPLAYER_STATE.LOBBY)
    {
      this.sendLeaveLobby();
    }
    else
    {
      this.sendLeaveGame();
    }
  }

  sendLeaveLobby()
  {
    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.LEAVE_LOBBY,
      },
      false
    ); 

    this.leaved = true;

    logger.info(`Send Leave Lobby Signal. guild_id: ${this.guild_id}`); 
  }

  sendLeaveGame()
  {
    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.LEAVE_GAME,
      }
    );

    this.leaved = true;

    logger.info(`Send Leave Game Signal. guild_id: ${this.guild_id}`); 
  }

  sendRequestChat(user_id, chat_message)
  {
    logger.debug(`Send request chat signal. guild_id: ${this.guild_id} / user_id: ${user_id}`);

    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.REQUEST_CHAT,
        user_id: user_id,
        chat_message: chat_message
      },
      false
    );
  }

  on(event_name, event_object)
  {
    if(event_name === CUSTOM_EVENT_TYPE.interactionCreate)
    {
      if(event_object.isButton() && event_object.customId === 'chat_ignore')
      {
        this.setIgnoreChat(true, event_object.user.displayName);
        return;
      }
    }

    const signal_type = event_object.signal_type;

    if(signal_type === SERVER_SIGNAL.CONFIRM_CHAT)
    {
      return this.onReceivedConfirmChat(event_object);
    }

    super.on(event_name, event_object);
  }

  onReceivedConfirmChat(signal)
  {
    if(this.ignore_chat === true)
    {
      return;
    }

    const custom_chat_component = cloneDeep(multiplayer_chat_comp);
    const message_id = signal.user_id + '-' + signal.timestamp;
    custom_chat_component.components[0].setCustomId(`chat_report_${message_id}`);
    //신고 버튼에 ID 설정해줘야함

    this.sendMessage({ content: signal.chat_message, components: [custom_chat_component]});
  }

};

class MultiplayerLobbySession extends MultiplayerSessionMixin(DummyQuizSession) //멀티플레이 로비임
{
  constructor(guild, owner, channel, quiz_info)
  {
    super(guild, owner, channel, quiz_info, QUIZ_SESSION_TYPE.MULTIPLAYER_LOBBY);

    this.createVoiceConnection(); //음성 채널 참가까지는 진행한다.

    this.multiplayer_state = MULTIPLAYER_STATE.LOBBY;
  }

  on(event_name, signal)
  {
    if(event_name !== CUSTOM_EVENT_TYPE.receivedMultiplayerSignal)
    {
      super.on(event_name, signal);
      return false;
    }

    const signal_type = signal.signal_type;

    if(signal_type === SERVER_SIGNAL.STARTED_LOBBY)
    {
      //로비 시작만 핸들
      return this.onReceivedStatedLobby(signal);
    }
    else if(signal_type === SERVER_SIGNAL.EXPIRED_SESSION)
    {
      return this.onReceivedExpiredSession(signal);
    }
    else if(signal_type === SERVER_SIGNAL.JOINED_LOBBY)
    {
      return this.onReceivedJoinedLobby(signal);
    }
    else if(signal_type === SERVER_SIGNAL.LEAVED_LOBBY)
    {
      return this.onReceivedLeavedLobby(signal);
    }
    else if(signal_type === SERVER_SIGNAL.KICKED_PARTICIPANT)
    {
      return this.onReceivedKickedParticipant(signal);
    }

    return super.on(event_name, signal); //핸들 안된건 위쪽으로
  }    

  onReceivedStatedLobby(signal)
  {
    const session_id = signal.session_id;
    const lobby_info = signal.lobby_info;
    if(lobby_info.quiz_info === undefined)
    {
      logger.error(`Cannot transit to active quiz session from multiplayer session. finalized quiz info is undefined. guild_id: ${this.guild_id}`);
      return;
    }

    const transited_session = this.transitToActiveQuizSession(lobby_info.quiz_info);

    if(!(transited_session instanceof MultiplayerQuizSession))
    {
      logger.error(`Transited Quiz Session is not Multiplayer Quiz Session type!!!. session_id: ${session_id} guild_id: ${this.guild_id}`);
      return;
    }

    transited_session.setSessionId(session_id);
    transited_session.setIgnoreChat(this.ignore_chat);
    transited_session.startMultiplayer();
  }

  onReceivedExpiredSession(signal)
  {
    this.session_expired = true;

    logger.debug(`Received Expired Session signal on MultiplayerLobbySession. but do not call forcestop`);
    // this.forceStop(); //로비에서 받았으면 어차피 goToBack 하면서 해제될듯
  }

  onReceivedJoinedLobby(signal)
  {
    utility.playBGM(this.audio_player, BGM_TYPE.MATCHING);
  }

  onReceivedLeavedLobby(signal)
  {
    utility.playBGM(this.audio_player, BGM_TYPE.MATCH_FIND);
  }

  onReceivedKickedParticipant(signal)
  {
    utility.playBGM(this.audio_player, BGM_TYPE.MATCH_FIND);
  }

  transitToActiveQuizSession(finalized_quiz_info) //Lobby에서 게임 진행할 진짜 QuizSession 으로 전환
  {
    logger.debug(`transit to active quiz session from multiplayer session. guild_id: ${this.guild_id}`);
    return exports.startQuiz(this.guild, this.owner, this.channel, finalized_quiz_info, QUIZ_SESSION_TYPE.MULTIPLAYER); //진짜 퀴즈 세션 생성 -> 해당 함수에서 어차피 Lobby는 free됨
  }
}

class MultiplayerQuizSession extends MultiplayerSessionMixin(QuizSession)
{
  constructor(guild, owner, channel, quiz_info)
  {
    super(guild, owner, channel, quiz_info, QUIZ_SESSION_TYPE.MULTIPLAYER);
    
    this.sync_done_sequence_num = 0;

    this.participant_select_menu = undefined;
    this.participant_select_row = cloneDeep(multiplayer_participant_select_row);

    this.mvp_info = undefined;
  }

  startMultiplayer()
  {
    //그냥 사이클만 만들어주면 끗
    this.createCycle();
    this.cycleLoop();
  }

  getGuildState()
  {
    const permissions = this.voice_channel?.permissionsFor(bot_client.user);

    if(!permissions)
    {
      return;
    }

    let member_count = 0;
    if(permissions.has(PermissionsBitField.Flags.ViewChannel))
    {
      member_count = this.voice_channel.members.size - 1; //1명은 봇임
    }

    return {
      member_count: member_count
    };
  }
    
  setupParticipantSelectMenu()
  {
    let participant_select_menu = cloneDeep(multiplayer_participant_select_menu);
  
    for (let i = 0; i < this.participant_guilds_info.length; ++i) 
    {
      const guild_info = this.participant_guilds_info[i];
      const option = { label: `${guild_info.guild_name}`, description: `${guild_info.member_count}명 게임 중`, value: `${i}` };
      participant_select_menu.addOptions(option);
    }
  
    if (this.participant_guilds_info.length !== 0) 
    {
      this.participant_select_row.components[0] = participant_select_menu;
    }
  }

  appendParticipantInfoMenu(quiz_play_ui)
  {
    quiz_play_ui.components.push(this.participant_select_row);
  }

  waitForQuestionList()
  {
    logger.debug(`Waiting for question list. guild_id: ${this.guild_id}`);
    this.multiplayer_state = MULTIPLAYER_STATE.WAITING_FOR_QUESTION_LIST;

    this.sendMessage({content:`\`\`\`🌐 문제 목록을 동기화 하는 중\`\`\``});
  }

  waitForNextQuestionData()
  {
    logger.debug(`Waiting for next question data. guild_id: ${this.guild_id}`);
    this.multiplayer_state = MULTIPLAYER_STATE.WAITING_FOR_NEXT_QUESTION;
  }

  async waitForSyncDone()
  {
    if(this.sync_ready === false)
    {
      logger.debug(`Waiting for sync ready. guild_id: ${this.guild_id}`);
    }

    let wait_sync_ready_time_sec = 0;
    while(this.sync_ready === false) //sync ready를 기다림. 즉, 문제 준비 완료 기다리기
    {
      await utility.sleep(100);
      ++wait_sync_ready_time_sec;

      if(this.game_data.prepared_question_queue?.length !== 0)
      {
        logger.warn(`Syncing ready. but prepared question queue length is ${this.game_data.prepared_question_queue.length}. skip sync ready`);
        break;
      }

      if(wait_sync_ready_time_sec === 50) //5초
      {
        this.sendMessage({content:`\`\`\`🌐 제출할 문제 데이터를 동기화 하는 중\`\`\``});
      }

      if(wait_sync_ready_time_sec === 200) //20초
      {
        this.sendMessage({content:`\`\`\`🌐 문제 데이터 동기화가 지연되고 있습니다. 잠시만 기다려주세요.\`\`\``});
        logger.warn(`Multiplayer quiz session sync ready delayed. guild_id: ${this.guild_id}`);
      }

      if(wait_sync_ready_time_sec >= 450) //45초
      {
        this.syncFailed();
        return;
      }
    }
    
    this.multiplayer_state = MULTIPLAYER_STATE.WAITING_FOR_SYNC_DONE;
    logger.debug(`Waiting for sync done. guild_id: ${this.guild_id}`);
  
    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.SYNC_WAIT,
        guild_state: this.getGuildState()
      }
    );

    let wait_sync_done_time_sec = 0;
    const current_sequence = this.sync_done_sequence_num;
    while(current_sequence == this.sync_done_sequence_num)
    {
      await utility.sleep(100);
      ++wait_sync_done_time_sec;

      if(wait_sync_done_time_sec === 50) //5초
      {
        this.sendMessage({content:`\`\`\`🌐 다른 서버의 동기화 완료를 기다리는 중\`\`\``});
      }

      if(wait_sync_done_time_sec === 200) //20초
      {
        this.sendMessage({content:`\`\`\`🌐 동기화가 지연되고 있습니다. 잠시만 기다려주세요...\`\`\``});
        logger.warn(`Multiplayer quiz session sync done delayed. guild_id: ${this.guild_id}`);
      }

      if(wait_sync_done_time_sec >= 450) //45초. 이정도면 그냥 뭔가 문제가 있음
      {
        this.syncFailed();
        return;
      }
    }

    this.sync_ready = false;
  }

  sendQuestionListInfo()
  {
    //꼼수다... 가아끔 basicInitialized 끝나기도 전에 question list가 오는 경우가 잇다
    setTimeout(() => 
    {
      this.sendSignal(
        {
          signal_type: CLIENT_SIGNAL.QUESTION_LIST_GENERATED,
          question_list: this.quiz_data.question_list,
          quiz_size: this.quiz_data.quiz_size,
        }
      );
  
      logger.debug(`Send question list generated signal. quiz_size: ${this.quiz_data.quiz_size}/${this.quiz_data.question_list.length}, guild_id: ${this.guild_id}`);
    }, 3000);
  }

  sendPreparedQuestion(question)
  {
    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.NEXT_QUESTION_GENERATED,
        question: question,
        question_num: this.game_data.question_num,
      }
    );

    logger.debug(`Send current question generated signal. guild_id: ${this.guild_id}`);
  }

  sendRequestHint(requester_id)
  {
    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.REQUEST_HINT,
        requester_id: requester_id,
      }
    );

    logger.debug(`Send request hint signal. guild_id: ${this.guild_id}`);
  }

  sendRequestSkip(requester_id)
  {
    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.REQUEST_SKIP,
        requester_id: requester_id,
      }
    );

    logger.debug(`Send request hint signal. guild_id: ${this.guild_id}`);
  }

  sendRequestAnswerHit(answerer_id, answerer_name, score)
  {
    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.REQUEST_ANSWER_HIT,
        answerer_info: 
        {
          answerer_id: answerer_id,
          answerer_name: answerer_name,
          score: score,
        }
      }
    );

    logger.debug(`Send request answer hit signal. guild_id: ${this.guild_id}, answerer_id: ${answerer_id}, answerer_name: ${answerer_name}, score: ${score}`);
  }

  sendFinishUp()
  {
    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.FINISH_UP,
      },
      false
    );

    logger.info(`Send Finish Up Signal. guild_id: ${this.guild_id}`); 
  }

  sendFinished()
  {
    this.sendSignal(
      {
        signal_type: CLIENT_SIGNAL.FINISHED,
      },
      false
    );

    logger.info(`Send Finished Signal. guild_id: ${this.guild_id}`); 
  }

  on(event_name, signal)
  {
    if(event_name !== CUSTOM_EVENT_TYPE.receivedMultiplayerSignal) //multiplayer signal 아니면 전부 quiz session한테 넘겨준다
    {
      super.on(event_name, signal);
      return;
    }

    const signal_type = signal.signal_type;

    if(signal_type === SERVER_SIGNAL.HOST_CHANGED)
    {
      return this.onReceivedHostChanged(signal);
    }
    else if(signal_type === SERVER_SIGNAL.NOTICE_MESSAGE)
    {
      return this.onReceivedNoticeMessage(signal);
    }
    else if(signal_type === SERVER_SIGNAL.APPLY_QUESTION_LIST)
    {
      return this.onReceivedApplyQuestionList(signal);
    }
    else if(signal_type === SERVER_SIGNAL.APPLY_NEXT_QUESTION)
    {
      return this.onReceivedApplyNextQuestion(signal);
    }
    else if(signal_type === SERVER_SIGNAL.SYNC_DONE)
    {
      return this.onReceivedSyncDone(signal);
    }
    else if(signal_type === SERVER_SIGNAL.CONFIRM_HINT)
    {
      return this.onReceivedConfirmHint(signal);
    }
    else if(signal_type === SERVER_SIGNAL.CONFIRM_SKIP)
    {
      return this.onReceivedConfirmSkip(signal);
    }
    else if(signal_type === SERVER_SIGNAL.CONFIRM_ANSWER_HIT)
    {
      return this.onReceivedConfirmAnswerHit(signal);
    }
    else if(signal_type === SERVER_SIGNAL.LEAVED_GAME)
    {
      return this.onReceivedLeavedGame(signal);
    }
    else if(signal_type === SERVER_SIGNAL.SYNC_FAILED_DETECTED)
    {
      return this.onReceivedSyncFailedDetected(signal);
    }
    else if(signal_type === SERVER_SIGNAL.CONFIRM_MVP)
    {
      return this.onReceivedConfirmMVP(signal);
    }
    else if(signal_type === SERVER_SIGNAL.EXPIRED_SESSION)
    {
      return this.onReceivedExpiredSession(signal);
    }

    return super.on(event_name, signal); //핸들 안된건 위쪽으로
  }

  onReceivedHostChanged(signal)
  {
    const new_session_id = signal.session_id;
    
    logger.debug(`Applying new host session id ${this.session_id} -> ${new_session_id}`);

    this.session_id = new_session_id;

    this.sendMessage({ content: `\`\`\`🌐 호스트 서버가 나갔습니다. 이 세션의 호스트가 ${signal.new_host_guild_info?.guild_name} 서버로 변경됐습니다.\`\`\`` });
  }

  onReceivedNoticeMessage(signal)
  {
    this.sendMessage({ content: `${signal.notice}` });
    logger.debug(`Sending notice message to ${this.guild_id}, message: ${signal.notice}`);
  }

  onReceivedApplyQuestionList(signal)
  {
    if(this.multiplayer_state !== MULTIPLAYER_STATE.INITIALIZING &&
       this.multiplayer_state !== MULTIPLAYER_STATE.WAITING_FOR_QUESTION_LIST)
    {
      logger.error(`Received Apply Question List signal. but current state is ${this.multiplayer_state}.`);
      return;
    }

    this.quiz_data.question_list = signal.question_list;
    this.quiz_data.quiz_size = signal.quiz_size;

    logger.debug(`Applying question list signal. call Prepare Cycle quiz_size: ${signal.quiz_size}/${signal.question_list.length}, guild_id: ${this.guild_id}`);
    
    if(this.quiz_data.question_list.length === 0)
    {
      logger.error(`Received Apply Question List signal. but question list is empty.`);
      this.sendMessage({content:`\`\`\`🌐 문제 목록 동기화에 실패했습니다. 원인: 생성된 문제가 없습니다.\`\`\``});
      this.forceStop();

      return;
    }

    this.multiplayer_state = MULTIPLAYER_STATE.QUESTION_LIST_READY;

    this.getCurrentCycle()?.asyncCallCycle(CYCLE_TYPE.PREPARE);
  }

  onReceivedApplyNextQuestion(signal)
  {
    // if(this.multiplayer_state !== MULTIPLAYER_STATE.WAITING_FOR_NEXT_QUESTION)
    // {
    //   logger.error(`Received Apply Next Question signal. but current state is ${this.multiplayer_state}.`);
    //   return;
    // }

    const question_num = signal.question_num;
    this.game_data['question_num'] = question_num;

    const prepared_question = cloneDeep(signal.prepared_question); 
    //!!! cloneDeep을 꼭 해줘야한다. signal 객체는 기본적으로 모든 클라이언트에 대해 공유라서 prepared_question['audio_resource'] 로 덮어씌우면 이게 공유돼서
    //Resource is already being played by another audio player. 에러 뜬다.

    Prepare.fillAudioResource(prepared_question);
    
    this.game_data.prepared_question_queue.push(prepared_question);

    this.multiplayer_state = MULTIPLAYER_STATE.NEXT_QUESTION_READY;
    this.sync_ready = true;

    logger.debug(`Applying next question signal. set sync ready. guild_id: ${this.guild_id}`);
  }

  onReceivedSyncDone(signal)
  {
    this.sync_done_sequence_num = signal.sequence_num;
    
    this.participant_guilds_info = signal.participant_guilds_info;

    logger.debug(`Received Sync Done signal ${this.sync_done_sequence_num}. calling Questioning Cycle.`);

    this.setupParticipantSelectMenu();

    this.multiplayer_state = MULTIPLAYER_STATE.QUESTIONING;
    this.goToCycle(CYCLE_TYPE.QUESTIONING); //sync해서 갈때는 goToCycle로 안그러면 current_cycle_type이 안바뀜
  }

  onReceivedConfirmHint(signal)
  {
    if(this.current_cycle_type != CYCLE_TYPE.QUESTIONING)
    {
      logger.error(`Received Confirm hint signal ${this.guild_id}. but this current cycle type is not QUESTIONING.`);
      return;
    }
    
    const question_cycle = this.getCurrentCycle();
    if(question_cycle === undefined || !(question_cycle instanceof Question))
    {
      logger.error(`Received Confirm hint signal ${this.guild_id}. but this getCurrentCycle object is not instanceof QUESTION.`);
      return;
    }
        
        
    logger.debug(`Received Confirm hint signal ${this.guild_id}. calling showHint.`);
    question_cycle.showHint(question_cycle.current_question);
  }

  onReceivedConfirmSkip(signal)
  {
    if(this.current_cycle_type != CYCLE_TYPE.QUESTIONING)
    {
      logger.error(`Received Confirm skip signal ${this.guild_id}. but this current cycle type is not QUESTIONING.`);
      return;
    }
    
    const question_cycle = this.getCurrentCycle();
    if(question_cycle === undefined || !(question_cycle instanceof Question))
    {
      logger.error(`Received Confirm skip signal ${this.guild_id}. but this getCurrentCycle object is not instanceof QUESTION.`);
      return;
    }
        
        
    logger.debug(`Received Confirm skip signal ${this.guild_id}. calling skip.`);
    question_cycle.skip(question_cycle.current_question);
  }

  onReceivedConfirmAnswerHit(signal)
  {
    if(this.current_cycle_type != CYCLE_TYPE.QUESTIONING)
    {
      logger.error(`Received Confirm answer hit signal ${this.guild_id}. but this current cycle type is not QUESTIONING.`);
      return;
    }
    
    const question_cycle = this.getCurrentCycle();
    if(question_cycle === undefined || !(question_cycle instanceof Question))
    {
      logger.error(`Received Confirm answer hit signal ${this.guild_id}. but this getCurrentCycle object is not instanceof QUESTION.`);
      return;
    }
        
    const answerer_info = signal.answerer_info;
    if(answerer_info === undefined)
    {
      logger.error(`Received Confirm answer hit signal ${this.guild_id}. but answerer info is undefined`);
      return;
    }

    logger.debug(`Received Confirm answer hit signal ${this.guild_id}. calling apply correct answer.`);
    question_cycle.applyCorrectAnswer(answerer_info.answerer_id, answerer_info.answerer_name, answerer_info.score);
    question_cycle.stopTimeoverTimer();
  }

  onReceivedLeavedGame(signal)
  {
    const leaved_guild_info = signal.leaved_guild_info;
    this.sendMessage({content: `\`\`\`🌐 ${leaved_guild_info.guild_name} 서버가 게임에서 퇴장하였습니다.\`\`\``});

    this.scoreboard.delete(leaved_guild_info.guild_id);
    logger.debug(`Received Leaved game signal ${this.guild_id}. erasing ${leaved_guild_info.guild_id} from scoreboard`);
  }

  onReceivedSyncFailedDetected(signal)
  {
    if(this.sync_failed) //이건 echo일거임
    {
      return;
    }

    const failed_guild_info = signal.failed_guild_info;
    this.sendMessage({content: `\`\`\`🌐 ${failed_guild_info.guild_name} 서버가 동기화에 실패했습니다.\n해당 서버는 퇴장으로 처리됩니다.\`\`\``});

    logger.debug(`Received sync failed signal ${this.guild_id}. erasing ${failed_guild_info.guild_id} from scoreboard`);
  }

  onReceivedConfirmMVP(signal)
  {
    this.multiplayer_state = MULTIPLAYER_STATE.FINISH_UP; //mvp 정해졌다는 신호 받은거면 finish up인거임
    this.mvp_info = signal.mvp_info;

    logger.debug(`Received MVP Info signal ${this.guild_id}. name: ${this.mvp_info.name}, score: ${this.mvp_info.score}`);
  }

  onReceivedExpiredSession(signal)
  {
    this.multiplayer_state = MULTIPLAYER_STATE.FINISH_UP; //mvp 정해졌다는 신호 받은거면 finish up인거임
    this.session_expired = true;

    logger.debug(`Received Expired Session signal ${this.guild_id} from ${signal.session_id}.`);

    this.sendMessage({ content: `\`\`\`🌐 이 서버를 제외한 모든 참여자가 퇴장하였습니다.\n현재 문제가 끝난 뒤 퀴즈가 종료되며 승리로 간주됩니다.\`\`\`` });
  }
}

//#endregion

//#region 퀴즈 cycle 용 lifecycle의 base
class QuizLifeCycle
{
  static cycle_type = CYCLE_TYPE.UNDEFINED;

  constructor(quiz_session)
  {
    // this.quiz_session = weak(quiz_session); //strong ref cycle 떄문에 weak 타입으로
    this.quiz_session = quiz_session; //weak이 얼마나 성능에 영향을 미칠 지 모르겠다. 어차피 free()는 어지간해서 타니깐 이대로하자
    this.force_stop = false;
    this.next_cycle = CYCLE_TYPE.UNDEFINED;
    this.ignore_block = false;
  }

  free()
  {
    // this.quiz_session = null;
  }

  do()
  {
    this._enter();
  }

  async asyncCallCycle(cycle_type) //비동기로 특정 cycle을 호출, PREPARE 같은거
  {
    // logger.debug(`Async call cyle from quiz session, guild_id: ${this.guild_id}, target cycle Type: ${cycle_type}`);
    if(this.quiz_session?.force_stop == true) return;

    const cycle = this.quiz_session.getCycle(cycle_type);
    if(cycle != undefined)
    {
      cycle.do();
    }
  }

  async _enter() //처음 Cycle 들어왔을 때
  {
    let goNext = true;
    if(this.enter != undefined) 
    {
      try
      {
        goNext = (await this.enter()) ?? true;    
      }
      catch(err)
      {
        if(this.force_stop == false)
          logger.error(`Failed enter step of quiz session cycle, guild_id: ${this.quiz_session?.guild_id}, current cycle Type: ${this.quiz_session?.current_cycle_type}, current cycle: ${this.constructor.name}, err: ${err.stack}`);
      }
    }

    if(this.force_stop == true || this.quiz_session?.force_stop == true)
    {
      goNext = false;
    }

    if(goNext == false && this.ignore_block == false) return;
    this._act();
  }

  async _act() //Cycle 의 act
  {
    let goNext = true;
    if(this.act != undefined) 
    {
      try
      {
        goNext = (await this.act()) ?? true;    
      }
      catch(err)
      {
        if(this.force_stop == false)
          logger.error(`Failed act step of quiz session cycle, guild_id: ${this.quiz_session?.guild_id}, current cycle Type: ${this.quiz_session?.current_cycle_type}, current cycle: ${this.constructor.name}, err: ${err.stack}`);
      }
    }

    if(this.force_stop == true || this.quiz_session?.force_stop == true)
    {
      goNext = false;
    }

    if(goNext == false && this.ignore_block == false) return;
    this._exit();
  }

  async _exit() //Cycle 끝낼 때
  {
    let goNext = true;
    if(this.exit != undefined) 
    {
      try
      {
        goNext = (await this.exit()) ?? true;    
      }
      catch(err)
      {
        if(this.force_stop == false)
          logger.error(`Failed exit step of quiz session cycle, guild_id: ${this.quiz_session?.guild_id}, current cycle Type: ${this.quiz_session?.current_cycle_type}, current cycle: ${this.constructor.name}, err: ${err.stack}`);
      }
    }

    if(this.force_stop == true || this.quiz_session?.force_stop == true)
    {
      goNext = false;
    }

    if(goNext == false && this.ignore_block == false) return;

    if(this.next_cycle == CYCLE_TYPE.UNDEFINED) //다음 Lifecycle로
    {
      return;
    }        
    this.quiz_session.goToCycle(this.next_cycle);
  }

  async forceStop(do_exit = true)
  {
    logger.info(`Call force stop quiz session on cycle, guild_id: ${this.quiz_session.guild_id}, current cycle type: ${this.quiz_session.current_cycle_type}, current cycle: ${this.constructor.name}`);
    this.quiz_session.force_stop = true;
    this.force_stop = true;
    this.next_cycle == CYCLE_TYPE.UNDEFINED;

    if(this.exit != undefined && do_exit)
    {
      this.exit(); //바로 현재 cycle의 exit호출
    }
    this.quiz_session.goToCycle(CYCLE_TYPE.FINISH); //바로 FINISH로
  }

  //이벤트 처리(비동기로 해도 무방)
  async on(event_name, event_object)
  {
    switch(event_name) 
    {
    case CUSTOM_EVENT_TYPE.interactionCreate:
      if(event_object.isButton() && event_object.customId === 'force_stop')  //강제 종료는 여기서 핸들링
      {
        let interaction = event_object;
        if(interaction.member != this.quiz_session.owner)
        {
          const reject_message = '```' + `${text_contents.quiz_play_ui.only_owner_can_use_stop}` +'```';
          interaction.channel.send({content: reject_message});
          return;
        }
        this.quiz_session.forceStop();
        let force_stop_message = text_contents.quiz_play_ui.force_stop;
        force_stop_message = force_stop_message.replace("${who_stopped}", interaction.member.user.username);
        interaction.channel.send({content: force_stop_message});
        return;
      }

      if(event_object.isButton() && this.quiz_session.already_liked == false && event_object.customId == 'like') //추천하기 버튼 눌렀을 때
      {
        const interaction = event_object;
        const quiz_info = this.quiz_session.quiz_info;

        feedback_manager.addQuizLikeAuto(interaction, quiz_info.quiz_id, quiz_info.title);
        // this.quiz_session.already_liked = true; //유저별 추천 가능이라 무조건 계속 띄우게 변경

        return;
      }

      return this.onInteractionCreate(event_object);

    case CUSTOM_EVENT_TYPE.messageCreate:
      return this.onMessageCreate(event_object);

    case CUSTOM_EVENT_TYPE.receivedMultiplayerSignal:
      return this.onReceivedMultiplayerSignal(event_object);
            
    }
  }

  /** 커스텀 이벤트 핸들러 **/
  onInteractionCreate(interaction)
  {

  }

  onMessageCreate(message)
  {

  }

  onReceivedMultiplayerSignal(multiplayer_signal)
  {

  }
}

class QuizLifeCycleWithUtility extends QuizLifeCycle //여러 기능을 포함한 class, 
{
  //오디오 재생
  async startAudio(audio_player, resource, use_fade_in = true)
  {
    const fade_in_duration = SYSTEM_CONFIG.fade_in_duration;
    if(SYSTEM_CONFIG.use_inline_volume)
    {
      if(use_fade_in)
      {
        utility.fade_audio_play(audio_player, resource, 0.1, 1.0, fade_in_duration);
        return Date.now() + fade_in_duration;  //
      }

      if(resource.volume != undefined)
        resource.volume.setVolume(1.0);
    }
        
    audio_player.play(resource); 
    return undefined;
  }

  //스코어보드 fields 가져오기
  getScoreboardFields()
  {
    const option_data = this.quiz_session.option_data;
    let scoreboard = this.quiz_session.scoreboard;
    let scoreboard_fields = [];

    if(scoreboard.size == 0)
    {
      return scoreboard_fields;
    }
        
    scoreboard = utility.sortMapByProperty(scoreboard, 'score'); //우선 정렬 1번함
    this.quiz_session.scoreboard = scoreboard;

    scoreboard_fields.push(
      {
        name: text_contents.scoreboard.title,
        value: ' \n',
      },
      // {
      //     name: '\u200b',
      //     value: '\u200b',
      //     inline: false,
      // },
    );

    const show_count = option_data.quiz.score_show_max == OPTION_TYPE.UNLIMITED ? scoreboard.size : option_data.quiz.score_show_max;

    const iter = scoreboard.entries();
    for(let i = 0; i < show_count; ++i)
    {
      const [answerer_id, answerer_info] = iter.next().value;

      let answerer_name = answerer_info.name;

      if(this.quiz_session.isMultiplayerSession())
      {
        const guild_info = this.quiz_session.getParticipant(answerer_id);
        if(guild_info !== undefined)
        {
          answerer_name = guild_info.guild_name;
        }
      }

      scoreboard_fields.push({
        name: answerer_name,
        value: `${answerer_info.score}${text_contents.scoreboard.point_name}`,
        inline: true
      });
    }

    return scoreboard_fields;
  }

  //target_question에서 정답 표시용 노래 꺼내서 재생
  async applyAnswerAudioInfo(target_question)
  {
    let audio_play_time = undefined;

    if(target_question['answer_audio_resource'] == undefined) //정답 표시용 음악 없다면 패스
    {
      return audio_play_time;
    }

    const audio_player = this.quiz_session.audio_player;
    const audio_resource = target_question['answer_audio_resource'];
    audio_play_time = target_question['answer_audio_play_time'];

    await audio_player.stop(true); //우선 지금 나오는 거 멈춤
    this.startAudio(audio_player, audio_resource); //오디오 재생
    this.autoFadeOut(audio_player, audio_resource, audio_play_time); //자동 fadeout

    return audio_play_time;
  }

  //target_question에서 정답 표시용 이미지 정보 꺼내서 세팅
  applyAnswerImageInfo(target_question)
  {
    let quiz_ui =  this.quiz_session.quiz_ui;
    if(target_question['answer_image_resource'] == undefined) //정답 표시용 이미지 있다면 표시
    {
      quiz_ui.setImage(undefined);
      return false;
    }
    const image_resource = target_question['answer_image_resource'];
    quiz_ui.setImage(image_resource);
    return true;
  }

  //페이드 아웃 자동 시작
  async autoFadeOut(audio_player, resource, audio_play_time)
  {
    if(SYSTEM_CONFIG.use_inline_volume == false)
    {
      return;
    }

    const fade_in_duration = SYSTEM_CONFIG.fade_in_duration;
    const fade_out_duration = SYSTEM_CONFIG.fade_out_duration;
    let fade_out_start_offset = audio_play_time - fade_out_duration - 1000; //해당 지점부터 fade_out 시작, 부드럽게 1초 정도 간격두자
    if(fade_out_start_offset < fade_in_duration)
    {
      fade_out_start_offset = fade_in_duration;
    }

    //일정시간 후에 fadeout 시작
    const fade_out_timer = setTimeout(() => 
    {
      this.already_start_fade_out = true;
      if(resource == undefined || resource.volume == undefined) return;
      utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, fade_out_duration);
    }, fade_out_start_offset);

    this.fade_out_timer = fade_out_timer;
  }
}
//#endregion

//#region Initialize Cycle
/** 처음 초기화 시 동작하는 Initialize Cycle들 **/
class Initialize extends QuizLifeCycle
{
  static cycle_type = CYCLE_TYPE.INITIALIZING;
  constructor(quiz_session)
  {
    super(quiz_session);
    this.next_cycle = CYCLE_TYPE.EXPLAIN;
    this.initialize_success = true;
  }

  async enter() //모든 Initialize 단계에서 공통
  {
    try
    {
      await this.basicInitialize();
    }
    catch(err)
    {
      this.initialize_success = false;
      logger.error(`Failed to basic initialize of quiz session, guild_id:${this.quiz_session.guild_id}, cycle_info:${this.cycle_info}, quiz_info: ${JSON.stringify(this.quiz_session.quiz_info)}, err: ${err.stack}`);
    }
  }

  async act() //quiz_maker_type 별로 다르게 동작
  {

  }

  async exit()
  {
    if(this.initialize_success == false)
    {
      const channel = this.quiz_session.channel;
      let fail_message = text_contents.quiz_play_ui.initialize_fail;
      fail_message = fail_message.replace("${quiz_title}", this.quiz_session.quiz_info['title']);
      channel.send({content: fail_message});
      this.forceStop(false);
      return false;
    }

    if(this.quiz_session.isMultiplayerSession() === false) //멀티면 question list 받고 할거다
    {
      this.asyncCallCycle(CYCLE_TYPE.PREPARE); //미리 문제 준비
    }
  }

  async basicInitialize()
  {
    logger.info(`Start basic initialize of quiz session, guild_id:${this.quiz_session.guild_id}`);

    const guild = this.quiz_session.guild;
    const voice_channel = this.quiz_session.voice_channel;

    //보이스 커넥션
    this.quiz_session.createVoiceConnection();
        
    if(this.quiz_session.isMultiplayerSession()) 
    {
      //멀티는 공용 옵션
      this.quiz_session.option_data = MULTIPLAYER_COMMON_OPTION;
    }
    else
    {
      //옵션 로드
      this.loadOptionData().then((option_data) => 
      {
        this.quiz_session.option_data = option_data;
      });
    }

    //UI생성
    let quiz_ui = new QuizPlayUI(this.quiz_session.channel);
    await quiz_ui.send(true); //처음에는 기다려줘야한다. 안그러면 explain 단계에서 update할 ui가 없어서 안됨
    this.quiz_session.quiz_ui = quiz_ui;

    //우선 quiz_info 에서 필요한 내용만 좀 뽑아보자
    const quiz_info = this.quiz_session.quiz_info;

    let quiz_data = {};
    quiz_data['title'] = quiz_info['title'];
    quiz_data['icon'] = quiz_info['icon'];
    quiz_data['quiz_maker_type'] = quiz_info['quiz_maker_type'];
    quiz_data['description'] = quiz_info['description'];
    quiz_data['author'] = quiz_info['author'];
    quiz_data['quiz_type'] = quiz_info['quiz_type'];
    quiz_data['quiz_size'] = quiz_info['quiz_size'];
    quiz_data['thumbnail'] = quiz_info['thumbnail'];
    quiz_data['winner_nickname'] = quiz_info['winner_nickname'];
    quiz_data['question_list'] = [];

    const game_data = {
      'question_num': -1, //현재 내야하는 문제번호
      'scoreboard': {}, //점수표
      'ranking_list': [], //순위표
      'prepared_question_queue': [], //PREPARE Cycle을 거친 퀴즈 큐
      'processing_question': undefined, //Clearing 단계에서 정리할 이전 quiz
      'audio_stream_for_close': [], //Clearing 단계에서 정리할 stream
    };
    this.quiz_session.game_data = game_data;
    this.quiz_session.quiz_data = quiz_data;
  }

  async loadOptionData()
  {
    const guild_id = this.quiz_session.guild_id;
    const option_data = option_system.getOptionData(guild_id);

    return option_data;
  }

  //정답 인정 목록 뽑아내기
  generateAnswers(answers_row)
  {
    if(answers_row == undefined)
    {
      return [];
    }

    const option_data = this.quiz_session.option_data;        

    let answers = [];
    let similar_answers = []; //유사 정답은 마지막에 넣어주자
    answers_row.forEach((answer_row) => 
    {

      answer_row = answer_row.trim();

      //유사 정답 추측
      let similar_answer = '';
      const words = answer_row.split(" ");
      if(words.length > 1)
      {
        words.forEach((split_answer) => 
        {
          if(split_answer.length == 0 || split_answer == ' ')
            return;
          similar_answer += split_answer.substring(0,1);
        });

        similar_answer = similar_answer.toLowerCase();
      }

      if(similar_answer != '')
      {
        if(answers.includes(similar_answer) == false && similar_answers.includes(similar_answer) == false)
          similar_answers.push(similar_answer);
      }
            
      const answer = answer_row.replace(/ /g,"").toLowerCase(); // /문자/gi 로 replace하면 replaceAll 로 동작, g = 전역검색 i = 대소문자 미구분
      if(answers.includes(answer) == false)
        answers.push(answer);
    });

    if(option_data.quiz.use_similar_answer == OPTION_TYPE.ENABLED) //유사 정답 사용 시
    {
      similar_answers.forEach((similar_answer) => 
      { //유사 정답도 넣어주자
        answers.push(similar_answer);
      });
    }

    if(answers.length == 0)
    {
      logger.error(`Failed to make answer, guild_id:${this.quiz_session.guild_id}, answers_row:${JSON.stringify(answers_row)}`);
    }

    return answers;
  }

  //힌트 뽑아내기
  generateHint(base_answer)
  {
    base_answer = base_answer.trim();

    let hint = undefined;
    const letter_len = base_answer.replace(/ /g, "").length;

    if(letter_len == 1) //? 정답이 1글자?
    {
      return '◼'; //그럼 그냥 1글자 가려서 줘
    }

    const hintLen = Math.ceil(letter_len / SYSTEM_CONFIG.hint_percentage); //표시할 힌트 글자 수
    let hint_index = [];
    let success_count = 0;
    for(let i = 0; i < SYSTEM_CONFIG.hint_max_try; ++i)
    {
      const rd_index = utility.getRandom(0, base_answer.length - 1); //자 랜덤 index를 가져와보자
      if(hint_index.includes(rd_index) == true || base_answer.indexOf(rd_index) === ' ') //원래 단어의 맨 앞글자는 hint에서 제외하려 했는데 그냥 해도 될 것 같다.
      {
        continue;
      }
      hint_index.push(rd_index);
      if(++success_count >= hintLen) break;
    }

    const hint_row = base_answer;
    hint = '';
    for(let i = 0; i < hint_row.length; ++i)
    {
      const chr = hint_row[i];
      if(hint_index.includes(i) == true || chr === ' ')
      {
        hint += chr;
        continue;
      }
      hint += '◼';
    }

    if(hint == undefined)
    {
      logger.error(`Failed to make hint, guild_id:${this.quiz_session.guild_id}, base_answer:${base_answer}`);
    }

    return hint;
  }

  parseFromQuizTXT(txt_path)
  {
    const quiz_info = this.quiz_session.quiz_info;
    const quiz_data = this.quiz_session.quiz_data;

    //quiz.txt를 찾았다... 이제 이걸 파싱... 난 왜 이런 방식을 사용했던걸까..?
    const info_txt_path = `${txt_path}`;
    const info_data = fs.readFileSync(info_txt_path, 'utf8');

    let question_list = [];
    let parsed_question = {};

    info_data.split('\n').forEach((line) => 
    {
      if(line.trim() == '')  //공백 line 만나면 다음 퀴즈다.
      {
        if(parsed_question['question'] != undefined) //질문 파싱에 성공했다면
        {
          question_list.push(parsed_question); //파싱한 퀴즈 넣어주자
          parsed_question = {}; //파싱 퀴즈 초기화 ㄱㄱ
        }
        return;
      } 

      if(line.startsWith('quiz_answer:')) //이게 정답이다
      {
        parsed_question['answer_string'] = line.replace('quiz_answer:', "").trim();
        return;
      }

      if(line.startsWith('desc:'))
      {
        parsed_question['author'] = [ line.replace('desc:', "").trim() ]; //author 로 바로 넣자
        return;
      }

      if(parsed_question['question'] == undefined) 
      {
        parsed_question['question'] = line + "\n";
        return;
      }
      parsed_question['question'] += line + "\n"; //그 외에는 다 질문으로

    }); //한 줄씩 일어오자

    //이제 파싱한 퀴즈에 추가 설정을 진행한다.
    question_list.forEach((question) => 
    {
      const quiz_type = quiz_data['quiz_type'];
      question['type'] = quiz_type;

      question['hint_used'] = false;
      question['skip_used'] = false;
      question['play_bgm_on_question_finish'] = true; //Question cycle 종료 후 bgm 플레이 여부, 텍스트 기반 퀴즈는 true다.

      //정답 키워드 파싱
      let answer_string = question['answer_string'] ?? '';
      let answers_row = answer_string.split("&#"); //정답은 &#으로 끊었다.
      const answers = this.generateAnswers(answers_row);
      question['answers'] = answers;

      if(quiz_type != QUIZ_TYPE.OX) //ox 퀴즈는 힌트가 없다
      {
        //힌트 만들기
        let hint = undefined;
        if(answers_row.length > 0)
        {
          hint = this.generateHint(answers_row[0]) ?? undefined;
        }
        question['hint'] = hint;
      }
            
    });

    return question_list;
  }

  buildCustomQuestion(question_row)
  {
    let question = {};
    question['type']  = QUIZ_TYPE.CUSTOM;
    question['hint_used'] = false;
    question['skip_used'] = false;
    question['play_bgm_on_question_finish'] = false; //custom 퀴즈에서는 상황에 따라 다르다

    Object.keys(question_row).forEach((key) => 
    {
      const value = question_row[key];
      question[key] = value;
    });

    const question_data = question_row.data;

    /** 문제용 이벤트 */
    //정답 값 처리
    const answer_string = question_data['answers'];
    const answers_row = answer_string.split(","); //custom quiz는 ,로 끊는다
    const answers = this.generateAnswers(answers_row);
    question['answers'] = answers;

    //퀴즈용 오디오 url 처리
    //prepare 단계에서함

    //퀴즈용 음악 구간 처리
    //prepare 단계에서함

    //퀴즈용 이미지 url 처리
    question['image_resource'] = question_data['question_image_url'];

    //퀴즈용 텍스트 처리
    question['question_text'] = question_data['question_text'];


    /** 추가 정보 이벤트 */
    //힌트 값 처리
    const hint = question_data['hint'];
    if((hint == undefined || hint === '') && answers.length > 0)
    {
      question['hint'] = this.generateHint(answers[0]); //힌트 없으면 알아서 만들기
    }
    else
    {
      question['hint'] = question_data['hint']; //지정된 값 있으면 그대로
    }

    //힌트 이미지 처리
    question['hint_image_url'] = (question_data['hint_image_url'] ?? '').length == 0 ? undefined : question_data['hint_image_url'];

    //타임 오버 됐을 때 10초의 여유 시간 줄지 여부
    question['use_answer_timer'] = question_data['use_answer_timer'];


    /** 정답 공개 이벤트 */
    //정답용 오디오
    // prepare 단계에서함

    //정답용 음악 구간
    // prepare 단계에서함

    //정답 공개용 이미지 url
    question['answer_image_resource'] = question_data['answer_image_url'];

    //정답 공개용 텍스트
    question['author'] = [ question_data['answer_text'] ];

    //문제 유형(답변 유형)
    question['answer_type'] = question_data['answer_type'] ?? ANSWER_TYPE.SHORT_ANSWER; //지정된 값 있으면 그대로

    return question;
  }

  buildDevQuestion(quiz_path, question_folder_name)
  {
    const quiz_data = this.quiz_session.quiz_data;

    const question_folder_path = quiz_path + "/" + question_folder_name;
    const question_type = quiz_data['quiz_type'];
        
    //우선 퀴즈 1개 생성
    let question = {};
    question['type'] = question_type;
    question['hint_used'] = false;
    question['skip_used'] = false;
    question['play_bgm_on_question_finish'] = false; //Question cycle 종료 후 bgm 플레이 여부

    //작곡가 파싱
    let author_string = undefined;
    let try_parse_author =  question_folder_name.split("&^"); //가수는 &^로 끊었다.

    if(try_parse_author.length > 1) //가수 데이터가 있다면 넣어주기
    {
      author_string = try_parse_author[1];

      let authors = [];
      author_string.split("&^").forEach((author_row) => 
      {
        const author = author_row.trim();
        authors.push(author);
      });

      question['author'] = authors;
    }

    //정답 키워드 파싱
    let answer_string = try_parse_author[0];
    answer_string = question_folder_name.split("&^")[0];
    let answers_row = answer_string.split("&#"); //정답은 &#으로 끊었다.
    const answers = this.generateAnswers(answers_row);
    question['answers'] = answers;


    //힌트 만들기
    let hint = undefined;
    if(answers_row.length > 0)
    {
      hint = this.generateHint(answers_row[0]) ?? undefined;
    }
    question['hint'] = hint;

    //실제 문제로 낼 퀴즈 파일
    
    const question_file_list = fs.readdirSync(question_folder_path);
    question_file_list.forEach(question_folder_filename => 
    { 
      const file_path = question_folder_path + "/" + question_folder_filename;
            
      // const stat = fs.lstatSync(file_path); //이것도 성능 잡아먹는다. 어차피 개발자 퀴즈니깐 할 필요 없음
      // if(stat.isDirectory()) return; //폴더는 건너뛰고

      if(question_type == QUIZ_TYPE.SONG || question_type == QUIZ_TYPE.IMAGE || question_type == QUIZ_TYPE.SCRIPT || question_type == QUIZ_TYPE.IMAGE_LONG || question_type == QUIZ_TYPE.OMAKASE)
      {
        question['question'] = file_path; //SONG, IMAGE 타입은 그냥 손에 잡히는게 question 이다.
      } 
      else if(question_type == QUIZ_TYPE.INTRO) //인트로 타입의 경우
      {
        if(utility.isImageFile(question_folder_filename)) //이미지 파일이면
        {
          question['answer_image'] = file_path; //answer 썸네일이다.
        }
        else if(question_folder_filename.startsWith('q')) //이게 question이다.
        {
          question['question'] = file_path;
          question['ignore_option_audio_play_time'] = true; //인트로의 노래 재생시간은 서버 영향을 받지 않음
          question['use_random_start'] = false; //인트로는 랜덤 스타트 안씀
          return;
        }
        else if(question_folder_filename.startsWith('a')) //이게 answer_audio이다.
        {
          question['answer_audio'] = file_path; 
          question['answer_audio_play_time'] = undefined;  //TODO 이거 지정 가능
        }
      } 
            
    });

    return question;
  }

  extractIpAddresses(quiz_session)
  {
    //Set Ipv4 info
    const ipv4 = utility.getIPv4Address()[0];
    if(ipv4 == undefined)
    {
      logger.info(`This session has no ipv4!, use default... wtf, guild_id:${quiz_session?.guild_id}`);
    }
    else
    {
      logger.info(`This session's selected ipv4 is ${ipv4} guild_id:${quiz_session?.guild_id}`);
      quiz_session.ipv4 = ipv4;
    }

    //Set Ipv6 info
    if(SYSTEM_CONFIG.ytdl_ipv6_USE)
    {
      const ipv6 = utility.getIPv6Address()[0];
      if(ipv6 == undefined)
      {
        logger.info(`This session is using ipv6, but cannot find ipv6... use default ip address..., guild_id:${quiz_session?.guild_id}`);
      }
      else
      {
        logger.info(`This session is using ipv6, selected ipv6 is ${ipv6}, guild_id:${quiz_session?.guild_id}`);
        quiz_session.ipv6 = ipv6;
      }
    }
  }
}

class InitializeDevQuiz extends Initialize
{
  constructor(quiz_session)
  {
    super(quiz_session);
  }

  async act() //dev 퀴즈 파싱
  {
    try
    {
      await this.devQuizInitialize();
    }
    catch(err)
    {
      this.initialize_success = false;
      logger.error(`Failed to dev quiz initialize of quiz session, guild_id:${this.quiz_session.guild_id}, cycle_info:${this.cycle_info}, quiz_data: ${JSON.stringify(this.quiz_session.quiz_data)}, err: ${err.stack}`);
    }
  }

  async devQuizInitialize()
  {
    logger.info(`Start dev quiz initialize of quiz session, guild_id:${this.quiz_session.guild_id}`);

    const quiz_info = this.quiz_session.quiz_info;
    const quiz_data = this.quiz_session.quiz_data;
    const quiz_path = quiz_info['quiz_path'];
    //실제 퀴즈들 로드
    let question_list = [];
        
    const quiz_folder_list = fs.readdirSync(quiz_path); 
                    
    const question_type = quiz_data['quiz_type'];
    quiz_folder_list.forEach(question_folder_name => 
    {

      if(question_folder_name.includes("info.txt")) return;

      if(question_folder_name.includes("quiz.txt")) //엇 quiz.txt 파일이다.
      {
        if(question_type != QUIZ_TYPE.TEXT && question_type != QUIZ_TYPE.TEXT && question_type != QUIZ_TYPE.OX) //그런데 텍스트 기반 퀴즈가 아니다?
        {
          return; //그럼 그냥 return
        }
    
        const question_folder_path = quiz_path + "/" + question_folder_name;
        question_list = this.parseFromQuizTXT(question_folder_path); //quiz.txt 에서 파싱하는 걸로...
        return;
      }

      const question = this.buildDevQuestion(quiz_path, question_folder_name);

      //question_list에 넣어주기
      if(question != undefined) 
      {
        question_list.push(question);
      }
    });

    if(question_list?.length != 0 && (question_type == QUIZ_TYPE.OX || question_type == QUIZ_TYPE.OX_LONG))
    {
      question_list.forEach((question) => 
      {
        question['answer_type'] = ANSWER_TYPE.OX;
      });
    }

    question_list.sort(() => Math.random() - 0.5); //퀴즈 목록 무작위로 섞기
    quiz_data['question_list'] = question_list;

    let selected_question_count = quiz_info['selected_question_count'] ?? quiz_info['quiz_size'];
    if(selected_question_count > question_list.length)
    {
      selected_question_count = question_list.length;
    }

    quiz_data['quiz_size'] = selected_question_count; //퀴즈 수 재정의 하자
  }
}

class InitializeCustomQuiz extends Initialize
{
  constructor(quiz_session)
  {
    super(quiz_session);
  }
    
  async act() //dev 퀴즈 파싱
  {
    try
    {
      await this.CustomQuizInitialize();
    }
    catch(err)
    {
      this.initialize_success = false;
      logger.error(`Failed to custom quiz initialize of quiz session, guild_id:${this.quiz_session.guild_id}, cycle_info:${this.cycle_info}, quiz_data: ${JSON.stringify(this.quiz_session.quiz_data)}, err: ${err.stack ?? err}`);
    }
  }

  async CustomQuizInitialize()
  {
    const guild_id = this.quiz_session.guild_id;
    logger.info(`Start custom quiz initialize of quiz session, guild_id:${guild_id}`);

    const quiz_session = this.quiz_session;
    const quiz_info = this.quiz_session.quiz_info;
    const quiz_data = this.quiz_session.quiz_data;
    //실제 퀴즈들 로드
    let question_list = [];

    const quiz_id = quiz_info['quiz_id']; //커스텀 퀴즈는 quiz_id가 있다.
    const question_row_list = quiz_info.question_list;

    if(question_row_list == undefined || question_row_list.length == 0) 
    {
      throw 'question row list is empty, quiz_id: ' + quiz_id;
    }
        
    question_row_list.forEach((question_row) => 
    {

      let question = this.buildCustomQuestion(question_row);

      /**완성했으면 넣자 */
      question_list.push(question);

    });

    this.extractIpAddresses(quiz_session);

    question_list.sort(() => Math.random() - 0.5); //퀴즈 목록 무작위로 섞기
    quiz_data['question_list'] = question_list;

    let selected_question_count = quiz_info['selected_question_count'] ?? quiz_info['quiz_size'];
    if(selected_question_count > question_list.length)
    {
      selected_question_count = question_list.length;
    }

    quiz_data['quiz_size'] = selected_question_count; //퀴즈 수 재정의 하자

    // 서버별이 아닌 유저별로 변경되면서 필요 없어짐. 무조건 추천하기 띄움
    // feedback_manager.checkAlreadyLike(quiz_id, guild_id)
    // .then((result) => 
    // {
    //     if(this.quiz_session == undefined)
    //     {
    //         return;
    //     }
            
    //     this.quiz_session.already_liked = result;

    //     logger.info(`this guild's already liked value = ${this.quiz_session.already_liked}, guild_id:${this.quiz_session.guild_id}`);
    // });

    this.quiz_session.already_liked = false; //무조건 띄운다.
  }
}

class InitializeOmakaseQuiz extends Initialize
{
  constructor(quiz_session)
  {
    super(quiz_session);
  }
    
  async act() //dev 퀴즈 파싱
  {
    try
    {
      const is_multiplayer = this.quiz_session.isMultiplayerSession();

      if (is_multiplayer) 
      {
        this.quiz_session.waitForQuestionList();
      
        if(this.quiz_session.isHostSession()) // 멀티플레이어일 때만 호스트 확인
        { 
          await this.OmakaseQuizInitialize();
          this.quiz_session.sendQuestionListInfo();
        }
      }
      else 
      {
        await this.OmakaseQuizInitialize(); // 멀티플레이어가 아닐 때 초기화
      }
    }
    catch(err)
    {
      this.initialize_success = false;
      logger.error(`Failed to omakase quiz initialize of quiz session, guild_id:${this.quiz_session.guild_id}, cycle_info:${this.cycle_info}, quiz_data: ${JSON.stringify(this.quiz_session.quiz_data)}, err: ${err.stack}`);
    }
  }

  async OmakaseQuizInitialize()
  {
    const guild_id = this.quiz_session.guild_id;
    logger.info(`Start omakase quiz initialize of quiz session, guild_id:${guild_id}`);

    const quiz_session = this.quiz_session;
    const quiz_info = this.quiz_session.quiz_info;
    const quiz_data = this.quiz_session.quiz_data;
    //실제 퀴즈들 로드
    let question_list = [];

    //오마카세 퀴즈 설정 값
    const use_basket_mode = quiz_info['basket_mode'] ?? true;

    let total_dev_question_count = undefined;
    let dev_question_list = undefined;
    let total_custom_question_count = undefined;
    let custom_question_list = undefined;
    let selected_question_count = quiz_info['selected_question_count']; //최대 문제 개수도 있다.
    const limit = selected_question_count * 2; //question prepare 에서 오류 발생 시, failover 용으로 넉넉하게 2배 잡는다.

    let dev_quiz_count = 0;
    let custom_quiz_count = 0;

    if(use_basket_mode === false) //장르 선택 모드
    {
      const dev_quiz_tags = quiz_info['dev_quiz_tags']; //오마카세 퀴즈는 quiz_tags 가 있다.
      const custom_quiz_type_tags = quiz_info['custom_quiz_type_tags']; //오마카세 퀴즈는 quiz_type_tags 가 있다.
      const custom_quiz_tags = quiz_info['custom_quiz_tags']; //오마카세 퀴즈는 quiz_tags 도 있다.
          
      const certified_filter = quiz_info['certified_filter'] ?? true; //인증된 퀴즈에서만 뽑을지 필터
  
      //무작위로 question들 뽑아내자. 각각 넉넉하게 limit 만큼 뽑는다.
      [total_dev_question_count, dev_question_list] = tagged_dev_quiz_manager.getQuestionListByTags(dev_quiz_tags, limit);
      [total_custom_question_count, custom_question_list] = await loadQuestionListFromDBByTags(custom_quiz_type_tags, custom_quiz_tags, limit, certified_filter);

      //장르 선택 모드는 각각 문제 수 비율로 limit을 나눠 가진다.
      const total_all_question_count = total_dev_question_count + total_custom_question_count; //둘 합치고
      dev_quiz_count = Math.round(total_dev_question_count / total_all_question_count * limit);
      custom_quiz_count = Math.round(total_custom_question_count / total_all_question_count * limit);
    }
    else //장바구니 모드
    {
      const dev_quiz_tags = quiz_info['dev_quiz_tags']; //오마카세 퀴즈는 quiz_tags 가 있다.
      [total_dev_question_count, dev_question_list] = tagged_dev_quiz_manager.getQuestionListByTags(dev_quiz_tags, limit);

      const basket_items = quiz_info['basket_items'];

      const basket_items_value = Object.values(basket_items);
      if(basket_items_value.length > 0)
      {
        const basket_condition_query = '(' + basket_items_value
          .map(basket_item => basket_item.quiz_id)
          .join(',') + ')';  

        [total_custom_question_count, custom_question_list] = await loadQuestionListByBasket(basket_condition_query, limit);
      }
      else
      {
        [total_custom_question_count, custom_question_list] = [0, []];
      }

      //장바구니 모드는 각각 반반씩 문제를 limit을 나눠 갖는다.
      dev_quiz_count = Math.round(limit / 2);
      custom_quiz_count = Math.round(limit / 2);
    }

    logger.info(`Omakase Question count of this session. use_basket_mode=${use_basket_mode}, dev=${dev_quiz_count}, custom=${custom_quiz_count}, limit=${limit}`);
    
        
    //좀 더 세부적으로 섞어야할 것 같은데...너무 귀찮다 우선 걍 이렇게 ㄱㄱ하자

    //build dev questions 
    dev_question_list.slice(0, dev_quiz_count).forEach(question_row => 
    {
      const quiz_path = question_row['quiz_path'];
      const question_path = question_row['path'];
      const question = this.buildDevQuestion(quiz_path, question_path);

      //question_list에 넣어주기
      if(question != undefined) 
      {
        question['question_title'] = question_row['title'];

        let additional_text = '```';
            
        const tags_string = "🔹 퀴즈 태그: " + question_row['tag'] + '\n';
        additional_text += tags_string;

        additional_text += "🔹 퀴즈 제작: 공식 퀴즈\n";

        additional_text += '```';

        question['question_text'] = additional_text + "\n\n" + (question['question_text'] ?? '');

        question['prepare_type'] = "DEV";
        question_list.push(question);
      }
    });

    //build custom questions
    custom_question_list.slice(0, custom_quiz_count).forEach((question_row) => 
    {

      let question = this.buildCustomQuestion(question_row);

      question['question_title'] = question.data['quiz_title'];

      let additional_text = '```';
            
      const tags_value = question.data['tags_value'];
      const tags_string = "🔹 퀴즈 태그: " + utility.convertTagsValueToString(tags_value) + '\n';
      additional_text += tags_string;
            
      const creator_name = question.data['creator_name'] ?? '';
      if(creator_name != undefined)
      {
        additional_text += "🔹 퀴즈 제작: " + creator_name + '\n';
      }

      const simple_description = question.data['simple_description'] ?? '';
      if(simple_description != undefined)
      {
        additional_text += "🔹 한줄 설명: " + simple_description + '\n';
      }

      additional_text += '```';

      question['question_text'] = additional_text + "\n\n" + (question['question_text'] ?? '');

      question['prepare_type'] = "CUSTOM";
      question_list.push(question);

    });
        
    this.extractIpAddresses(quiz_session); //IP는 언제나 준비

    question_list.sort(() => Math.random() - 0.5); //퀴즈 목록 무작위로 섞기
    quiz_data['question_list'] = question_list;

    if(selected_question_count > question_list.length)
    {
      selected_question_count = question_list.length;
    }

    quiz_data['quiz_size'] = selected_question_count; //퀴즈 수 재정의 하자
  }
}

class InitializeUnknownQuiz extends Initialize
{
  constructor(quiz_session)
  {
    super(quiz_session);
    this.next_cycle = CYCLE_TYPE.FINISH;
  }
    
  async enter() //에러
  {
    const channel = this.quiz_session.channel;
    channel.send({content: text_contents.quiz_play_ui.unknown_quiz_type});
    logger.info(`this quiz session entered Unknown initialize, guild_id:${this.quiz_session.guild_id}, quiz_info: ${JSON.stringify(this.quiz_session.quiz_info)}`);
    this.forceStop();
  }
}

//#endregion

//#region Explain Cycle
/** 게임 방식 설명하는 단계인 Explain **/
class Explain extends QuizLifeCycle
{
  static cycle_type = CYCLE_TYPE.EXPLAIN;
  constructor(quiz_session)
  {
    super(quiz_session);
    this.next_cycle = CYCLE_TYPE.QUESTIONING;
  }

  async act()
  {
    const quiz_data = this.quiz_session.quiz_data;
    const quiz_type = ['quiz_type'];
    let quiz_ui = this.quiz_session.quiz_ui;

    quiz_ui.embed.color = 0xFED049,

    quiz_ui.embed.title = text_contents.quiz_explain.title;
    quiz_ui.embed.description = ' \n \n';

    quiz_ui.components = [];

    let explain_type = EXPLAIN_TYPE.SHORT_ANSWER_TYPE;
    if(quiz_data.quiz_maker_type == QUIZ_MAKER_TYPE.CUSTOM)
    {
      explain_type = EXPLAIN_TYPE.CUSTOM_ANSWER_TYPE;
    }

    if(this.quiz_session.isMultiplayerSession())
    {
      explain_type = EXPLAIN_TYPE.MULTIPLAYER_ANSWER_TYPE;
    }
        
    const explain_list = text_contents.quiz_explain[explain_type];
    for(let i = 0; i < explain_list.length; ++i)
    {
      if(this.quiz_session?.force_stop === true)
      {
        return;
      }

      const explain = explain_list[i];
      quiz_ui.embed.description += explain;
      utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.PLING);
      quiz_ui.update();

      await utility.sleep(SYSTEM_CONFIG.explain_wait);
    }
  }

  async exit()
  {
    if(this.quiz_session.isMultiplayerSession())
    {
      this.next_cycle = CYCLE_TYPE.HOLD;
      this.quiz_session.waitForSyncDone();
    }
  }

}

//#endregion

//#region Prepare Cycle
/** 퀴즈 내기 전, 퀴즈 준비하는 단계인 Prepare **/
class Prepare extends QuizLifeCycle
{
  static cycle_type = CYCLE_TYPE.PREPARE;
  constructor(quiz_session)
  {
    super(quiz_session);
    this.next_cycle = CYCLE_TYPE.UNDEFINED;
    this.skip_prepare = false;
    this.prepared_question = undefined;
    this.target_question = undefined;
  }

  async enter()
  {
    if(this.quiz_session == undefined)
    {
      return false;
    }

    //다음에 문제낼 퀴즈 꺼내기
    let game_data = this.quiz_session.game_data;

    this.quiz_session.game_data['question_num'] += 1;

    if(this.quiz_session.hasMoreQuestion() === false
      || this.quiz_session.quiz_data['question_list'].length === 0) //모든 퀴즈 제출됐음
    {
      this.skip_prepare = true;
      return; //더 이상 준비할 게 없으니 return
    }
  }

  async act()
  {
    if(this.skip_prepare == true || this.quiz_session?.force_stop == true)
    {
      return;
    }

    //다음에 문제낼 퀴즈 꺼내기
    let quiz_data = this.quiz_session.quiz_data;
    let game_data = this.quiz_session.game_data;

    const question_num = game_data['question_num'];
    let target_question = quiz_data['question_list'].pop(); //어차피 앞에서부터 꺼내든, 뒤에서부터 꺼내든 랜덤인건 똑같다.

    if(this.quiz_session.isMultiplayerSession()) //멀티플레이 참가자 입장이라면 prepare 할 필요 없다.
    {
      this.quiz_session.waitForNextQuestionData();
    
      if(this.quiz_session.isHostSession() === false)
      {
        return false;
      }
    }

    this.target_question = target_question;

    const question_type = target_question['type'];
        
    try
    {
      if(question_type == QUIZ_TYPE.CUSTOM)
      {
        await this.prepareCustom(target_question);
        //정답 표시 정보도 prepareCustom에서 한번에 한다
      }
      else if(question_type == QUIZ_TYPE.OMAKASE)
      {
        const prepare_type = target_question['prepare_type'];

        if(prepare_type === 'DEV')
        {
          await this.prepareLocalAudio(target_question);
        }
        else if(prepare_type === 'CUSTOM')
        {
          await this.prepareCustom(target_question);   
        }
        else
        {
          logger.error(`Unknown Prepare Type for OMAKASE Quiz! target_question: ${JSON.stringify(target_question)}`);
        }
      }
      else
      {
        if(question_type == QUIZ_TYPE.SONG || question_type == QUIZ_TYPE.INTRO || question_type == QUIZ_TYPE.SCRIPT)
        {
          await this.prepareLocalAudio(target_question);
        }
        else if(question_type == QUIZ_TYPE.IMAGE || question_type == QUIZ_TYPE.IMAGE_LONG)
        {
          await this.prepareImage(target_question);
        }
        else if(question_type == QUIZ_TYPE.TEXT || question_type == QUIZ_TYPE.OX)
        {
          await this.prepareText(target_question);
        }
        await this.prepareAnswerAdditionalInfo(target_question); //정답 표시 시, 사용할 추가 정보
      }
    }
    catch(err)
    {
      if(this.quiz_session == undefined)
      {
        logger.error(`Failed prepare step by quiz_session undefined, guess force stop`);
        this.skip_prepare = true;
        return;
      }
      logger.error(`Failed prepare enter step quiz, guild_id:${this.quiz_session?.guild_id}, target_question: ${target_question?.question ?? target_question.question_audio_url}, question_id: ${target_question?.question_id ?? "no id"} err: ${err.stack ?? err.message}`);
      target_question['question_text'] += "\n\nAUDIO_ERROR: " + err.message; //에러나면 UI에도 표시해주자

      if(err.message.includes("bind") && this.quiz_session.ipv6 != undefined && SYSTEM_CONFIG.ytdl_ipv6_USE) //ip bind error면
      {
        const current_ip = this.quiz_session.ipv6;
        const new_ip = utility.getIPv6Address()[0];

        if(current_ip != new_ip) //다시 한번 찾아본다.
        {
          logger.info(`Detected IPv6 Address has been changed! recreating ytdl agent...[${current_ip} -> ${new_ip}]`);
          this.quiz_session.ipv6 = new_ip;
        }
      }
    }

    this.prepared_question = target_question;

    if(this.quiz_session.isMultiplayerSession() && this.quiz_session.isHostSession())
    {
      this.quiz_session.sendPreparedQuestion(this.prepared_question);
      return false; //만들고 실제로 prepared queue에 넣으면 안됨.
    }
  }

  async exit()
  {
    if(this.skip_prepare == true) return;

    if(this.quiz_session.force_stop == true) return;

    let game_data = this.quiz_session.game_data;

    if(this.prepared_question == undefined) //prepare 시도했는데 실패했다면
    {
      logger.error(`No Prepared quiz, ignore exit step, guild_id:${this.quiz_session?.guild_id}, target_question: ${JSON.stringify(this.target_question?.question)}`);
    }

    game_data.prepared_question_queue.push(this.prepared_question);
    delete this.target_question;
        
    return;
  }

  async prepareAnswerAdditionalInfo(target_question) //dev퀴즈용으로만 사용
  {
    const option_data = this.quiz_session.option_data;
    const game_data = this.quiz_session.game_data;

    if(target_question.hasOwnProperty('answer_audio'))
    {
      const question = target_question['answer_audio'];

      const audio_stream = fs.createReadStream(question, {flags:'r'});
    
      let audio_resource = undefined;
      audio_resource = createAudioResource(audio_stream, {
        inputType: StreamType.WebmOpus,
        inlineVolume: SYSTEM_CONFIG.use_inline_volume,
      });

      if(SYSTEM_CONFIG.use_inline_volume)
      {
        audio_resource.volume.setVolume(0);
      }

      target_question['answer_audio_resource'] = audio_resource;
      //오디오 재생 길이 가져오기
      let audio_play_time = target_question['answer_audio_play_time'];
      if(audio_play_time == -1) //-1은 그냥 서버 설정 사용하는 것
      {
        audio_play_time = undefined;
      }
      else if(audio_play_time == undefined) //딱히 지정된게 없다면
      {
        const audio_info = await utility.getAudioInfoFromPath(question);
        audio_play_time = ((audio_info.format.duration) ?? SYSTEM_CONFIG.max_answer_audio_play_time) * 1000; //오디오 길이 값 있으면 무조건 오디오 길이 쓰도록 //TODO 이게 맞나? 재고해보셈
      }
      target_question['answer_audio_play_time'] = audio_play_time;

    }

    if(target_question.hasOwnProperty('answer_image'))
    {
      const image_resource = target_question['answer_image'];
      target_question['answer_image_resource'] = image_resource;
    }
  }

  /** 오디오 파일 경로와, 오디오 파일의 전체 재싱길이, 시작 지점을 기준으로 스트림 반환 */
  static generateAudioFileStream(audio_path, audio_duration, audio_start_point, audio_length)
  {
    let audio_stream = undefined;
    let inputType = StreamType.WebmOpus;
 
    const stats = fs.statSync(audio_path);
    const size_in_bytes = stats.size;
    const bitrate = Math.ceil(size_in_bytes / audio_duration * 8);

    if(audio_path.endsWith('.webm') == false) //webm 아니면 그냥 재생하자
    {
      const bytes_of_start_point = Math.ceil((size_in_bytes / audio_duration) * audio_start_point);
      audio_stream = fs.createReadStream(audio_path, { 
        flags: 'r',
        // start: bytes_of_start_point //이거 안 먹는다...
      });
      inputType = StreamType.Arbitrary;
    
      return [audio_stream, inputType];
    }
    
    if (audio_start_point != undefined && audio_start_point !== 0) 
    {

      //SeekStream 가져다 쓰는 방식, 열심히 커스텀했다
      //23.11.08 대충 예상컨데 아마 파일은 ReadStream으로만 읽어올 수 있는데 유튜브용 SeekStream을 파일로도 쓸 수 있게 바꿨던 것 같다
      const seek_stream = new SeekStream(
        audio_path,
        (audio_length + 10), //duration, 10는 패딩
        0, //header length 안넘겨도됨
        size_in_bytes,
        bitrate, //TODO BITRATE 값인데, undefined로 넘기면 알아서 계산함
        undefined,
        {
          file: true,
          seek: parseInt(audio_start_point) + 1,
        }
      );

      audio_stream = seek_stream.stream;
      inputType = seek_stream.type;
    } 
    else 
    {
      audio_stream = fs.createReadStream(audio_path, { flags: 'r' });
    }
    
    return [audio_stream, inputType];
  }
    
  static generateAudioResource(audio_stream, inputType) 
  {
    let resource = createAudioResource(audio_stream, 
      {
        inputType: inputType,
        inlineVolume: SYSTEM_CONFIG.use_inline_volume,
      });
    
    if (SYSTEM_CONFIG.use_inline_volume) 
    {
      resource.volume.setVolume(0);
    }
    
    return resource;
  }

  /** 멀티에서나 쓰는거임. question 에서 audio_file_stream_info 값 기반으로 audio resource 생성해줌*/
  static fillAudioResource(question)
  {
    const question_audio_file_stream_info = question['audio_file_stream_info'];
    const answer_audio_file_stream_info = question['answer_audio_file_stream_info'];

    if(question_audio_file_stream_info != undefined)
    {
      const file_path = question_audio_file_stream_info.file_path;
      const audio_duration_sec = question_audio_file_stream_info.audio_duration_sec;
      const audio_start_point = question_audio_file_stream_info.audio_start_point;
      const audio_length_sec = question_audio_file_stream_info.audio_length_sec;

      const [audio_stream, inputType] = Prepare.generateAudioFileStream(file_path, audio_duration_sec, audio_start_point, audio_length_sec);
      const resource = Prepare.generateAudioResource(audio_stream, inputType);

      question['audio_resource'] = resource;
    }

    if(answer_audio_file_stream_info != undefined)
    {
      const file_path = answer_audio_file_stream_info.file_path;
      const audio_duration_sec = answer_audio_file_stream_info.audio_duration_sec;
      const audio_start_point = answer_audio_file_stream_info.audio_start_point;
      const audio_length_sec = answer_audio_file_stream_info.audio_length_sec;

      const [audio_stream, inputType] = Prepare.generateAudioFileStream(file_path, audio_duration_sec, audio_start_point, audio_length_sec);
      const resource = Prepare.generateAudioResource(audio_stream, inputType);

      question['answer_audio_resource'] = resource;
    }
  }

  getRandomAudioStartPoint(audio_min_start_point, audio_max_start_point, audio_length_sec, use_improved_audio_cut) 
  {
    if (audio_max_start_point <= audio_min_start_point)  // 충분히 재생할 수 있는 start point가 없다면
    {
      return parseInt(audio_min_start_point);
    }

    if (use_improved_audio_cut) // 최대한 중간 범위로 좁힌다.
    { 
      const refinedPoints = this.refineAudioPoints(audio_min_start_point, audio_max_start_point, audio_length_sec);
      audio_min_start_point = refinedPoints.audio_min_start_point;
      audio_max_start_point = refinedPoints.audio_max_start_point;
    }

    const audio_start_point = parseInt(utility.getRandom(audio_min_start_point, audio_max_start_point));
    return audio_start_point;
  }
    
  refineAudioPoints(audio_min_start_point, audio_max_start_point, audio_length_sec) 
  {
    const audio_length_sec_half = audio_length_sec / 2;
    const audio_mid_point = (audio_min_start_point + audio_max_start_point) / 2;
    const refined_audio_min_start_point = audio_mid_point - audio_length_sec_half;
    const refined_audio_max_start_point = audio_mid_point + audio_length_sec_half;
    
    if (audio_min_start_point < refined_audio_min_start_point 
            && refined_audio_max_start_point < audio_max_start_point) // 좁히기 성공이면
    { 
      logger.debug(`Refined audio point, min: ${audio_min_start_point} -> ${refined_audio_min_start_point}, max: ${audio_max_start_point} -> ${refined_audio_max_start_point}`);
      return { audio_min_start_point: refined_audio_min_start_point, audio_max_start_point: refined_audio_max_start_point };
    }
    
    return { audio_min_start_point, audio_max_start_point };
  }

  async prepareLocalAudio(target_question)
  {
    const { option_data, game_data } = this.quiz_session;
    const question = target_question['question'];
    const ignore_option_audio_play_time = target_question['ignore_option_audio_play_time'] ?? false; // 노래 전체 재생 여부
    let use_random_start = target_question['use_random_start'] ?? true; // 노래 어디서부터 시작할 지 랜덤으로 설정 여부
        
    // 오디오 정보 가져오기
    const audio_info = await utility.getAudioInfoFromPath(question); // TODO: 상당한 리소스를 먹는 것 같은데 확인필요
    const audio_duration_sec = parseInt(audio_info.format.duration) ?? SYSTEM_CONFIG.max_question_audio_play_time; // duration 없으면 무조건 서버 설정 값 따르게 할거임
        
    // 오디오 길이 먼저 넣어주고
    const audio_play_time_sec = option_data.quiz.audio_play_time / 1000; 
    let audio_length_sec = Math.min(audio_play_time_sec, audio_duration_sec); // 오디오 길이와 재생할 시간 중 작은 값을 사용
    use_random_start = audio_duration_sec >= audio_length_sec && use_random_start;
    target_question['audio_length'] = audio_length_sec * 1000;
        
    let audio_start_point;
        
    if (ignore_option_audio_play_time == false && use_random_start) 
    {
      const audio_max_start_point = audio_duration_sec - (audio_length_sec + 2.5);  // 우선 이 지점 이후로는 시작 지점이 될 수 없음, +2.5 하는 이유는 padding임
      const audio_min_start_point = 2.5;  // 앞에도 2.5초 정도 자르고 싶음
      const use_improved_audio_cut = (option_data.quiz.improved_audio_cut === OPTION_TYPE.ENABLED);
            
      audio_start_point = this.getRandomAudioStartPoint(audio_min_start_point, audio_max_start_point, audio_length_sec, use_improved_audio_cut);
      logger.debug(`cut audio, question: ${question}, point: ${audio_start_point} ~ ${(audio_start_point + audio_length_sec)}`);
    }
        
    const audio_file_stream_info = { //멀티에서 쓰려고 있는거임
      file_path: question,
      audio_duration_sec: audio_duration_sec,
      audio_start_point: audio_start_point,
      audio_length_sec: audio_length_sec,
    };

    target_question['audio_file_stream_info'] = audio_file_stream_info;

    if(this.quiz_session.isMultiplayerSession()) //멀티플레이라면 Prepare에서 audio_stream을 만들지 않는다.
    {
      return;
    }

    const [audio_stream, inputType] = Prepare.generateAudioFileStream(question, audio_duration_sec, audio_start_point, audio_length_sec);
    const resource = Prepare.generateAudioResource(audio_stream, inputType);
        
    target_question['audio_resource'] = resource;
  }

  async prepareImage(target_question)
  {
    const question = target_question['question'];
    target_question['image_resource'] = question;
    const question_type = target_question['type'];
    target_question['is_long'] = (question_type == QUIZ_TYPE.IMAGE_LONG ? true : false);
  }

  async prepareText(target_question)
  {
    const question = target_question['question'];
    target_question['question'] = " \n" + question + " \n";
    const question_type = target_question['type'];
    target_question['is_long'] = ((question_type == QUIZ_TYPE.TEXT_LONG || question_type == QUIZ_TYPE.OX_LONG) ? true : false);
  }

  async prepareCustom(target_question) //TODO 나중에 Dev quiz랑 중복 코드 처리하자...어우 귀찮아
  {
    const { option_data, game_data, ipv4, ipv6 } = this.quiz_session;
    const target_question_data = target_question.data;
        
    /**
         * question_audio_url, 문제용 오디오 url
         * audio_start, 최소 시작 구간
         * audio_end, 최대 재생
         * audio_play_time. 재생 시간
         */
    const question_audio_url = target_question_data['question_audio_url'];
        
    const { audio_play_time, audio_start, audio_end } = target_question_data;
    
    const [question_audio_resource, question_audio_play_time_ms, question_error_message, question_audio_file_stream_info] = 
            await this.generateAudioResourceFromWeb(
              question_audio_url, 
              audio_start, 
              audio_end, 
              SYSTEM_CONFIG.max_question_audio_play_time, 
              [ipv4, ipv6]
            );
    
    target_question['audio_resource'] = question_audio_resource;
    target_question['audio_length'] = question_audio_play_time_ms;
    
    if (question_error_message) 
    {
      target_question['question_text'] += `\n\nAUDIO_ERROR: ${question_error_message}`;
    }
    else
    {
      target_question['audio_file_stream_info'] = question_audio_file_stream_info;
    }
        
    /**
         * question_image_url, 문제용 이미지 url
         */
    //Initial 할 때 이미 처리됨 target_question_data['question_image_url'];
        
    /**
         * question_answers. 문제 정답
         */
    //Initial 할 때 이미 처리됨 target_question_data['answers'];
        
    /**
         * question_text, 문제용 텍스트
         */
    //Initial 할 때 이미 처리됨 target_question_data['question_text'];
        
    /**
         * hint, 문제 힌트
         */
    //Initial 할 때 이미 처리됨 target_question_data['hint'];
        
    /**
         * hint_image_url, 문제 힌트용 이미지
         */
    //Initial 할 때 이미 처리됨 target_question_data['hint_image_url'];
        
    /**
         * use_answer_timer, 타임 오버 됐을 때 10초의 여유 시간 줄지 여부
         */
    //Initial 할 때 이미 처리됨 target_question_data['use_answer_timer'];
        
    /**
         * answer_audio_url, 정답 공개용 오디오 url
         * answer_audio_start, 
         * answer_audio_end
         * answer_audio_play_time
         */

    if(this.quiz_session.isMultiplayerSession()) //멀티면 동기로
    {
      await this.prepareCustomAnswer(target_question, target_question_data, [ipv4, ipv6]);
    }
    else //멀티 아니면 비동기로
    {
      setTimeout(() => 
      {
        this.prepareCustomAnswer(target_question, target_question_data, [ipv4, ipv6]);
      }
      , 0);    
    }
        
    /**
         * answer_image_url, 정답 공개용 이미지 url
         */
    //Initial 할 때 이미 처리됨 target_question_data['answer_image_url'];
        
    /**
         * answer_text, 정답 공개용 텍스트
         */
    //Initial 할 때 이미 처리됨 target_question_data['answer_text'];
  }

  async prepareCustomAnswer(target_question, target_question_data, ip_data)
  {
    { //정답 오디오 준비는 비동기로 실행한다.
      const before_question_num = this.quiz_session.game_data['question_num'];
            
      const answer_audio_url = target_question_data['answer_audio_url'];

      const { answer_audio_play_time, answer_audio_start, answer_audio_end } = target_question_data;

      const [answer_audio_resource, answer_audio_play_time_ms, answer_error_message, answer_audio_file_stream_info] = 
            await this.generateAudioResourceFromWeb(
              answer_audio_url, 
              answer_audio_start, 
              answer_audio_end, 
              SYSTEM_CONFIG.max_answer_audio_play_time, 
              ip_data
            );

      const after_question_num = this.quiz_session.game_data['question_num'];

      if(before_question_num != after_question_num)
      {
        return; 
      }
    
      target_question['answer_audio_resource'] = answer_audio_resource;
      target_question['answer_audio_play_time'] = answer_audio_play_time_ms;
        
      if (answer_error_message) 
      {
        target_question['author'].push(`\n\nAUDIO_ERROR: ${answer_error_message}`);
      }
      else
      {
        target_question['answer_audio_file_stream_info'] = answer_audio_file_stream_info;
      }
    }
  }

  /** audio_url_row: 오디오 url, audio_start_point: 오디오 시작 지점(sec), audio_end_point: 오디오 끝 지점(sec), audio_play_time_point: 재생 시간(sec)*/
  async generateAudioResourceFromWeb(audio_url, audio_start_point=undefined, audio_end_point=undefined,  max_play_time=undefined) 
  {
    if(audio_url == undefined)
    {
      return [undefined, undefined, undefined];
    }

    let error_message;

    const video_id = utility.extractYoutubeVideoID(audio_url);
    if(video_id == undefined || video_id == '')
    {
      logger.warn(`${audio_url} has no video id`);
      error_message = `${audio_url} has no video id`;
      return [undefined, undefined, error_message];
    }

    //캐시 체크 및 다운로드
    const cache_file_name = `${video_id}.webm`;
    let cache_file_path = audio_cache_manager.getAudioCache(video_id);
    if(cache_file_path == undefined) //no cache file
    {
      const cache_info = audio_cache_manager.getAudioCacheInfo(video_id);
      if(cache_info?.cache_result.need_retry == false) //이 경우 어차피 재시도해도 캐싱 안되는건 똑같은거임
      {
        logger.info(`Skip downloading cache reason: ${cache_info.cache_result.causation_message}`);
        return [undefined, undefined, cache_info.cache_result.causation_message];
      }

      logger.info(`No cache file of ${video_id}. downloading cache`);
            
      this.quiz_session.sendMessage({content: `\`\`\`🔸 현재 재생할 오디오에 대한 캐시가 없어 다운로드 중입니다. 시간이 좀 걸릴 수 있습니다... ㅜㅜ 😥\`\`\``});

      const ip_info = {
        ipv4: this.quiz_session.ipv4,    
        ipv6: this.quiz_session.ipv6,
      };
      const result = await audio_cache_manager.downloadAudioCache(audio_url, video_id, ip_info);

      if(result.success == false) //캐시 다운로드 실패...ㅜㅜ
      {
        logger.info(`Failed to downloading cache reason: ${result.causation_message}`);
        return [undefined, undefined, result.causation_message];
      }
      else
      {
        cache_file_path = audio_cache_manager.getAudioCache(video_id);
      }
    }
    else
    {
      logger.debug(`Found cache file of ${video_id}.`);
    }
        
    //캐시 다운로드 성공 또는 이미 캐시 존재!
        
    //재생 길이 구하기, 구간 지정했으면 그래도 재생할 수 있는 최대치는 재생해줄거임
    const audio_info = audio_cache_manager.getAudioCacheInfo(video_id);
    let  audio_duration_sec = audio_info.duration ?? 0;

    if(audio_duration_sec == undefined)
    {
      logger.warn(`no audio duration by getAudioCacheDuration. ${cache_file_name}`);
      const audio_info =  await utility.getAudioInfoFromPath(cache_file_path);
      audio_duration_sec = parseInt(audio_info.format.duration);
    }

    const option_data = this.quiz_session.option_data;
    let audio_length_sec = Math.floor(option_data.quiz.audio_play_time / 1000); //우선 서버 설정값

    if(audio_start_point == undefined || audio_start_point >= audio_duration_sec) //시작 요청 값 없거나, 시작 요청 구간이 오디오 범위 넘어서면
    {
      audio_start_point = 0; //구간 요청값 무시
      audio_end_point = audio_duration_sec;
    }
    else //커스텀 구간이 잘 있다?
    {
      if(audio_end_point == undefined || audio_end_point > audio_duration_sec) //끝 요청 값 없거나, 오디오 길이 초과화면 자동으로 최대치
      {
        audio_end_point = audio_duration_sec;
      }

      audio_length_sec = audio_end_point - audio_start_point; //우선 딱 구간만큼만 재생
    }

    if(audio_length_sec > audio_duration_sec)
    {
      audio_length_sec = audio_duration_sec; //오디오 길이보다 더 재생할 순 없다.
    }

    if(audio_length_sec > max_play_time) 
    {
      audio_length_sec = max_play_time; //최대치를 넘어설 순 없다
    }

    //오디오 시작 지점이 될 수 있는 포인트 범위
    const audio_min_start_point = audio_start_point;
    const audio_max_start_point = audio_end_point - audio_length_sec;
    const use_improved_audio_cut = (option_data.quiz.improved_audio_cut === OPTION_TYPE.ENABLED);

    //오디오 자르기 기능
    audio_start_point = this.getRandomAudioStartPoint(audio_min_start_point, audio_max_start_point, audio_length_sec, use_improved_audio_cut);
    logger.debug(`cut audio: ${audio_url}, point: ${audio_start_point} ~ ${(audio_start_point + audio_length_sec)}`);

    const audio_file_stream_info = { //멀티에서 쓰려고 있는거임
      file_path: cache_file_path,
      audio_duration_sec: audio_duration_sec,
      audio_start_point: audio_start_point,
      audio_length_sec: audio_length_sec,
    };

    if(this.quiz_session.isMultiplayerSession()) //멀티플레이라면 Prepare에서 audio_stream을 만들지 않는다.
    {
      return [undefined, audio_length_sec * 1000, undefined, audio_file_stream_info];
    }

    const [audio_stream, inputType] = Prepare.generateAudioFileStream(cache_file_path, audio_duration_sec, audio_start_point, audio_length_sec);
    const resource = Prepare.generateAudioResource(audio_stream, inputType);

    return [resource, audio_length_sec * 1000, undefined, audio_file_stream_info];
  }
}

//#endregion

//#region Question Cycle
/** 퀴즈 내는 단계인 Question, 여기가 제일 처리할게 많다. **/
class Question extends QuizLifeCycleWithUtility
{
  static cycle_type = CYCLE_TYPE.QUESTIONING;
  constructor(quiz_session)
  {
    super(quiz_session);
    this.next_cycle = CYCLE_TYPE.TIMEOVER;

    this.current_question = undefined; //현재 진행 중인 퀴즈

    this.hint_timer = undefined; //자동 힌트 타이머
    this.timeover_timer = undefined; //타임오버 timer id
    this.timeover_resolve = undefined; //정답 맞췄을 시 강제로 타임오버 대기 취소
    this.fade_out_timer = undefined;
    this.wait_for_answer_timer = undefined; //정답 대기 timer id
    this.already_start_fade_out = false;

    this.skip_prepare_cycle = false; //마지막 문제라면 더 이상 prepare 할 필요없음
    this.progress_bar_timer = undefined; //진행 bar
    this.progress_bar_fixed_text = undefined; //진행 bar 위에 고정할 text, 진행 bar 흐르는 중간에 표시할 수도 있으니 this로 둔다.
    this.answers = undefined; //문제 정답 목록

    this.is_timeover = false;
    this.timeover_wait = undefined; //타임오버 대기 시간
    this.timeover_timer_created = undefined; //타임오버 타이머 시작 시간

    this.answer_type = ANSWER_TYPE.SHORT_ANSWER; //문제 유형
    this.selected_choice_map = undefined; //객관식 퀴즈에서 각자 선택한 답안

    this.hint_voted_user_list = []; //힌트 투표 이미했는지 확인
    this.skip_voted_user_list = []; //스킵 투표 이미했는지 확인
    this.used_chance_map = {}; //정답 제출 몇 번 시도했는지
  }

  async enter()
  {
    let quiz_data = this.quiz_session.quiz_data;
    let game_data = this.quiz_session.game_data;

    if(this.quiz_session.force_stop == true) return false;

    this.current_question = undefined; //현재 진행 중인 퀴즈

    this.hint_timer = undefined; //자동 힌트 타이머
    this.timeover_timer = undefined; //타임오버 timer id
    this.timeover_resolve = undefined; //정답 맞췄을 시 강제로 타임오버 대기 취소
    this.wait_for_answer_timer = undefined; //정답 대기 timer id
    this.fade_out_timer = undefined;
    this.already_start_fade_out = false;

    this.skip_prepare_cycle = false;
    this.progress_bar_timer = undefined; //진행 bar
    this.progress_bar_fixed_text = undefined; //진행 bar 위에 고정할 text
    this.answers = undefined; //문제 정답 목록

    this.is_timeover = false;
    this.timeover_wait = undefined;
    this.timeover_timer_created = undefined;

    this.answer_type = ANSWER_TYPE.SHORT_ANSWER; //문제 유형
    this.selected_choice_map = undefined; //객관식 퀴즈에서 각자 선택한 답안

    this.hint_voted_user_list.length = 0; //힌트 투표 이미했는지 확인
    this.skip_voted_user_list.length = 0; //스킵 투표 이미했는지 확인
    this.used_chance_map = {}; //정답 제출 몇 번 시도했는지

    if(this.quiz_session.hasMoreQuestion() === false) //모든 퀴즈 제출됐음
    {
      this.next_cycle = CYCLE_TYPE.ENDING;
      this.skip_prepare_cycle = true;
      this.current_question = undefined;
      logger.info(`All Question Submitted, guild_id:${this.quiz_session.guild_id}`);
      return; //더 이상 진행할 게 없다.
    }

    await this.quiz_session.audio_player.stop(true); //시작 전엔 audio stop 걸고 가자

    //진행 UI 관련
    utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.ROUND_ALARM);
    let quiz_ui = await this.createQuestionUI();
    const essential_term = Date.now() + 2500; //최소 문제 제출까지 2.5초간의 텀은 주자

    //아직 prepared queue에 아무것도 없다면
    let current_check_prepared_queue = 0;
    const max_try = SYSTEM_CONFIG.max_check_prepared_queue;
    const check_interval = SYSTEM_CONFIG.prepared_queue_check_interval;
    // const max_try = 40; //고정값으로 테스트해보자
    while(game_data.prepared_question_queue.length == 0)
    {
      if(this.quiz_session.force_stop == true) return false;

      if(++current_check_prepared_queue >= max_try) //최대 체크 횟수 초과 시
      {
        this.next_cycle = CYCLE_TYPE.CLEARING; 
        logger.error(`Prepared Queue is Empty, tried ${current_check_prepared_queue} * ${check_interval}..., going to CLEARING cycle, guild_id: ${this.quiz_session.guild_id}`);
        this.quiz_session.sendMessage({content: `\`\`\`🔸 예기치 않은 문제로 오디오 리소스 초기화에 실패했습니다...\n퀴즈가 강제 종료됩니다...\n서버 메모리 부족, 네트워크 연결 등의 문제일 수 있습니다.\`\`\``});

        const memoryUsage = process.memoryUsage();
        logger.error(`Memory Usage:, ${JSON.stringify({
          'Heap Used': `${memoryUsage.heapUsed / 1024 / 1024} MB`,
          'Heap Total': `${memoryUsage.heapTotal / 1024 / 1024} MB`,
          'RSS': `${memoryUsage.rss / 1024 / 1024} MB`,
          'External': `${memoryUsage.external / 1024 / 1024} MB`,
        })}`);

        this.forceStop();

        return false;
      }

      await utility.sleep(check_interval);
      // await utility.sleep(500); //고정값으로 테스트 해보자
    }
        
    this.current_question = game_data.prepared_question_queue.shift(); //하나 꺼내오자

    this.answer_type = this.current_question['answer_type'] ?? ANSWER_TYPE.SHORT_ANSWER;
    this.applyAnswerTypeToUI(); //answer_type 대로 컴포넌트 설정

    if(this.quiz_session.isMultiplayerSession()) //멀티면 참가자 목록 붙여주자
    {
      this.quiz_session.appendParticipantInfoMenu(quiz_ui);
    }

    //이제 문제 준비가 끝났다. 마지막으로 최소 텀 지키고 ㄱㄱ
    const left_term = essential_term - Date.now();
    if(left_term < 0) 
    {
      return;
    }
    await new Promise((resolve, reject) => 
    {
      setTimeout(() => 
      {
        resolve();
      }, left_term);
    });
  }

  async act()
  {
    //Base class라서 아무것도 안한다. Quiz Type 별로 여기에 동작 구현
  }

  exit()
  {
    if(this.progress_bar_timer != undefined)
    {
      clearInterval(this.progress_bar_timer);
    }

    if(this.hint_timer != undefined)
    {
      clearTimeout(this.hint_timer);
    }

    if(this.quiz_session.force_stop == true) //강제 종료가 호출됐다.
    {
      this.skip_prepare_cycle = true; //더 이상 prepare는 필요없다.
      this.stopTimeoverTimer(); //타임오버 타이머도 취소한다.
      return false;
    }

    if(this.skip_prepare_cycle == false)
    {
      this.asyncCallCycle(CYCLE_TYPE.PREPARE); //다음 문제 미리 준비
    }
  }

  applyAnswerTypeToUI()
  {
    const answer_type = this.answer_type;
    const quiz_ui = this.quiz_session.quiz_ui;

    if(answer_type == ANSWER_TYPE.OX)
    {
      quiz_ui.components.push(quiz_ui.ox_quiz_comp);
    }
    else if(answer_type == ANSWER_TYPE.MULTIPLE_CHOICE)
    {
      quiz_ui.components.push(quiz_ui.multiple_quiz_comp);
    }
  }

  //UI관련
  async createQuestionUI()
  {
    let quiz_data = this.quiz_session.quiz_data;
    let game_data = this.quiz_session.game_data;
    const option_data = this.quiz_session.option_data;
    const quiz_ui = this.quiz_session.quiz_ui;

    const quiz_type = quiz_data['quiz_type'];

    quiz_ui.embed.color = 0xFED049;

    quiz_ui.embed.title = `[ ${quiz_data['icon']} ${quiz_data['title']} ]`;
        
    let footer_message = text_contents.quiz_play_ui.footer;
    footer_message = footer_message.replace("${quiz_question_num}", `${(game_data['question_num']+1)}`);
    footer_message = footer_message.replace("${quiz_size}", `${quiz_data['quiz_size']}`);
    footer_message = footer_message.replace("${option_hint_type}", `${option_data.quiz.hint_type}`);
    footer_message = footer_message.replace("${option_skip_type}", `${option_data.quiz.skip_type}`);
    footer_message = footer_message.replace("${option_score_type}", `${option_data.quiz.score_type}`);
    quiz_ui.embed.footer = {
      "text": footer_message,
    };
    let description_message = text_contents.quiz_play_ui.description;
    description_message = description_message.replace("${quiz_question_num}", `${(game_data['question_num']+1)}`);

    if(this.quiz_session.isMultiplayerSession())
    {
      description_message += `\n\`\`\`🔖 [Tip]. /챗' 명령어로 전체 대화가 가능합니다.\`\`\``;
    }

    quiz_ui.embed.description = description_message;

    let components = [quiz_ui.quiz_play_comp]; //기본 comp
    quiz_ui.components = components;

    quiz_ui.embed.fields = [];

    quiz_ui.setButtonStatus(0, option_data.quiz.hint_type == OPTION_TYPE.HINT_TYPE.AUTO ? false : true); //버튼 1,2,3 다 활성화
    quiz_ui.setButtonStatus(1, true); 
    quiz_ui.setButtonStatus(2, true);

    quiz_ui.setImage(undefined); //이미지 초기화

    await quiz_ui.send(false);

    return quiz_ui;
  }

  //힌트 표시
  async showHint(question)
  {
    if(question['hint_used'] == true || (question['hint'] == undefined && question['hint_image_url'] == undefined))
    {
      return;    
    }
    question['hint_used'] = true;

    let quiz_ui = this.quiz_session.quiz_ui;
    quiz_ui.setButtonStatus(0, false); //힌트 버튼 비활성화
    quiz_ui.update();

    const hint = question['hint'];
    const channel = this.quiz_session.channel;
    let hint_message = text_contents.quiz_play_ui.show_hint;
    hint_message = hint_message.replace("${hint}", hint);

    if(question['hint_image_url'] != undefined)
    {
      const hint_image_url = question['hint_image_url'];
      const hint_embed = {
        color: 0x05f1f1,
        title: `${text_contents.quiz_play_ui.hint_title}`,
        description: `${hint_message}`,
        image: {
          url: utility.isValidURL(hint_image_url) ? hint_image_url : '',
        }
      };

      channel.send({embeds: [hint_embed]});
    }
    else
    {
      channel.send({content: hint_message});
    }
  }

  //스킵
  async skip(question)
  {
    if(question['skip_used'] == true)
    {
      return;    
    }
    question['skip_used'] = true;

    let quiz_ui = this.quiz_session.quiz_ui;
    quiz_ui.setButtonStatus(1, false); //스킵 버튼 비활성화
    quiz_ui.update();

    const channel = this.quiz_session.channel;
    let skip_message = text_contents.quiz_play_ui.skip;
    channel.send({content: skip_message});
        
    await this.stopTimeoverTimer(); //그리고 다음으로 진행 가능하게 타임오버 타이머를 중지해줌
  }

  //진행 bar 시작
  async startProgressBar(audio_play_time)
  {
    if(audio_play_time < 10000) //10초 미만은 지원하지 말자
    {
      return;
    }

    //진행 상황 bar, 10%마다 호출하자
    const progress_max_percentage = 10;
    const progress_bar_interval = audio_play_time / progress_max_percentage;
    let progress_percentage = 0; //시작은 0부터
        
    let quiz_ui = this.quiz_session.quiz_ui;

    let progress_bar_string = this.getProgressBarString(progress_percentage, progress_max_percentage);
    quiz_ui.embed.description = this.progress_bar_fixed_text ?? '';
    quiz_ui.embed.description += ` \n \n🕛 **${progress_bar_string}**\n \n \n`;
    quiz_ui.update(); // 우선 한 번은 그냥 시작해주고~

    const progress_bar_timer = setInterval(() => 
    {

      ++progress_percentage;

      let progress_bar_string = this.getProgressBarString(progress_percentage, progress_max_percentage);

      quiz_ui.embed.description = this.progress_bar_fixed_text ?? '';
      quiz_ui.embed.description += ` \n \n⏱ **${progress_bar_string}**\n \n \n`;
      quiz_ui.update();

    }, progress_bar_interval);

    this.progress_bar_timer = progress_bar_timer;
  }

  getProgressBarString(progress_percentage, progress_max_percentage)
  {
    if(progress_percentage == progress_max_percentage)
    {
      clearInterval(this.progress_bar_timer);
    }

    let progress_bar_string = '';
    for(let i = 0; i < progress_max_percentage; i++)
    {
      if(i <= progress_percentage)
      {
        progress_bar_string += text_contents.icon.ICON_PROGRESS_PROGRESSED;
      }
      else
      {
        progress_bar_string += text_contents.icon.ICON_PROGRESS_WATING;
      }
    }
    return progress_bar_string;
  }

  //정답 맞췄을 때
  async submittedCorrectAnswer(requester)
  {
    if(this.current_question['answer_requesters'] !== undefined) //이미 맞춘사람 있다면 패스
    {
      return;
    }
    
    if(this.timeover_timer === undefined)
    {
      return;
    }
    
    const score = this.calculateScore();

    if(this.quiz_session.isMultiplayerSession() && this.quiz_session.isMultiplayerSessionExpired() === false)
    {
      this.quiz_session.sendRequestAnswerHit(requester.id, requester.displayName, score);
      return;
    }

    this.applyCorrectAnswer(requester.id, requester.displayName, score);

    this.stopTimeoverTimer(); //맞췄으니 타임오버 타이머 중지!
  }

  applyCorrectAnswer(answerer_id, answerer_name, score)
  {
    if(this.current_question['answer_members'] === undefined)
    {
      this.current_question['answer_members'] = [];
    }

    this.current_question['answer_members'].push(answerer_id);
    
    let scoreboard = this.quiz_session.scoreboard;
    let answerer_info = scoreboard.get(answerer_id);
    
    if(answerer_info === undefined)
    {
      answerer_info = {
        name: answerer_name,
        score: score
      };

      scoreboard.set(answerer_id, answerer_info);
    }
    else
    {
      answerer_info.name = answerer_name;
      answerer_info.score += score;
    }
  }  

  hasAnswerer()
  {
    return this.current_question['answer_members'] !== undefined;
  }

  calculateScore()
  {
    let score = 1;

    const score_type = this.quiz_session.option_data.quiz.score_type;
    if(score_type == OPTION_TYPE.SCORE_TYPE.TIME) //남은 시간 비례 가산점 방식이면
    {
      const max_multiple = 10;
      let multiple = 1;
      const answer_submitted_time = Date.now();
      const timeover_start = this.timeover_timer_created;
      const timeover_wait = this.timeover_wait;

      const time_gap = answer_submitted_time - timeover_start; //맞추기까지 걸린 시간
      if(time_gap < 0) //음수일리가 없는데...음수면 최대!
      { 
        multiple = max_multiple;
      }
      else
      {
        multiple = max_multiple - parseInt(time_gap * max_multiple / timeover_wait);
        if(multiple <= 0) multiple = 1;
      }
      score *= multiple;
    }

    return score;
  }

  isSkipped()
  {
    return this.current_question['skip_used'] === true;
  }

  //타임오버 타이머 중지
  async stopTimeoverTimer()
  {
    if(this.timeover_timer != undefined)
    {
      clearTimeout(this.timeover_timer); //타임오버 타이머 중지
    }
        
    if(this.fade_out_timer != undefined)
    {
      clearTimeout(this.fade_out_timer); //fadeout timer 중지
    }

    if(this.wait_for_answer_timer != undefined)
    {
      clearTimeout(this.wait_for_answer_timer); //fadeout timer 중지
    }

    if(this.timeover_resolve != undefined)
    {
      this.timeover_resolve('force stop timeover timer'); //타임오버 promise await 취소
    }
  }

  //자동 힌트 체크
  async checkAutoHint(audio_play_time) 
  {
    const option_data = this.quiz_session.option_data;
    if(option_data.quiz.hint_type != OPTION_TYPE.HINT_TYPE.AUTO) //자동 힌트 사용 중이 아니라면
    {
      return;
    }   

    const hint_timer_wait = audio_play_time / 2; //절반 지나면 힌트 표시할거임
    const hint_timer = setTimeout(() => 
    {
      this.showHint(this.current_question); //현재 퀴즈 hint 표시
    }, hint_timer_wait);
    this.hint_timer = hint_timer;
  }

  //정답 대기 타이머 생성 및 지연 시작
  async createWaitForAnswerTimer(delay_time, wait_time, bgm_type)
  {
    this.wait_for_answer_timer = setTimeout(async () => 
    {

      if(this.progress_bar_timer != undefined)
      {
        clearTimeout(this.progress_bar_timer);
      }
      const audio_player = this.quiz_session.audio_player;
      await audio_player.stop(true);
      utility.playBGM(audio_player, bgm_type);
      this.startProgressBar(wait_time);
      this.is_playing_bgm = true;

    }, delay_time);
    return this.wait_for_answer_timer;
  }

  //타임오버 타이머 생성 및 시작
  async createTimeoverTimer(timeover_wait)
  {
    this.timeover_wait = timeover_wait;
    this.timeover_timer_created = Date.now();
    this.is_timeover = false;
    const audio_player = this.quiz_session.audio_player;
    const timeover_promise = new Promise((resolve, reject) => 
    {

      this.timeover_resolve = resolve; //정답 맞췄을 시, 이 resolve를 호출해서 promise 취소할거임
      this.timeover_timer = setTimeout(async () => 
      {

        this.is_timeover = true; 

        let graceful_timeover_try = 0;
        while(audio_player.state.status == 'playing'
                     && graceful_timeover_try++ < SYSTEM_CONFIG.graceful_timeover_max_try) //오디오 완전 종료 대기
        {
          await utility.sleep(SYSTEM_CONFIG.graceful_timeover_interval);
        }

        if(audio_player.state.status == 'playing' && SYSTEM_CONFIG.graceful_timeover_max_try > 0) //아직도 오디오 플레이 중이고 graceful 옵션 사용 중이면
        {
          logger.warn(`Graceful timeover, guild_id:${this.quiz_session.guild_id}, graceful_count: ${graceful_timeover_try}/${SYSTEM_CONFIG.graceful_timeover_max_try}`);
        }

        resolve('done timeover timer');

      }, timeover_wait);
    });
    return timeover_promise;
  }

  //부드러운 오디오 종료
  async gracefulAudioExit(audio_player, resource, fade_in_end_time)
  {
    if(this.already_start_fade_out == true) //이미 fadeout 진입했다면 return
    {
      return;
    }

    if(SYSTEM_CONFIG.use_inline_volume)
    {
      if(resource == undefined || resource.volume == undefined) return;

      let fade_out_duration = SYSTEM_CONFIG.fade_out_duration;
      const fade_in_left_time = (Date.now() - (fade_in_end_time ?? 0)) * -1;
      if(fade_in_left_time > 0) //아직 fade_in이 안끝났다면
      {
        fade_out_duration = SYSTEM_CONFIG.correct_answer_cycle_wait - fade_in_left_time - 1000; //fadeout duration 재계산, 1000ms는 padding
        if(fade_out_duration > 1000) //남은 시간이 너무 짧으면 걍 패스
        {
          this.current_question['fade_out_timer'] = setTimeout(() => 
          {
            this.already_start_fade_out = true;
            utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, fade_out_duration);
          }, fade_in_left_time); //fade_in 끝나면 호출되도록
        }
      }
      else
      {
        this.already_start_fade_out = true;
        utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, fade_out_duration);
      }
    }
  }

  /** 이벤트 핸들러 **/
  onInteractionCreate(interaction)
  {
    if(interaction.isChatInputCommand())
    {
      this.handleChatInputCommand(interaction);
    }

    if(interaction.isButton())
    {
      this.handleButtonCommand(interaction);
    }
  }

  checkAnswerHit(message_content)
  {
    const submit_answer = message_content.trim().replace(/ /g, '').toLowerCase();

    return this.answers.includes(submit_answer);
  }

  handleSimpleRequest(member, message_content)
  {
    if(message_content === 'ㅎ')
    {
      this.requestHint(member);
      return true;
    }

    if(message_content === 'ㅅ')
    {
      this.requestSkip(member);
      return true;
    }

    return false;
  }

  processChance(member)
  {
    const option_data = this.quiz_session.option_data;
    const max_chance = option_data.quiz.max_chance;

    if(max_chance == OPTION_TYPE.UNLIMITED)
    {
      return 10000;
    }

    const member_id = member.id;
    let used_chance = this.used_chance_map[member_id] || 0;
    this.used_chance_map[member_id] = (++used_chance);

    return max_chance - used_chance;
  }

  onMessageCreate(message)
  {
    const option_data = this.quiz_session.option_data;

    if(message.author == bot_client.user) return;

    if(option_data.quiz.use_message_intent == OPTION_TYPE.DISABLED) return; //Message Intent 안쓴다면 return

    if(message.channel != this.quiz_session.channel) return; //퀴즈 진행 중인 채널 아니면 return

    if(this.timeover_timer_created == undefined) return; //아직 timeover 시작도 안했다면 return

    if(this.answer_type != ANSWER_TYPE.SHORT_ANSWER) return; //단답형 아니면 PASS

    const message_content = message.content ?? '';
    const requester = message.author;

    if(message_content == '') 
    {
      return;
    }

    const is_request_message = this.handleSimpleRequest(requester, message_content);
    const remain_chance = is_request_message ? 10000 : this.processChance(requester);

    if(remain_chance < 0) //no more chance
    {
      return;
    }

    if(this.checkAnswerHit(message_content) == false) //오답
    {
      if(remain_chance == 0) //라스트 찬스였으면
      {
        message.reply({content: `\`\`\`🔸 땡! 이번 문제의 정답 제출 기회를 모두 사용했어요.\`\`\``, ephemeral: true});
      }

      return;
    }

    this.submittedCorrectAnswer(requester);
  }

  async handleChatInputCommand(interaction)
  {
    if(interaction.commandName === '답') 
    {

      if(this.timeover_timer_created == undefined) return; //아직 timeover 시작도 안했다면 return

      if(this.answer_type != ANSWER_TYPE.SHORT_ANSWER) return; // 단답형 아니면 pass
    
      const message_content = interaction.options.getString('답안') ?? '';

      const requester = this.quiz_session.isMultiplayerSession() ? interaction.user : interaction.member;
    
      if(message_content == '') 
      {
        return;
      }

      const is_request_message = this.handleSimpleRequest(requester, message_content);
      const remain_chance = is_request_message ? 10000 : this.processChance(requester);
    
      if(remain_chance < 0) //no more chance
      {
        const reply_message = `이번 문제의 정답 제출 기회를 모두 사용했어요.`;
        interaction.explicit_replied = true;
        interaction.reply({content: reply_message, ephemeral: true})
          .catch(err => 
          {
            logger.error(`Failed to replay to wrong submit, guild_id:${this.quiz_session.guild_id}, err: ${err.stack}`);
          });
        return;
      }
    
      if(this.checkAnswerHit(message_content) == false) //오답
      {
        let reply_message = "```";
        reply_message += `🔸 ${requester.displayName}: [ ${message_content} ]... 오답입니다!`;

        if(remain_chance == 0) //라스트 찬스였음
        {
          reply_message += `\n이번 문제의 정답 제출 기회를 모두 사용했어요.`;
        }
        else if(remain_chance > 0)
        {
          reply_message += `\n기회가 ${remain_chance}번 남았어요.`;
        }

        reply_message += "```";
                
        interaction.explicit_replied = true;
        interaction.reply({content: reply_message, ephemeral: true})
          .catch(err => 
          {
            logger.error(`Failed to replay to wrong submit, guild_id:${this.quiz_session.guild_id}, err: ${err.stack}`);
          });
    
        return;
      }
            
      this.submittedCorrectAnswer(requester);

      let message = "```" + `${requester.displayName}: [ ${message_content} ]... 정답입니다!` + "```";
      interaction.explicit_replied = true;
      interaction.reply({content: message})
        .catch(err => 
        {
          logger.error(`Failed to replay to correct submit, guild_id:${this.quiz_session.guild_id}, err: ${err.stack}`);
        });
    }
  }

  async handleButtonCommand(interaction)
  {
    if(this.timeover_timer == undefined)
    {
      return; //타임 오버 타이머 시작도 안했는데 누른거면 패스한다.
    }

    if(interaction.customId === 'hint') 
    {
      this.requestHint(interaction.member);
      return;
    }

    if(interaction.customId === 'skip') 
    {
      this.requestSkip(interaction.member);
      return;
    }

    if(interaction.customId.startsWith("choice_")) //버튼형 정답 입력일 경우
    {
      const selected_value = interaction.customId;
      const selected_choice = selected_value.substring(7).toLowerCase(); // "choice_"의 길이는 7

      const member = interaction.member;

      if(this.selected_choice_map == undefined) 
      {
        this.selected_choice_map = new Map();
      }

      this.selected_choice_map.set(member, selected_choice);

      interaction.explicit_replied = true;
      interaction.reply({ content: `\`\`\`🔸 선택한 정답: ${this.choiceAsIcon(selected_choice)}\`\`\``, ephemeral: true });
    }
  }

  choiceAsIcon(choice)
  {
    switch(choice)
    {
    case 'o': return '⭕';
    case 'x': return '❌';
    case '1': return '1️⃣';
    case '2': return '2️⃣';
    case '3': return '3️⃣';
    case '4': return '4️⃣';
    case '5': return '5️⃣';

    default: return choice;
    }
  }

  requestHint(member)
  {
    const option_data = this.quiz_session.option_data;
    const current_question = this.current_question;
    if(current_question == undefined) 
    {
      return;
    }

    //2중 체크의 필요성이 있나?
    // if(current_question['hint_used'] == true 
    //     || (current_question['hint'] == undefined && current_question['hint_image_url'] == undefined)) //2중 체크
    // {
    //     return;
    // }
    const requester_id = this.quiz_session.isMultiplayerSession() ? member.guild.id : member.id;
    if(this.hint_voted_user_list.includes(requester_id))
    {
      return;
    }

    this.hint_voted_user_list.push(requester_id);

    if(this.quiz_session.isMultiplayerSession() && this.quiz_session.isMultiplayerSessionExpired() === false)
    {
      this.quiz_session.sendRequestHint();
      return;
    }

    if(option_data.quiz.hint_type == OPTION_TYPE.HINT_TYPE.OWNER) //주최자만 hint 사용 가능하면
    {
      if(requester_id == this.quiz_session.owner.id)
      {
        this.showHint(current_question);
        return;
      }
      const reject_message = '```' + `${text_contents.quiz_play_ui.only_owner_can_use_hint}` +'```';
      this.quiz_session.sendMessage({content: reject_message});
    }
    else if(option_data.quiz.hint_type == OPTION_TYPE.HINT_TYPE.VOTE)
    {
      const voice_channel = this.quiz_session.voice_channel;
      const vote_criteria = parseInt((voice_channel.members.size - 2) / 2) + 1; 

      current_question['hint_vote_count'] = current_question['hint_vote_count'] == undefined ? 1 : current_question['hint_vote_count'] + 1;

      let hint_vote_message = text_contents.quiz_play_ui.hint_vote;
      hint_vote_message = hint_vote_message.replace("${who_voted}", member.displayName);
      hint_vote_message = hint_vote_message.replace("${current_vote_count}", current_question['hint_vote_count'] );
      hint_vote_message = hint_vote_message.replace("${vote_criteria}", vote_criteria);
      this.quiz_session.sendMessage({content: hint_vote_message});
      if(current_question['hint_vote_count']  >= vote_criteria)
      {
        this.showHint(current_question);
      }

    }
  }

  requestSkip(member)
  {
    const option_data = this.quiz_session.option_data;
    const current_question = this.current_question;
    if(current_question == undefined) 
    {
      return;
    }

    const requester_id = this.quiz_session.isMultiplayerSession() ? member.guild.id : member.id;
    if(this.skip_voted_user_list.includes(requester_id))
    {
      return;
    }

    this.skip_voted_user_list.push(requester_id);

    if(this.quiz_session.isMultiplayerSession() && this.quiz_session.isMultiplayerSessionExpired() === false)
    {
      this.quiz_session.sendRequestSkip();
      return;
    }

    if(option_data.quiz.skip_type == OPTION_TYPE.SKIP_TYPE.OWNER) //주최자만 skip 사용 가능하면
    {
      if(requester_id == this.quiz_session.owner.id)
      {
        this.skip(this.current_question);
        return;
      }
      const reject_message = '```' + `${text_contents.quiz_play_ui.only_owner_can_use_skip}` +'```';
      this.quiz_session.sendMessage({content: reject_message});
    }
    else if(option_data.quiz.skip_type == OPTION_TYPE.SKIP_TYPE.VOTE)
    {
      const voice_channel = this.quiz_session.voice_channel;
      const vote_criteria = parseInt((voice_channel.members.size - 2) / 2) + 1; 

      current_question['skip_vote_count'] = current_question['skip_vote_count'] == undefined ? 1 : current_question['skip_vote_count'] + 1;

      let skip_vote_message = text_contents.quiz_play_ui.skip_vote;
      skip_vote_message = skip_vote_message.replace("${who_voted}", member.displayName);
      skip_vote_message = skip_vote_message.replace("${current_vote_count}", current_question['skip_vote_count']);
      skip_vote_message = skip_vote_message.replace("${vote_criteria}", vote_criteria);
      this.quiz_session.sendMessage({content: skip_vote_message});

      if(current_question['skip_vote_count'] >= vote_criteria)
      {
        this.skip(current_question);
      }
    }
  }
}

//Song Type Question
class QuestionSong extends Question
{
  static cycle_type = CYCLE_TYPE.QUESTIONING;
  constructor(quiz_session)
  {
    super(quiz_session);
  }

  async act()
  {
    let quiz_data = this.quiz_session.quiz_data;
    let game_data = this.quiz_session.game_data;
    const option_data = this.quiz_session.option_data;

    const current_question = this.current_question;
    if(current_question == undefined || this.next_cycle == CYCLE_TYPE.ENDING) //제출할 퀴즈가 없으면 패스
    {
      return;
    }

    game_data['processing_question'] = this.current_question; //현재 제출 중인 퀴즈

    this.answers = current_question['answers'];
    const question = current_question['question'];

    logger.info(`Questioning Song, guild_id:${this.quiz_session.guild_id}, question_num: ${game_data['question_num']+1}/${quiz_data['quiz_size']}, question: ${question}`);

    //오디오 재생 부
    const audio_player = this.quiz_session.audio_player;
    const resource = current_question['audio_resource'];
    const audio_play_time = current_question['audio_length'] ?? option_data.quiz.audio_play_time;

    let fade_in_end_time = undefined; 
    this.startAudio(audio_player, resource)
      .then((result) => fade_in_end_time = result); //비동기로 오디오 재생 시켜주고

    this.autoFadeOut(audio_player, resource, audio_play_time); //audio_play_time으로 자동 페이드 아웃 체크
    this.checkAutoHint(audio_play_time); //자동 힌트 체크
    this.startProgressBar(audio_play_time); //진행 bar 시작

    const timeover_promise = this.createTimeoverTimer(audio_play_time); //audio_play_time 후에 실행되는 타임오버 타이머 만들어서
    await Promise.race([timeover_promise]); //race로 돌려서 타임오버 타이머가 끝나는걸 기다림

    //어쨋든 타임오버 타이머가 끝났다.
    if(this.quiz_session.force_stop == true) //그런데 강제종료다
    {
      return; //바로 return
    }

    if(this.is_timeover == false) //그런데 타임오버로 끝난게 아니다.
    {
      if(this.hasAnswerer()) //정답자가 있다?
      {
        this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
      }
      else if(this.isSkipped()) //스킵이다?
      {
        this.next_cycle = CYCLE_TYPE.TIMEOVER; //그럼 타임오버로~
      }
      this.gracefulAudioExit(audio_player, resource, fade_in_end_time); //타이머가 제 시간에 끝난게 아니라 오디오 재생이 남아있으니 부드러운 오디오 종료 진행
    }
    else //타임오버거나 정답자 없다면
    {
      current_question['play_bgm_on_question_finish'] = true; //탄식을 보내주자~
      this.next_cycle = CYCLE_TYPE.TIMEOVER; //타임오버로
    }
  }
}

//Image Type Question
class QuestionImage extends Question
{
  static cycle_type = CYCLE_TYPE.QUESTIONING;
  constructor(quiz_session)
  {
    super(quiz_session);
  }

  async act()
  {
    let quiz_data = this.quiz_session.quiz_data;
    let game_data = this.quiz_session.game_data;
    const option_data = this.quiz_session.option_data;

    const current_question = this.current_question;
    if(current_question == undefined || this.next_cycle == CYCLE_TYPE.ENDING) //제출할 퀴즈가 없으면 패스
    {
      return;
    }

    game_data['processing_question'] = this.current_question; //현재 제출 중인 퀴즈

    this.answers = current_question['answers'];
    const question = current_question['question'];

    logger.info(`Questioning Image, guild_id:${this.quiz_session.guild_id}, question_num: ${game_data['question_num']+1}/${quiz_data['quiz_size']}, question: ${question}`);

    //그림 퀴즈는 카운트다운 BGM만 틀어준다.
    const is_long = current_question['is_long'] ?? false;
    const audio_player = this.quiz_session.audio_player;
    const audio_play_time = is_long ? 20000 : 10000; //10초, 또는 20초 고정이다.

    const image_resource = current_question['image_resource'];

    //이미지 표시
    let quiz_ui = this.quiz_session.quiz_ui; 
    quiz_ui.setImage(image_resource);
    await quiz_ui.update(); //대기 해줘야한다. 안그러면 타이밍 이슈 땜에 이미지가 2번 올라간다.

    //카운트다운 BGM 재생
    const bgm_type = is_long == true ? BGM_TYPE.COUNTDOWN_LONG : BGM_TYPE.COUNTDOWN_10;
    let resource = undefined;
    utility.playBGM(audio_player, bgm_type);

    this.checkAutoHint(audio_play_time); //자동 힌트 체크
    this.startProgressBar(audio_play_time); //진행 bar 시작

    const timeover_promise = this.createTimeoverTimer(audio_play_time); //audio_play_time 후에 실행되는 타임오버 타이머 만들어서
    await Promise.race([timeover_promise]); //race로 돌려서 타임오버 타이머가 끝나는걸 기다림

    //어쨋든 타임오버 타이머가 끝났다.
    if(this.quiz_session.force_stop == true) //그런데 강제종료다
    {
      return; //바로 return
    }

    current_question['play_bgm_on_question_finish'] = true; //그림 퀴즈는 어찌됐건 다음 스탭에서 bgm 틀어준다

    if(this.is_timeover == false) //그런데 타임오버로 끝난게 아니다.
    {
      await audio_player.stop(true); //BGM 바로 멈춰준다.

      if(this.hasAnswerer()) //정답자가 있다?
      {
        this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
      }
      else if(this.isSkipped()) //스킵이다?
      {
        this.next_cycle = CYCLE_TYPE.TIMEOVER; //그럼 타임오버로~
      }
    }
    else //타임오버거나 정답자 없다면
    {
      this.next_cycle = CYCLE_TYPE.TIMEOVER; //타임오버로
    }
  }
}

//Intro Type Question
class QuestionIntro extends Question
{
  static cycle_type = CYCLE_TYPE.QUESTIONING;
  constructor(quiz_session)
  {
    super(quiz_session);
  }

  async act()
  {
    let quiz_data = this.quiz_session.quiz_data;
    let game_data = this.quiz_session.game_data;
    const option_data = this.quiz_session.option_data;

    const current_question = this.current_question;
    if(current_question == undefined || this.next_cycle == CYCLE_TYPE.ENDING) //제출할 퀴즈가 없으면 패스
    {
      return;
    }

    game_data['processing_question'] = this.current_question; //현재 제출 중인 퀴즈

    this.answers = current_question['answers'];
    const question = current_question['question'];

    logger.info(`Questioning Intro, guild_id:${this.quiz_session.guild_id}, question_num: ${game_data['question_num']+1}/${quiz_data['quiz_size']}, question: ${question}`);

    //오디오 재생 부분
    const audio_player = this.quiz_session.audio_player;
    const resource = current_question['audio_resource'];
    const audio_play_time = (current_question['audio_length'] ?? option_data.quiz.audio_play_time) + 1000; //인트로 퀴는 1초 더 준다.

    this.startAudio(audio_player, resource, false); //인트로 퀴즈는 fadeIn, fadeout 안 쓴다.

    const wait_for_answer_time = 10000; //인트로 퀴즈는 문제 내고 10초 더 준다.
    //이건 단순히 progress_bar 띄우고 10초 브금 재생하는 역할이다.
    const wait_for_answer_timer = this.createWaitForAnswerTimer(audio_play_time, wait_for_answer_time, BGM_TYPE.COUNTDOWN_10); 
        
    const timeover_time = audio_play_time + wait_for_answer_time;
    this.checkAutoHint(timeover_time); //자동 힌트 체크

    const timeover_promise = this.createTimeoverTimer(timeover_time); //노래 재생 + 10초 대기 시간 후에 실행되는 타임오버 타이머 만들어서
    await Promise.race([timeover_promise]); //race로 돌려서 타임오버 타이머가 끝나는걸 기다림

    //어쨋든 타임오버 타이머가 끝났다.
    if(this.quiz_session.force_stop == true) //그런데 강제종료다
    {
      return; //바로 return
    }

    if(this.is_timeover == false) //그런데 타임오버로 끝난게 아니다.
    {
      if(wait_for_answer_timer != undefined) //근데 카운트 다운이었다?
      {  
        current_question['play_bgm_on_question_finish'] = true; //브금을 틀거다.
      }
      if(this.hasAnswerer()) //정답자가 있다?
      {
        this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
      }
      else if(this.isSkipped()) //스킵이다?
      {
        this.next_cycle = CYCLE_TYPE.TIMEOVER; //그럼 타임오버로~
      }
    }
    else //타임오버거나 정답자 없다면
    {
      current_question['play_bgm_on_question_finish'] = true; //탄식을 보내주자~
      this.next_cycle = CYCLE_TYPE.TIMEOVER; //타임오버로
    }
  }
}

//Text Type Question
class QuestionText extends Question
{
  static cycle_type = CYCLE_TYPE.QUESTIONING;
  constructor(quiz_session)
  {
    super(quiz_session);
  }

  async act()
  {
    let quiz_data = this.quiz_session.quiz_data;
    let game_data = this.quiz_session.game_data;
    const option_data = this.quiz_session.option_data;

    const current_question = this.current_question;
    if(current_question == undefined || this.next_cycle == CYCLE_TYPE.ENDING) //제출할 퀴즈가 없으면 패스
    {
      return;
    }

    game_data['processing_question'] = this.current_question; //현재 제출 중인 퀴즈

    this.answers = current_question['answers'];
    const question = current_question['question'];

    logger.info(`Questioning Text, guild_id:${this.quiz_session.guild_id}, question_num: ${game_data['question_num']+1}/${quiz_data['quiz_size']}, question: ${question.trim()}`);

    //텍스트 퀴즈는 카운트다운 BGM만 틀어준다.
    const is_long = current_question['is_long'] ?? false;
    const audio_player = this.quiz_session.audio_player;
    const audio_play_time = is_long ? 20000 : 10000; //10초, 또는 20초 고정이다.

    this.progress_bar_fixed_text = question; //텍스트 퀴즈는 progress bar 위에 붙여주면 된다.

    //카운트다운 BGM 재생 
    const bgm_type = is_long == true ? BGM_TYPE.COUNTDOWN_LONG : BGM_TYPE.COUNTDOWN_10;
    utility.playBGM(audio_player, bgm_type);

    this.checkAutoHint(audio_play_time); //자동 힌트 체크
    this.startProgressBar(audio_play_time); //진행 bar 시작

    const timeover_promise = this.createTimeoverTimer(audio_play_time); //audio_play_time 후에 실행되는 타임오버 타이머 만들어서
    await Promise.race([timeover_promise]); //race로 돌려서 타임오버 타이머가 끝나는걸 기다림

    //어쨋든 타임오버 타이머가 끝났다.
    if(this.quiz_session.force_stop == true) //그런데 강제종료다
    {
      return; //바로 return
    }

    current_question['play_bgm_on_question_finish'] = true; //텍스트 퀴즈는 어찌됐건 다음 스탭에서 bgm 틀어준다

    if(this.is_timeover == false) //그런데 타임오버로 끝난게 아니다.
    {
      await audio_player.stop(true); //BGM 바로 멈춰준다.

      if(this.hasAnswerer()) //정답자가 있다?
      {
        this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
      }
      else if(this.isSkipped()) //스킵이다?
      {
        this.next_cycle = CYCLE_TYPE.TIMEOVER; //그럼 타임오버로~
      }
    }
    else //타임오버거나 정답자 없다면
    {
      this.next_cycle = CYCLE_TYPE.TIMEOVER; //타임오버로
    }
  }
}

//OX Type Question
class QuestionOX extends Question
{
  static cycle_type = CYCLE_TYPE.QUESTIONING;
  constructor(quiz_session)
  {
    super(quiz_session);
  }

  async act()
  {
    let quiz_data = this.quiz_session.quiz_data;
    let game_data = this.quiz_session.game_data;
    const option_data = this.quiz_session.option_data;

    const current_question = this.current_question;
    if(current_question == undefined || this.next_cycle == CYCLE_TYPE.ENDING) //제출할 퀴즈가 없으면 패스
    {
      return;
    }

    game_data['processing_question'] = this.current_question; //현재 제출 중인 퀴즈

    this.answers = current_question['answers'];
    const question = current_question['question'];

    logger.info(`Questioning OX, guild_id:${this.quiz_session.guild_id}, question_num: ${game_data['question_num']+1}/${quiz_data['quiz_size']}, question: ${question.trim()}`);

    //OX 퀴즈는 카운트다운 BGM만 틀어준다.
    const is_long = current_question['is_long'] ?? false;
    const audio_player = this.quiz_session.audio_player;
    const audio_play_time = is_long ? 20000 : 10000; //10초, 또는 20초 고정이다.

    this.progress_bar_fixed_text = question; //OX 퀴즈는 progress bar 위에 붙여주면 된다.

    //카운트다운 BGM 재생
    const bgm_type = is_long == true ? BGM_TYPE.COUNTDOWN_LONG : BGM_TYPE.COUNTDOWN_10;
    utility.playBGM(audio_player, bgm_type);

    this.startProgressBar(audio_play_time); //진행 bar 시작

    const timeover_promise = this.createTimeoverTimer(audio_play_time); //audio_play_time 후에 실행되는 타임오버 타이머 만들어서
    await Promise.race([timeover_promise]); //race로 돌려서 타임오버 타이머가 끝나는걸 기다림

    //어쨋든 타임오버 타이머가 끝났다.
    if(this.quiz_session.force_stop == true) //그런데 강제종료다
    {
      return; //바로 return
    }

    current_question['play_bgm_on_question_finish'] = true; //OX 퀴즈는 어찌됐건 다음 스탭에서 bgm 틀어준다

    if(this.is_timeover == false) //그런데 타임오버로 끝난게 아니다.
    {
      await audio_player.stop(true); //BGM 바로 멈춰준다.

      this.next_cycle = CYCLE_TYPE.TIMEOVER; //ox퀴즈는 스킵만 타임오버가 일찍 끝난다. 그러니 타임오버로~
    }
    else //타임오버라면
    {
      this.next_cycle = CYCLE_TYPE.TIMEOVER; //우선 타임오버로
            
      const selected_choice_map = this.selected_choice_map;

      if(selected_choice_map === undefined) //아무도 객관식 답을 선택 안했다?
      {
        return; //그럼 그냥 타임오버
      }

      const iter = selected_choice_map.entries();
      const score = 1; //객관식은 1점 고정

      for(let i = 0; i < selected_choice_map.size; ++i)
      {
        const [member, selected_value] = iter.next().value;
                  
        if(this.answers.includes(selected_value) === false) 
        {
          continue;
        }

        this.applyCorrectAnswer(member.id, member.displayName, score);
      }

      if(this.hasAnswerer()) //뭐라도 정답자가 있다?
      {
        this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
      }
    }
  }
}

//Custom Type Question
/** 23.11.16 답이 없다... 리팩터링 안할거면 걍 유지보수 포기하자*/
class QuestionCustom extends Question
{
  static cycle_type = CYCLE_TYPE.QUESTIONING;
  constructor(quiz_session)
  {
    super(quiz_session);

    this.is_playing_bgm = false;
  }

  async act()
  {
    let quiz_data = this.quiz_session.quiz_data;
    let game_data = this.quiz_session.game_data;
    const option_data = this.quiz_session.option_data;

    const current_question = this.current_question;
    if(current_question == undefined || this.next_cycle == CYCLE_TYPE.ENDING) //제출할 퀴즈가 없으면 패스
    {
      return;
    }

    game_data['processing_question'] = this.current_question; //현재 제출 중인 퀴즈

    this.answers = current_question['answers'];
    const question_id = current_question['question_id'];

    const question_num = game_data['question_num'];
    const quiz_size = quiz_data['quiz_size'];
    logger.info(`Questioning Custom, guild_id:${this.quiz_session.guild_id}, question_num: ${question_num + 1}/${quiz_size}, question_id: ${question_id}`);

    if(this.quiz_session.already_liked == false && question_num == Math.floor(quiz_size / 2)) //절반 정도 했을 때
    {
      const channel = this.quiz_session.channel;
      channel.send({
        embeds: 
                [{ 
                  color: 0x05f1f1, 
                  title: `**${quiz_data['title']}**`,
                  description:  "퀴즈를 재밌게 플레이하고 계신가요? 😀\n진행 중인 퀴즈가 마음에 드신다면 **[추천하기]**를 눌러주세요!\n\n`일정 수 이상의 추천을 받은 퀴즈는 [오마카세/멀티플레이] 퀴즈에서 사용됩니다.`"
                }], 
        components: [ feedback_manager.quiz_feedback_comp ]
      });
    }

    //이미지 표시
    const image_resource = current_question['image_resource'];
    let quiz_ui = this.quiz_session.quiz_ui; 
    quiz_ui.setImage(image_resource);

    if(image_resource != undefined)
    {
      await quiz_ui.update(); //await로 대기 해줘야한다. 안그러면 타이밍 이슈 땜에 이미지가 2번 올라간다.
    }

    //텍스트 표시
    const question_text = current_question['question_text'];
    this.progress_bar_fixed_text = question_text; //텍스트 퀴즈는 progress bar 위에 붙여주면 된다.

    //오디오 재생
    const audio_player = this.quiz_session.audio_player;
    const resource = current_question['audio_resource'];
    let audio_play_time = current_question['audio_length'] ?? 0;

    let fade_in_end_time = undefined; 

    let audio_error_occurred = false;
    if(this.progress_bar_fixed_text?.includes('AUDIO_ERROR'))
    {
      audio_error_occurred = true;
    }

    if(audio_error_occurred == false && audio_play_time != 0) //오디오 재생해야하면
    {
      this.is_playing_bgm = false;

      try
      {
        const result = await this.startAudio(audio_player, resource);
        fade_in_end_time = result;
      }
      catch(err)
      {
        audio_play_time = 0; //오디오 재생 시간 0초로 변경 -> 브금 재생
        audio_error_occurred = true;
      }

      if(audio_error_occurred == false)
      {
        this.autoFadeOut(audio_player, resource, audio_play_time); //audio_play_time으로 자동 페이드 아웃 체크
      }
    }
        
    if(audio_error_occurred == true) //에러 발생 시, 음악만 바꾼다. (오디오 용도가 그냥 브금이었을 수도 있으니깐)
    {
      logger.warn("Audio error occurred on Custom Quiz! Play failover bgm.");

      this.progress_bar_fixed_text += `\n😭 오디오 추출에 실패하여 임시 BGM을 대신 재생합니다.`;

      this.is_playing_bgm = true;
      audio_play_time = 11000; //오디오 재생 시간 11초로 변경
      utility.playBGM(audio_player, BGM_TYPE.FAILOVER); //failover용 브금(오디오 다운로드할 시간 벌기)
    }

    if(audio_play_time == 0) //오디오 없으면 10초 타이머로 대체
    {
      this.is_playing_bgm = true;
      audio_play_time = 10000; //오디오 재생 시간 10초로 변경
      utility.playBGM(audio_player, BGM_TYPE.COUNTDOWN_10); //10초 카운트다운 브금
    }

    this.startProgressBar(audio_play_time); //진행 bar 시작

    let timeover_time = audio_play_time;
    if(this.current_question['use_answer_timer'] == true) //타임 오버 돼도 10초의 여유를 준다면(인트로 퀴즈등)
    {
      const wait_for_answer_time = 10000; //인트로 퀴즈는 문제 내고 10초 더 준다.
      timeover_time += wait_for_answer_time; //타임오버 되기까지 10초 더 줌
      const wait_for_answer_timer = this.createWaitForAnswerTimer(audio_play_time, wait_for_answer_time, BGM_TYPE.COUNTDOWN_10); 
      //audio_play_time 이후에 wait_for_answer_time 만큼 추가 대기임
      this.checkAutoHint(audio_play_time*2); //자동 힌트 체크, 이 경우에는 음악 끝나면 바로 자동 힌트라는 뜻
    }
    else
    {
      this.checkAutoHint(timeover_time); //자동 힌트 체크
    }

    const timeover_promise = this.createTimeoverTimer(timeover_time); //audio_play_time 후에 실행되는 타임오버 타이머 만들어서
    await Promise.race([timeover_promise]); //race로 돌려서 타임오버 타이머가 끝나는걸 기다림

    //어쨋든 타임오버 타이머가 끝났다.
    if(this.quiz_session.force_stop == true) //그런데 강제종료다
    {
      return; //바로 return
    }

    if(this.selected_choice_map != undefined) //혹시나 객관식 선택형 답안 제출자가 있다...?
    {
      const selected_choice_map = this.selected_choice_map;
      const iter = selected_choice_map.entries();
      const score = 1; //객관식은 1점 고정

      for(let i = 0; i < selected_choice_map.size; ++i)
      {
        const [member, selected_value] = iter.next().value;
                
        if(this.answers.includes(selected_value) == false)
        {
          continue;
        }

        this.applyCorrectAnswer(member.id, member.displayName, score);
      }
    }

    if(this.hasAnswerer()) //뭐라도 정답자가 있다?
    {
      this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
    }
    else if(this.isSkipped()) //정답자도 없고 스킵이다?
    {
      this.next_cycle = CYCLE_TYPE.TIMEOVER; //그럼 타임오버로~
    }
    else //그냥 타임오버다?
    {
      this.next_cycle = CYCLE_TYPE.TIMEOVER; //그래도 타임오버로~
    }

    if(this.is_timeover == false) //타임오버로 끝난게 아니다?
    {
      this.gracefulAudioExit(audio_player, resource, fade_in_end_time); //타이머가 제 시간에 끝난게 아니라 오디오 재생이 남아있으니 부드러운 오디오 종료 진행
    }
    else //타임오버로 끝났다?
    {
      this.is_playing_bgm = true; //브금 틀어버려
    }

    if(this.is_playing_bgm) //브금 재생 중이었다면
    {
      current_question['play_bgm_on_question_finish'] = true; //탄식이나 박수를 보내주자~
    }
  }
}

//Omakase Type Question
class QuestionOmakase extends Question
{
  static cycle_type = CYCLE_TYPE.QUESTIONING;
  constructor(quiz_session)
  {
    super(quiz_session);

    this.is_playing_bgm = false;
  }

  async act()
  {
    let quiz_data = this.quiz_session.quiz_data;
    let game_data = this.quiz_session.game_data;
    const option_data = this.quiz_session.option_data;

    const current_question = this.current_question;
    if(current_question == undefined || this.next_cycle == CYCLE_TYPE.ENDING) //제출할 퀴즈가 없으면 패스
    {
      return;
    }

    game_data['processing_question'] = this.current_question; //현재 제출 중인 퀴즈

    this.answers = current_question['answers'];
    const question_id = current_question['question_id'];

    const question_num = game_data['question_num'];
    const quiz_size = quiz_data['quiz_size'];
    logger.info(`Questioning ${this.quiz_session.isMultiplayerSession() ? 'Multiplayer ' : ''}Omakase, guild_id:${this.quiz_session.guild_id}, question_num: ${question_num + 1}/${quiz_size}, question_id: ${question_id ?? current_question['question']}`);

    //이미지 표시
    const image_resource = current_question['image_resource'];
    let quiz_ui = this.quiz_session.quiz_ui; 
    quiz_ui.setImage(image_resource);

    //오마카세 퀴즈 전용
    quiz_ui.setTitle(`[ ${quiz_data['icon']} ${current_question['question_title']} ]`);
        

    if(image_resource != undefined)
    {
      await quiz_ui.update(); //await로 대기 해줘야한다. 안그러면 타이밍 이슈 땜에 이미지가 2번 올라간다.
    }

    //텍스트 표시
    const question_text = current_question['question_text'];
    this.progress_bar_fixed_text = question_text; //텍스트 퀴즈는 progress bar 위에 붙여주면 된다.

    //오디오 재생
    const audio_player = this.quiz_session.audio_player;
    const resource = current_question['audio_resource'];
    let audio_play_time = current_question['audio_length'] ?? 0;

    let fade_in_end_time = undefined; 

    let audio_error_occurred = false;
    if(this.progress_bar_fixed_text?.includes('AUDIO_ERROR'))
    {
      audio_error_occurred = true;
    }

    if(audio_error_occurred == false && audio_play_time != 0) //오디오 재생해야하면
    {
      this.is_playing_bgm = false;

      try
      {
        const result = await this.startAudio(audio_player, resource);
        fade_in_end_time = result;
      }
      catch(err)
      {
        audio_error_occurred = true;
      }

      if(audio_error_occurred == false)
      {
        this.autoFadeOut(audio_player, resource, audio_play_time); //audio_play_time으로 자동 페이드 아웃 체크
      }
    } 

    if(audio_error_occurred == true) //오마카세 퀴즈에서는 에러 발생 시, 다음 문제로 다시 ㄱㄱ
    {
      logger.warn("Audio error occurred on Omakase Quiz! Skip to next question.");
      this.next_cycle = CYCLE_TYPE.CLEARING;
      game_data['question_num'] -= 1;
      utility.playBGM(audio_player, BGM_TYPE.FAILOVER); //failover용 브금(오디오 다운로드할 시간 벌기)
      
      const error_message = `\`\`\`❗ 문제 제출 중 오디오 에러가 발생하여 다른 문제로 다시 제출합니다. 잠시만 기다려주세요.\n에러 메시지: ${this.progress_bar_fixed_text?.trim()}\`\`\``;

      this.quiz_session.sendMessage({content: error_message});

      await utility.sleep(11000); //Failover 브금 11초임 
            
      return;
    }

    if(audio_play_time == 0) //오디오 없으면 10초 타이머로 대체
    {
      this.is_playing_bgm = true;
      audio_play_time = 10000; //오디오 재생 시간 10초로 변경
      utility.playBGM(audio_player, BGM_TYPE.COUNTDOWN_10); //10초 카운트다운 브금
    }

    this.startProgressBar(audio_play_time); //진행 bar 시작

    let timeover_time = audio_play_time;
    if(this.current_question['use_answer_timer'] == true) //타임 오버 돼도 10초의 여유를 준다면(인트로 퀴즈등)
    {
      const wait_for_answer_time = 10000; //인트로 퀴즈는 문제 내고 10초 더 준다.
      timeover_time += wait_for_answer_time; //타임오버 되기까지 10초 더 줌
      const wait_for_answer_timer = this.createWaitForAnswerTimer(audio_play_time, wait_for_answer_time, BGM_TYPE.COUNTDOWN_10); 
      //audio_play_time 이후에 wait_for_answer_time 만큼 추가 대기임
      this.checkAutoHint(audio_play_time*2); //자동 힌트 체크, 이 경우에는 음악 끝나면 바로 자동 힌트라는 뜻
    }
    else
    {
      this.checkAutoHint(timeover_time); //자동 힌트 체크
    }

    const timeover_promise = this.createTimeoverTimer(timeover_time); //audio_play_time 후에 실행되는 타임오버 타이머 만들어서
    await Promise.race([timeover_promise]); //race로 돌려서 타임오버 타이머가 끝나는걸 기다림

    //어쨋든 타임오버 타이머가 끝났다.
    if(this.quiz_session.force_stop == true) //그런데 강제종료다
    {
      return; //바로 return
    }

    if(this.is_timeover == false) //그런데 타임오버로 끝난게 아니다.
    {
      if(this.hasAnswerer()) //정답자가 있다?
      {
        this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
      }
      else if(this.isSkipped()) //스킵이다?
      {
        this.next_cycle = CYCLE_TYPE.TIMEOVER; //그럼 타임오버로~
      }
      this.gracefulAudioExit(audio_player, resource, fade_in_end_time); //타이머가 제 시간에 끝난게 아니라 오디오 재생이 남아있으니 부드러운 오디오 종료 진행
    }
    else //타임오버거나 정답자 없다면
    {
      this.is_playing_bgm = true;
      this.next_cycle = CYCLE_TYPE.TIMEOVER; //타임오버로
    }

    if(this.is_playing_bgm) //브금 재생 중이었다면
    {
      current_question['play_bgm_on_question_finish'] = true; //탄식이나 박수를 보내주자~
    }
  }
}

//Unknown Type Question
class QuestionUnknown extends Question
{
  static cycle_type = CYCLE_TYPE.QUESTIONING;
  constructor(quiz_session)
  {
    super(quiz_session);
  }

  async enter()
  {
    const channel = this.quiz_session.channel;
    channel.send({content: text_contents.quiz_play_ui.unknown_quiz_type});
    this.forceStop();
  }
}

//#endregion

//#region Timeover Cycle
/** 문제 못 맞춰서 Timeover 일 떄 **/
class TimeOver extends QuizLifeCycleWithUtility
{
  static cycle_type = CYCLE_TYPE.TIMEOVER;
  constructor(quiz_session)
  {
    super(quiz_session);
    this.next_cycle = CYCLE_TYPE.CLEARING;
    this.custom_wait = undefined;
  }

  async enter()
  {
    //정답 표시
    const quiz_data = this.quiz_session.quiz_data;
    const game_data = this.quiz_session.game_data;
    const processing_question = game_data['processing_question'];

    let quiz_ui = this.quiz_session.quiz_ui;

    quiz_ui.embed.color = 0X850000;

    quiz_ui.embed.title = text_contents.timeover_ui.title;

    let answer_list_message = '';
    const answers = processing_question['answers'] ?? [];
    if(answers.length > 0)
    {
      answers.forEach((answer) => 
      {
        answer_list_message += answer + "\n";
      });
    }

    let author_list_message = '';
    const author_list = processing_question['author'] ?? [];
    if(author_list.length > 0)
    {
      author_list.forEach((author) => 
      {
        if(author != undefined)
        {
          author_list_message += author + "\n";
        }
      });
    }

    let description_message = text_contents.timeover_ui.description;
    description_message = description_message.replace('${question_answers}', answer_list_message);
    description_message = description_message.replace('${question_author}', author_list_message);
    quiz_ui.embed.description = description_message;

    if(this.quiz_session.hasMoreQuestion() === false)
    {
      quiz_ui.embed.footer =  {
        "text": text_contents.timeover_ui.footer_for_end
      };
    }
    else
    {
      quiz_ui.embed.footer = {
        "text": text_contents.timeover_ui.footer_for_continue
      };
    }

    quiz_ui.components = [];

    const scoreboard_fields = this.getScoreboardFields();

    quiz_ui.embed.fields = scoreboard_fields;

    this.custom_wait = await this.applyAnswerAudioInfo(processing_question);
    const image_exist = this.applyAnswerImageInfo(processing_question);

    quiz_ui.send(false, false);
  }

  async act()
  {
    const game_data = this.quiz_session.game_data;
    const processing_question = game_data['processing_question'];
    if(processing_question['play_bgm_on_question_finish'] == true && this.custom_wait == undefined) //BGM 재생 FLAG가 ON이고 answer_audio가 없다면
    {
      utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.FAIL); //bgm 재생
    }
    const wait_time = this.custom_wait ?? SYSTEM_CONFIG.timeover_cycle_wait; //정답 얼마동안 들려줄 지
    await utility.sleep(wait_time);
  }

  async exit()
  {

  }
}

//#endregion

//#region CorrectAnswer Cycle
/** Question 상태에서 정답 맞췄을 때 **/
class CorrectAnswer extends QuizLifeCycleWithUtility
{
  static cycle_type = CYCLE_TYPE.CORRECTANSWER;
  constructor(quiz_session)
  {
    super(quiz_session);
    this.next_cycle = CYCLE_TYPE.CLEARING;
    this.custom_wait = undefined;
  }

  async enter()
  {
    //정답자 표시
    const quiz_data = this.quiz_session.quiz_data;
    const game_data = this.quiz_session.game_data;
    const processing_question = game_data['processing_question'];
    const answer_members = processing_question['answer_members'] ?? [];
    let answer_members_nickname = "";
    if(answer_members.length > 1)
    {
      answer_members_nickname = "\n";
    }

    const scoreboard = this.quiz_session.scoreboard;
    answer_members.forEach(answerer_id => 
    {
      const answerer_info = scoreboard.get(answerer_id);
      if(answerer_info === undefined)
      {
        return;
      }

      answer_members_nickname +=  `[ ${answerer_info.name} ]\n`;
    });

    let quiz_ui = this.quiz_session.quiz_ui;

    quiz_ui.embed.color = 0x54B435;

    quiz_ui.embed.title = text_contents.correct_answer_ui.title;

    let answer_list_message = '';
    const answers = processing_question['answers'] ?? [];
    answers.forEach((answer) => 
    {
      answer_list_message += answer + "\n";
    });

    let author_list_message = '';
    const author_list = processing_question['author'] ?? [];
    author_list.forEach((author) => 
    {
      if(author != undefined)
      {
        author_list_message += author + "\n";
      }
    });

    let description_message = text_contents.correct_answer_ui.description;
    description_message = description_message.replace('${answer_member_name}', answer_members_nickname); //정답 ui은 이거 추가됏음
    description_message = description_message.replace('${question_answers}', answer_list_message);
    description_message = description_message.replace('${question_author}', author_list_message);
    quiz_ui.embed.description = description_message;

    if(this.quiz_session.hasMoreQuestion() === false)
    {
      quiz_ui.embed.footer =  {
        "text": text_contents.correct_answer_ui.footer_for_end
      };
    }
    else
    {
      quiz_ui.embed.footer = {
        "text": text_contents.correct_answer_ui.footer_for_continue
      };
    }

    quiz_ui.components = [];

    const scoreboard_fields = this.getScoreboardFields();

    quiz_ui.embed.fields = scoreboard_fields;

    this.custom_wait = await this.applyAnswerAudioInfo(processing_question);
    const image_exist = this.applyAnswerImageInfo(processing_question);

    quiz_ui.send(false, false);
  }

  async act()
  {
    const game_data = this.quiz_session.game_data;
    const processing_question = game_data['processing_question'];
    if(processing_question['play_bgm_on_question_finish'] == true && this.custom_wait == undefined) //BGM 재생 FLAG가 ON이고 answer_audio가 없다면
    {
      utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.SUCCESS); //bgm 재생
    }
    const wait_time = this.custom_wait ?? SYSTEM_CONFIG.timeover_cycle_wait; //정답 얼마동안 들려줄 지
    await utility.sleep(wait_time);
  }

  async exit()
  {

  }

}
//#endregion


//#region Clearing Cycle
/** 자원 정리용 **/
class Clearing extends QuizLifeCycleWithUtility
{
  static cycle_type = CYCLE_TYPE.CLEARING;
  constructor(quiz_session)
  {
    super(quiz_session);
    this.next_cycle = CYCLE_TYPE.QUESTIONING;
    this.custom_wait = undefined;
  }

  async enter()
  {
        
  }

  async act()
  {

  }

  async exit()
  {
    const quiz_data = this.quiz_session.quiz_data;
    const game_data = this.quiz_session.game_data;

    if(SYSTEM_CONFIG.explicit_close_audio_stream) //오디오 STREAM 명시적으로 닫음
    {
      const audio_stream_for_close = game_data['audio_stream_for_close'];
      if(audio_stream_for_close != undefined && audio_stream_for_close.length != 0)
      {
        const used_stream = audio_stream_for_close.shift();
        used_stream.forEach((audio_stream) => 
        {
          if(audio_stream == undefined) return;

          if(audio_stream.closed == false)
            audio_stream.close();
          if(audio_stream.destroyed == false)
            audio_stream.destroy();
        });
      }
    }

    let quiz_ui = this.quiz_session.quiz_ui;
    quiz_ui.delete();

    //이전 퀴즈 resource 해제
    const previous_question = game_data['processing_question'];
    if(previous_question != undefined)
    {
      const fade_out_timer = previous_question['fade_out_timer']; //이전에 호출한 fadeout이 아직 안끝났을 수도 있다.
      if(fade_out_timer != undefined)
      {
        clearTimeout(fade_out_timer);
      }
    }

    delete game_data['processing_question'];

    let has_more_question = this.quiz_session.hasMoreQuestion();
    if(has_more_question && this.quiz_session.quiz_data.question_list.length === 0) //has more question 인데 question_list가 empty다.
    {
      logger.warn(`has more question. but question list is empty. stop quiz`);
      has_more_question = false;

      this.quiz_session.sendMessage(`\`\`\`🔸 더 이상 제출할 문제가 없어 퀴즈가 마무리 됩니다.\`\`\``);
    }

    if(has_more_question === false) //모든 퀴즈 제출됐음
    {
      this.next_cycle = CYCLE_TYPE.ENDING;
      logger.info(`All Question Submitted on Clearing, guild_id:${this.quiz_session.guild_id}`);

      if(this.quiz_session.isMultiplayerSession() && this.quiz_session.isHostSession())
      {
        this.quiz_session.sendFinishUp(); //호스트는 서버에 게임 마무리한다고 알림
      }
      
      return; //더 이상 진행할 게 없다.
    }

    if(this.quiz_session.isMultiplayerSession())
    {
      if(this.quiz_session.isMultiplayerSessionExpired())
      {
        this.next_cycle = CYCLE_TYPE.ENDING; //서버 expired 된 상태면 ending으로
        return;
      }

      this.next_cycle = CYCLE_TYPE.HOLD;
      this.quiz_session.waitForSyncDone();
    }
    
  }
}

//#endregion

//#region Ending Cycle
/** 점수 공개 **/
class Ending extends QuizLifeCycleWithUtility
{
  static cycle_type = CYCLE_TYPE.ENDING;
  constructor(quiz_session)
  {
    super(quiz_session);
    this.next_cycle = CYCLE_TYPE.FINISH;
  }

  async act()
  {
    const quiz_data = this.quiz_session.quiz_data;
    let quiz_ui = this.quiz_session.quiz_ui;
    const channel = this.quiz_session.channel;

    if(this.quiz_session.already_liked == false)
    {
      const channel = this.quiz_session.channel;
      channel.send({
        embeds: 
            [{ 
              color: 0x05f1f1, 
              title: `**${quiz_data['title']}**`,
              description:  "퀴즈를 재밌게 플레이하셨나요? 😀\n방금 플레이하신 퀴즈가 마음에 드셨다면 **[추천하기]**를 눌러주세요!\n\n`일정 수 이상의 추천을 받은 퀴즈는 [오마카세/멀티플레이] 퀴즈에서 사용됩니다.`"
            }], 
        components: [ feedback_manager.quiz_feedback_comp ]});
    }

    quiz_ui.embed.color = 0xFED049,

    quiz_ui.embed.title = text_contents.ending_ui.title;
    quiz_ui.embed.description = `${quiz_data['icon']} ${quiz_data['title']}\n \n \n`;
    quiz_ui.embed.footer = undefined; //footer 없앰

    quiz_ui.embed.fields = [ //페이크 필드
      {
        name: ' \n',
        value: ' \n',
      },
    ];

    quiz_ui.setImage(undefined);

    utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.BELL);

    await quiz_ui.send(false);

    
    await utility.sleep(SYSTEM_CONFIG.ending_wait);
    let scoreboard = this.quiz_session.scoreboard;
    if(scoreboard.size == 0) //정답자가 없다면
    {
      quiz_ui.embed.description += text_contents.ending_ui.nobody_answer;
      utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.FAIL);
      quiz_ui.update();
      await utility.sleep(SYSTEM_CONFIG.ending_wait); 
    }
    else
    {
      scoreboard = utility.sortMapByProperty(scoreboard, 'score'); //정렬 해주고
      let iter = scoreboard.entries();
            
      let winner_name = undefined;
      for(let i = 0; i < scoreboard.size; ++i)
      {
        const [answerer_id, answerer_info] = iter.next().value;

        let medal = '🧐';
        switch(i)
        {
        case 0: {
          winner_name = answerer_info.name;
          medal = text_contents.icon.ICON_MEDAL_GOLD; 
          break;
        }
        case 1: medal = text_contents.icon.ICON_MEDAL_SILVER; break;
        case 2: medal = text_contents.icon.ICON_MEDAL_BRONZE; break;
        }

        if(i == 3) //3등과 간격 벌려서
        {
          quiz_ui.embed.description += ` \n \n`;
        }

        let ranker_name = answerer_info.name;
        if(this.quiz_session.isMultiplayerSession())
        {
          ranker_name = this.quiz_session.getParticipant(answerer_id)?.guild_name;
        }

        quiz_ui.embed.description += `${medal} ${ranker_name}    ${answerer_info.score}${text_contents.scoreboard.point_name}\n`;
        if(i < 3) //3등까지는 하나씩 보여줌
        {
          quiz_ui.embed.description += ` \n`; //3등까지는 간격도 늘려줌
          utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.SCORE_ALARM);
          quiz_ui.update();
          await utility.sleep(SYSTEM_CONFIG.ending_wait);
          continue;
        }
      }

      if(scoreboard.size > 3) //나머지 더 보여줄 사람 있다면
      {
        utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.SCORE_ALARM);
        quiz_ui.update();
        await utility.sleep(SYSTEM_CONFIG.ending_wait);
      }

      //1등 칭호 보여줌
      quiz_ui.embed.description += ` \n \n`;

      let top_score_description_message = '';

      if(this.quiz_session.isMultiplayerSession()) //멀티면 mvp 를 보여준다.
      {
        const mvp_info = this.quiz_session.mvp_info;
        if(mvp_info !== undefined)
        {
          top_score_description_message = `**🏆 MVP __${mvp_info.name}__ ${mvp_info.score}점!** \n`;
        }
        else
        {
          logger.warn(`The mvp info is undefined on Multiplayer Ending cycle`);
        }
      }
      else 
      {
        top_score_description_message = text_contents.ending_ui.winner_user_message;
        top_score_description_message = top_score_description_message.replace('${winner_nickname}', quiz_data['winner_nickname']);
        top_score_description_message = top_score_description_message.replace('${winner_username}', winner_name);
      }
      quiz_ui.embed.description += top_score_description_message;

    }
        
    utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.ENDING);
    quiz_ui.update();
    await utility.sleep(SYSTEM_CONFIG.ending_wait); 

    if(this.quiz_session.isMultiplayerSession()) //멀티면 3초 더 기다린다. 여운? 을 위해 ㅎ...
    {
      await utility.sleep(3000); 
    }

    logger.info(`End Quiz Session, guild_id:${this.quiz_session.guild_id}`);
  }
}

//#endregion

//#region Finish Cycle
/** Quiz session 종료 **/
class Finish extends QuizLifeCycle
{
  static cycle_type = CYCLE_TYPE.FINISH;
  constructor(quiz_session)
  {
    super(quiz_session);
    this.next_cycle = CYCLE_TYPE.UNDEFINED;
    this.ignore_block = true; //FINISH Cycle은 막을 수가 없다.
  }

  async act()
  {
    const audio_player = this.quiz_session.audio_player;
    if(audio_player != undefined)
    {
      audio_player.stop(true);
    }
    const voice_connection = this.quiz_session.voice_connection;
    if(voice_connection!= undefined)
    {
      try
      {
        voice_connection.destroy();
      }
      catch(error)
      {
        return;
      }
    }

    if(this.quiz_session.isMultiplayerSession() && this.quiz_session.isHostSession() && this.quiz_session.isIngame() && this.quiz_session.force_stop === false)
    {
      this.quiz_session.sendFinished(); //호스트는 서버에 게임 끝났다고 알림
    }
  }

  async exit()
  {
    const guild_id = this.quiz_session.guild_id;
        
    this.quiz_session.free();

    delete quiz_session_map[guild_id];
  }
}
//#endregion

//#region HOLD Cycle
/** Quiz session 종료 **/
class HOLD extends QuizLifeCycle
{
  static cycle_type = CYCLE_TYPE.HOLD;
  constructor(quiz_session)
  {
    super(quiz_session);
  }

  async act()
  {
    //그냥 아무것도 안하는 CYCLE. 멀티에서 필요해서 만듦
  }

}
//#endregion
