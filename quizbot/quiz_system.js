'use strict';

//voice 용으로 libsodium-wrapper 를 쓸 것! sodium 으로 하면 cpu 사용량 장난아님;;

//#region 외부 모듈 로드
const fs = require('fs');
const ytdl = require('discord-ytdl-core');
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, RESTJSONErrorCodes, TeamMemberMembershipState } = require('discord.js');
const pathToFfmpeg = require('ffmpeg-static');
process.env.FFMPEG_PATH = pathToFfmpeg;
const ffmpeg = require('fluent-ffmpeg');
const stream = require('stream');
// const { SeekStream } = require('play-dl');
//#endregion

//#region 로컬 모듈 로드
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE, EXPLAIN_TYPE, BGM_TYPE, QUIZ_MAKER_TYPE } = require('../config/system_setting.js');
const option_system = require("./quiz_option.js");
const OPTION_TYPE = option_system.OPTION_TYPE;
const text_contents = require('../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const utility = require('../utility/utility.js');
const logger = require('../utility/logger.js')('QuizSystem');
const db_manager = require('./managers/db_manager.js');
const { initial } = require('lodash');
const { error } = require('console');
const { SeekStream } = require('../utility/SeekStream/SeekStream.js');

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
}

const AUDIO_BUFFER_SIZE = 1024 * 1024 * 10; //10mb
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
}

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
}

exports.getQuizSession = (guild_id) => {

    if(quiz_session_map.hasOwnProperty(guild_id) == false)
    {
        return undefined;
    }

    return quiz_session_map[guild_id];
}

exports.startQuiz = (guild, owner, channel, quiz_info) =>
{
    const guild_id = guild.id;
    if(quiz_session_map.hasOwnProperty(guild_id))
    {
      const prev_quiz_session = quiz_session_map[guild_id];
      prev_quiz_session.free();
    }

    const quiz_session = new QuizSession(guild, owner, channel, quiz_info);
    quiz_session_map[guild_id] = quiz_session;

    return quiz_session;
}

exports.getLocalQuizSessionCount = () => {
    return Object.keys(quiz_session_map).length;
}

exports.getMultiplayQuizSessionCount = () => {
    return 0; //TODO 나중에 멀티플레이 만들면 수정, 멀티플레이 할 때, 퀴즈 정적 로드해두고, 로드 시, 파일 해쉬값 겹치는지 확인해서 중복로드 피할것
}

exports.startFFmpegAgingManager = () => 
{
  return ffmpegAgingManager();
}

let ffmpeg_aging_map = new Map();
//FFmpeg Aging Manager
function ffmpegAgingManager() //TODO ps-node 모듈을 이용한 방식으로 수정해야함
{
  const ffmpeg_aging_for_oldkey_value = SYSTEM_CONFIG.ffmpeg_aging_manager_criteria * 1000; //last updated time이 일정 값 이전인 ffmpeg는 종료할거임
  const ffmpeg_aging_manager = setInterval(()=>{
      
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

/** @distube/ytdl-core 에만 있는 agent 기능, 다만 이 ytdl-core는 HTTP 통신 모듈로 기존 ytdl-core와는 다른걸 사용한다.(쿠키 지원을 위해서 인듯. 이름은 기억 안남) 
 * 여기까지는 괜찮다...다만 requestOptions로 ipv6 주소를 localAddress에 넣고 family 값도 6으로 넘겨야 잘 인식하는데
 * 기존 ytdl-core은 이렇게하면 잘 되는데 @distube/ytdl-core는 family 값 지정 기능이 없다...
 * 따라서 유일하게 지원하는 autoSelectFamily를 true로 넘겨야하는데, 이 기능은 nodejs 18부터 지원한다...! 흑흑
 * 우선 어거지로 16 -> 18로 업데이트했는데 큰 문제는 없이 동작한다.
 * 만약 EINVAL(errno -22)에러가 뜨면 IPv6 주소를 IPv4로 파싱하려고 하다 문제가 생긴거니, family 값을 잘 명시해줘야하며
 * 만약 -99에러가 뜨면 정말 해당 ip로 외부 통신이 불가능한것이라 발생한다.(localAddress에 IP주소 잘 넣었는지 확인필요)
 * 
 * 24.02.02 정말 @distube/ytdl-core만을 사용해야하는지 의문이 든다.
 * 유일한 문제점은 해당 모듈이 HTTP 통신 모듈로 undici를 사용하는데, 이 경우 localAddress 옵션이 잘 먹지 않고 bind -22 에러가 난다는 문제다...
 * 또한 해당 모듈로 바꾼 뒤부터 connReset 에러가 난다... -> 24.02.08 해당 모듈 문제는 아니었다...nodejs 18로 바꾼게 문제일 수 있으니 16으로 롤백해보기로한다.(ytdl-core 자체의 문제일 수 있다.)
 * 정말 필요한지 한번 다시 고려해보기로 하고 ytdl-core로 롤백하기로 결정하였다.
*/

//Deprecated
// function createYtdlAgent(quiz_session=undefined)
// {
//     let cookie = undefined;
//     let local_address = undefined;
//     let auto_select_family = false;

//     if(SYSTEM_CONFIG.ytdl_cookie_agent_use)
//     {
//         try
//         {
//             const ytdl_cookie_path = SYSTEM_CONFIG.ytdl_cookie_path;
//             if(ytdl_cookie_path == undefined || fs.existsSync(ytdl_cookie_path) == false)
//             {
//                 logger.error(`Failed to create cookie ytdl agent cookie  ${'YTDL Cookie'} ${ytdl_cookie_path} is not exists`);
//                 return false;
//             }

//             cookie = JSON.parse(fs.readFileSync(ytdl_cookie_path));

//             logger.info(`This session is using cookie ytdl agent, cookie file is ${ytdl_cookie_path}, guild_id:${quiz_session?.guild_id}`);
//         }
//         catch(err)
//         {
//             logger.info(`Failed to create cookie ytdl agent cookie path: ${ytdl_cookie_path}, guild_id:${quiz_session?.guild_id}, err: ${err.stack ?? err.message}`);
//         }
//     }

//     if(SYSTEM_CONFIG.ytdl_ipv6_USE)
//     {
//         const ipv6 = utility.getIPv6Address()[0];
//         if(ipv6 == undefined)
//         {
//             logger.info(`This session is using ipv6 for agent, but cannot find ipv6... use default ip address..., guild_id:${quiz_session?.guild_id}`);
//         }
//         else
//         {
//             logger.info(`This session is using ipv6 for agent, selected ipv6 is ${ipv6}, guild_id:${quiz_session?.guild_id}`);
//             local_address = ipv6;
//             auto_select_family = true;
//         }
//     }

//     const ytdl_agent = ytdl.createAgent(
//         cookie,
//         {
//             autoSelectFamily: auto_select_family,
//             localAddress: local_address
//         }
//     ); //cookie 기반 ytdl agent

//     return ytdl_agent;
// }

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
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('force_stop')
        .setLabel('그만하기')
        // .setEmoji(`${text_contents.icon.ICON_STOP}`)
        .setStyle(ButtonStyle.Danger),
    )

    
    this.ox_quiz_comp = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('o')
        .setEmoji(`${text_contents.icon.ICON_O}`) 
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('x')
        .setEmoji(`${text_contents.icon.ICON_X}`)
        .setStyle(ButtonStyle.Secondary),
    )

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
        }
    }
  }

  async send(previous_delete, remember_ui = true)
  {
    if(previous_delete == true)
    {
        this.delete(); //이전 UI는 삭제
    }

    const objects = this.createSendObject();
    await this.channel.send(objects) //await로 대기
    .then((ui_instance) => {
        if(remember_ui == false)
        {
            return;
        }
        this.ui_instance = ui_instance;
    })
    .catch(err => {
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
                quiz_session.owner.send({content: `>>>${guild_id}에서 진행한 퀴즈가 강제 종료되었습니다.\n이유: 봇에게 메시지 보내기 권한이 부족합니다.\n봇을 추방하고 관리자가 다시 초대하도록 해보세요.\n${err.code}`});
		        logger.info(`Send Forcestop Reason MissingPermissions to ${quiz_session.owner.id}, guild_id: ${guild_id}, err.code: ${err.code}`);
            }
	
            return;
        }
        logger.error(`Failed to Send QuizPlayUI, guild_id:${this.guild_id}, embed: ${JSON.stringify(this.embed)}, objects:${JSON.stringify(objects)}, err: ${err.stack}`);
    })
    .finally(() => {
        
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
    .catch(err => {
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
        .catch(err => {
            if(err.code === RESTJSONErrorCodes.UnknownMessage || err.code === RESTJSONErrorCodes.UnknownInteraction) //뭔가 이상함
            {
                return;
            }
            logger.error(`Failed to Update QuizPlayUI, guild_id:${this.guild_id}, embed: ${JSON.stringify(this.embed)}, objects:${JSON.stringify(objects)}, err: ${err.stack}`);
        })
        .finally(() => {
            
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
    const components = this.quiz_play_comp.components
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
    constructor(guild, owner, channel, quiz_info)
    {
        logger.info(`Creating Quiz Session, guild_id: ${guild.id}`);

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

        //퀴즈 타입에 따라 cycle을 다른걸 넣어주면된다.
        //기본 LifeCycle 동작은 다음과 같다
        //Initialize ->
        //EXPLAIN ->
        //Prepare -> if quiz_finish Ending else -> Question
        //Question ->
        //(CorrectAnswer 또는 Timeover) -> Question

        this.createCycle();
        

        this.cycleLoop();
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
                audio_stream_for_close.forEach((audio_stream_array) => {
                    audio_stream_array.forEach((audio_stream) => {
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
        logger.info(`free stream count, ${free_stream_count}`);

        for(const cycle of Object.values(this.lifecycle_map))
        {
            // cycle.free();
        }

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

            default: this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionUnknown(this));            
        }

        this.inputLifeCycle(CYCLE_TYPE.CORRECTANSWER, new CorrectAnswer(this));
        this.inputLifeCycle(CYCLE_TYPE.TIMEOVER, new TimeOver(this));
        this.inputLifeCycle(CYCLE_TYPE.CLEARING, new Clearing(this));

        //이 아래는 공통
        this.inputLifeCycle(CYCLE_TYPE.ENDING, new Ending(this));
        this.inputLifeCycle(CYCLE_TYPE.FINISH, new Finish(this));

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

        const cycle = this.getCycle(current_cycle_type);
        cycle.forceStop();
    }

    /** 세션 이벤트 핸들링 **/
    on(event_name, event_object)
    {
        const current_cycle = this.getCycle(this.current_cycle_type)
        if(current_cycle == undefined)
        {
            return;
        }
        current_cycle.on(event_name, event_object);
    }
}
//#endregion

//#region 퀴즈 cycle 용 lifecycle의 base
class QuizLifecycle
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
        this.quiz_session = null;
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
            try{
                goNext = (await this.enter()) ?? true;    
            }catch(err)
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
            try{
                goNext = (await this.act()) ?? true;    
            }catch(err)
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
            try{
                goNext = (await this.exit()) ?? true;    
            }catch(err)
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
                    const reject_message = '```' + `${text_contents.quiz_play_ui.only_owner_can_use_stop}` +'```'
                    interaction.channel.send({content: reject_message});
                    return;
                }
                this.forceStop();
                let force_stop_message = text_contents.quiz_play_ui.force_stop;
                force_stop_message = force_stop_message.replace("${who_stopped}", interaction.member.user.username);
                interaction.channel.send({content: force_stop_message});
                return;
            }

            return this.onInteractionCreate(event_object);

        case CUSTOM_EVENT_TYPE.message:
            return this.onMessageCreate(event_object);
        }
    }

    /** 커스텀 이벤트 핸들러 **/
    onInteractionCreate(interaction)
    {

    }

    onMessageCreate(message)
    {

    }
}

class QuizLifeCycleWithUtility extends QuizLifecycle //여러 기능을 포함한 class, 
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
        
        if(scoreboard.size > 0)
        {
            scoreboard = utility.sortMapByValue(scoreboard); //우선 정렬 1번함
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
            )

            const show_count = option_data.quiz.score_show_max == -1 ? scoreboard.size : option_data.quiz.score_show_max;

            const iter = scoreboard.entries();
            for(let i = 0; i < show_count; ++i)
            {
                const [member, score] = iter.next().value;
                scoreboard_fields.push({
                    name: member.displayName,
                    value: `${score}${text_contents.scoreboard.point_name}`,
                    inline: true
                });
            }
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
        this.autoFadeOut(audio_player, audio_resource, audio_play_time) //자동 fadeout

        return audio_play_time;
    }

    //target_question에서 정답 표시용 이미지 정보 꺼내서 세팅
    applyAnswerImageInfo(target_question)
    {
        let quiz_ui =  this.quiz_session.quiz_ui
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
        const fade_out_timer = setTimeout(() => {
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
class Initialize extends QuizLifecycle
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
        }
        
        this.asyncCallCycle(CYCLE_TYPE.PREPARE); //미리 문제 준비
    }

    async basicInitialize()
    {
        logger.info(`Start basic initialize of quiz session, guild_id:${this.quiz_session.guild_id}`);

        const voice_channel = this.quiz_session.voice_channel;
        const guild = this.quiz_session.guild;

        //보이스 커넥션
        const voice_connection = joinVoiceChannel({
            channelId: voice_channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });
        logger.info(`Joined Voice channel, guild_id:${this.quiz_session.guild_id}, voice_channel_id:${voice_channel.id}`);

        //보이스 끊겼을 때 핸들링
        voice_connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {

            if(this.quiz_session.force_stop == true || this.quiz_session.current_cycle_type == CYCLE_TYPE.FINISH) //강종이나 게임 종료로 끊긴거면
            {
                return;
            }

            try {
                //우선 끊어졌으면 재연결 시도를 해본다.
                logger.info(`Try voice reconnecting..., guild_id:${this.quiz_session.guild_id}`);
                await Promise.race([
                    entersState(voice_connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(voice_connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                //근데 정말 연결 안되면 강제 종료한다.
                logger.info(`Failed to voice reconnecting, force stop this quiz session, guild_id:${this.quiz_session.guild_id}`);
                try{
                    voice_connection.destroy();
                }catch(error) {
                }
                
                await this.quiz_session.forceStop();
            }
        });
		
        //보이스 커넥션 생성 실패 문제 해결 방안 https://github.com/discordjs/discord.js/issues/9185, https://github.com/umutxyp/MusicBot/issues/97
        const networkStateChangeHandler = (oldNetworkState, newNetworkState) => {
            const newUdp = Reflect.get(newNetworkState, 'udp');
            clearInterval(newUdp?.keepAliveInterval);
        };

        voice_connection.on('stateChange', (oldState, newState) => {
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

        this.quiz_session.voice_connection = voice_connection;
        this.quiz_session.audio_player = audio_player;
        
        //옵션 로드
        this.loadOptionData().then((option_data) => {
            this.quiz_session.option_data = option_data;
        });

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
    makeAnswers(answers_row)
    {
        if(answers_row == undefined)
        {
            return [];
        }

        const option_data = this.quiz_session.option_data;        

        let answers = [];
        let similar_answers = []; //유사 정답은 마지막에 넣어주자
        answers_row.forEach((answer_row) => {

            answer_row = answer_row.trim();

            //유사 정답 추측
            let similar_answer = '';
            const words = answer_row.split(" ");
            if(words.length > 1)
            {
                words.forEach((split_answer) => {
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
            similar_answers.forEach((similar_answer) => { //유사 정답도 넣어주자
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
    makeHint(base_answer)
    {
        base_answer = base_answer.trim();

        let hint = undefined;
        const hintLen = Math.ceil(base_answer.replace(/ /g, "").length / SYSTEM_CONFIG.hint_percentage); //표시할 힌트 글자 수
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

        info_data.split('\n').forEach((line) => {
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
        question_list.forEach((question) => {
            const quiz_type = quiz_data['quiz_type'];
            question['type'] = quiz_type;

            question['hint_used'] = false;
            question['skip_used'] = false;
            question['play_bgm_on_question_finish'] = true; //Question cycle 종료 후 bgm 플레이 여부, 텍스트 기반 퀴즈는 true다.

            //정답 키워드 파싱
            let answer_string = question['answer_string'] ?? '';
            let answers_row = answer_string.split("&#"); //정답은 &#으로 끊었다.
            const answers = this.makeAnswers(answers_row);
            question['answers'] = answers;

            if(quiz_type != QUIZ_TYPE.OX) //ox 퀴즈는 힌트가 없다
            {
                //힌트 만들기
                let hint = undefined;
                if(answers_row.length > 0)
                {
                    hint = this.makeHint(answers_row[0]) ?? undefined;
                }
                question['hint'] = hint;
            }
            
        });

        return question_list;
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
                    
        quiz_folder_list.forEach(question_folder_name => {

            const question_folder_path = quiz_path + "/" + question_folder_name;
            const question_type = quiz_data['quiz_type'];
            
            if(question_folder_name.includes("info.txt")) return;

            if(question_folder_name.includes("quiz.txt")) //엇 quiz.txt 파일이다.
            {
                if(question_type != QUIZ_TYPE.TEXT && question_type != QUIZ_TYPE.TEXT && question_type != QUIZ_TYPE.OX) //그런데 텍스트 기반 퀴즈가 아니다?
                {
                    return; //그럼 그냥 return
                }

                question_list = this.parseFromQuizTXT(question_folder_path); //quiz.txt 에서 파싱하는 걸로...
                return;
            }

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
                author_string.split("&^").forEach((author_row) => {
                    const author = author_row.trim();
                    authors.push(author);
                })

                question['author'] = authors;
            }

            //정답 키워드 파싱
            let answer_string = try_parse_author[0];
            answer_string = question_folder_name.split("&^")[0];
            let answers_row = answer_string.split("&#"); //정답은 &#으로 끊었다.
            const answers = this.makeAnswers(answers_row);
            question['answers'] = answers;


            //힌트 만들기
            let hint = undefined;
            if(answers_row.length > 0)
            {
                hint = this.makeHint(answers_row[0]) ?? undefined;
            }
            question['hint'] = hint;

            //실제 문제로 낼 퀴즈 파일
        
            const question_file_list = fs.readdirSync(question_folder_path);
            question_file_list.forEach(question_folder_filename => { 
                const file_path = question_folder_path + "/" + question_folder_filename;
                
                // const stat = fs.lstatSync(file_path); //이것도 성능 잡아먹는다. 어차피 개발자 퀴즈니깐 할 필요 없음
                // if(stat.isDirectory()) return; //폴더는 건너뛰고

                if(question_type == QUIZ_TYPE.SONG || question_type == QUIZ_TYPE.IMAGE || question_type == QUIZ_TYPE.SCRIPT || question_type == QUIZ_TYPE.IMAGE_LONG)
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

            //question_list에 넣어주기
            if(question != undefined) 
            {
                question_list.push(question);
            }
        });

        question_list.sort(() => Math.random() - 0.5); //퀴즈 목록 무작위로 섞기
        quiz_data['question_list'] = question_list;
        quiz_data['quiz_size'] = question_list.length; //퀴즈 수 재정의 하자
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
            logger.error(`Failed to custom quiz initialize of quiz session, guild_id:${this.quiz_session.guild_id}, cycle_info:${this.cycle_info}, quiz_data: ${JSON.stringify(this.quiz_session.quiz_data)}, err: ${err.stack}`);
        }
    }

    async CustomQuizInitialize()
    {
        logger.info(`Start custom quiz initialize of quiz session, guild_id:${this.quiz_session.guild_id}`);

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
        
        question_row_list.forEach((question_row) => {

            let question = {};
            question['type']  = QUIZ_TYPE.CUSTOM;
            question['hint_used'] = false;
            question['skip_used'] = false;
            question['play_bgm_on_question_finish'] = false; //custom 퀴즈에서는 상황에 따라 다르다

            Object.keys(question_row).forEach((key) => {
                const value = question_row[key];
                question[key] = value;
            });

            const question_data = question_row.data;


            /** 문제용 이벤트 */
            //정답 값 처리
            const answer_string = question_data['answers'];
            const answers_row = answer_string.split(","); //custom quiz는 ,로 끊는다
            const answers = this.makeAnswers(answers_row);
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
                question['hint'] = this.makeHint(answers[0]) //힌트 없으면 알아서 만들기
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

            /**완성했으면 넣자 */
            question_list.push(question);

        });

        question_list.sort(() => Math.random() - 0.5); //퀴즈 목록 무작위로 섞기
        quiz_data['question_list'] = question_list;
        quiz_data['quiz_size'] = question_list.length; //퀴즈 수 재정의 하자

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
class Explain extends QuizLifecycle
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
        

        const explain_list = text_contents.quiz_explain[explain_type];
        for(let i = 0; i < explain_list.length; ++i)
        {
            const explain = explain_list[i];
            quiz_ui.embed.description += explain;
            utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.PLING);
            quiz_ui.update();

            await utility.sleep(SYSTEM_CONFIG.explain_wait);
        }

        //k, h 관련 알림
        const option_data = this.quiz_session.option_data;
        if(option_data.quiz.use_message_intent == OPTION_TYPE.ENABLED) //메시지 입력 감시 옵션 on일 때만
        {
            const channel = quiz_ui.channel;
            channel.send('```' + `${text_contents.quiz_explain.how_to_request_hint_and_skip}` + '```');
            utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.PLING);

            await utility.sleep(SYSTEM_CONFIG.explain_wait);
        }

    }
}

//#endregion

//#region Prepare Cycle
/** 퀴즈 내기 전, 퀴즈 준비하는 단계인 Prepare **/
class Prepare extends QuizLifecycle
{
    static cycle_type = CYCLE_TYPE.PREPARE;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_cycle = CYCLE_TYPE.UNDEFINED;
        this.skip_prepare = false;
        this.prepared_question = undefined;
        this.target_question = undefined;
        this.current_audio_streams = [];
    }

    async enter()
    {
        if(this.quiz_session == undefined)
        {
            return false;
        }

        //다음에 문제낼 퀴즈 꺼내기
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        const quiz_size = quiz_data['quiz_size'];
        let question_num = game_data['question_num'] + 1;
        game_data['question_num'] = question_num;

        if(question_num >= quiz_size) //모든 퀴즈 제출됐음
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
        this.target_question = target_question;

        const question_type = target_question['type'];
        
        try
        {
            if(question_type == QUIZ_TYPE.CUSTOM)
            {
                await this.prepareCustom(target_question);
                //정답 표시 정보도 prepareCustom에서 한번에 한다
            }
            else
            {
                if(question_type == QUIZ_TYPE.SONG || question_type == QUIZ_TYPE.INTRO || question_type == QUIZ_TYPE.SCRIPT)
                {
                    await this.prepareAudio(target_question);
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
    }

    async exit()
    {
        if(this.skip_prepare == true) return;

        if(this.quiz_session.force_stop == true) return;

        let game_data = this.quiz_session.game_data;

        let audio_stream_for_close = game_data['audio_stream_for_close'];
        if(SYSTEM_CONFIG.explicit_close_audio_stream) //오디오 Stream 명시적으로 닫아줄거임
        {
            audio_stream_for_close.push(this.current_audio_streams);
        }
        this.current_audio_streams = [];

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
            this.current_audio_streams.push(audio_stream);
    
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
            const image_resource = target_question['answer_image']
            target_question['answer_image_resource'] = image_resource;
        }
    }

    async prepareAudio(target_question)
    {
        const option_data = this.quiz_session.option_data;
        const game_data = this.quiz_session.game_data;

        const question = target_question['question'];
        let use_random_start = target_question['use_random_start'] ?? true; //노래 어디서부터 시작할 지 랜덤으로 설정 여부
        const ignore_option_audio_play_time = target_question['ignore_option_audio_play_time'] ?? false; //노래 전체 재생 여부

        //오디오 정보 가져오기
        const audio_info = await utility.getAudioInfoFromPath(question); //TODO 상당한 리소스를 먹는 것 같은데 확인필요
        const audio_duration_sec = audio_info.format.duration ?? SYSTEM_CONFIG.max_question_audio_play_time; //duration 없으면 무조건 서버 설정 값 따르게 할거임
        const stats = fs.statSync(question);
        const size_in_bytes = stats.size;
        const bitrate = size_in_bytes / audio_duration_sec * 8;

        //오디오 길이 먼저 넣어주고~
        const audio_play_time_sec = option_data.quiz.audio_play_time / 1000; 
        let audio_length_sec = audio_play_time_sec; 
        if(audio_duration_sec < audio_length_sec) //오디오 길이가 재생할 시간보다 작으면
        {
            audio_length_sec = audio_duration_sec; //그냥 오디오 길이 사용
            use_random_start = false; //랜덤 시작 지점도 사용 불가능
        }
        target_question['audio_length'] = audio_length_sec * 1000;

        let audio_start_point = undefined;
        let audio_end_point = undefined;
        if(ignore_option_audio_play_time == false && use_random_start == true)
        {
            //오디오 자르기 기능
            /**
            오디오 유형을 전부 webm으로 바꿔서 ffmpeg 띄우고 해야함
            **/
            let audio_max_start_point = audio_duration_sec - (audio_length_sec + 2.5);  //우선 이 지점 이후로는 시작 지점이 될 수 없음, +2.5 하는 이유는 padding임
            let audio_min_start_point = 2.5;  //앞에도 2.5초 정도 자르고 싶음

            if(audio_max_start_point > audio_min_start_point) //충분히 재생할 수 있는 start point가 있다면
            {
                if(option_data.quiz.improved_audio_cut == OPTION_TYPE.ENABLED) //최대한 중간 범위로 좁힌다.
                {
                    const audio_length_sec_sec_half = (audio_length_sec / 2);
                    const audio_mid_point = (audio_min_start_point + audio_max_start_point) / 2;
                    const refined_audio_min_start_point = audio_mid_point - audio_length_sec_sec_half;
                    const refined_audio_max_start_point = audio_mid_point + audio_length_sec_sec_half;
    
                    if(audio_min_start_point < refined_audio_min_start_point && refined_audio_max_start_point < audio_max_start_point) //좁히기 성공이면
                    {
                        logger.debug(`Refined audio point, question: ${question} min: ${audio_min_start_point} -> ${refined_audio_min_start_point}, max: ${audio_max_start_point} -> ${refined_audio_max_start_point}`);
                        audio_min_start_point = refined_audio_min_start_point;
                        audio_max_start_point = refined_audio_max_start_point;
                    }
                }

                audio_start_point = parseInt(utility.getRandom(audio_min_start_point, audio_max_start_point)); 
                audio_end_point = parseInt(audio_start_point + audio_length_sec);
            }
        }
        
        //오디오 스트림 미리 생성
        let audio_stream_for_close = game_data['audio_stream_for_close'];
        let audio_stream = undefined;
        let inputType = StreamType.WebmOpus;

        let cut_audio = true;
        if(audio_start_point == undefined) 
        {
            cut_audio = false;
            audio_start_point = 0;
        }
        if(audio_end_point == undefined) audio_end_point = ignore_option_audio_play_time == true ? Infinity : parseInt(audio_start_point + audio_length_sec); //엄격하게 잘라야함

        logger.debug(`cut audio, question: ${question}, point: ${audio_start_point} ~ ${(audio_end_point == Infinity ? 'Infinity' : audio_end_point)}`);

        // const file_audio_stream = fs.createReadStream(question, {flags:'r'});
        // this.current_audio_streams.push(file_audio_stream);
        
        // TODO 우선 성능 상 discordjs/voice 방식 보다 느린 것 같으니 잠시 빼둠
        // if(cut_audio == true) //오디오가 cut 됐을 때만
        // {
        //     let ffmpeg_handler = new ffmpeg(file_audio_stream, {timeout: 10000, })
        //     ffmpeg_handler.format('webm').
        //     setStartTime(audio_start_point).
        //     setDuration(audio_length_sec)
        //     .once('error', function(err, stdout, stderr) { //에러나면 ffmpeg 프로세스 안꺼지는 버그 있음, //TODO 이걸로도 안꺼지면 timeout kill 방식 고려
        //         if(err.message.includes("kill")) return;
        //         logger.error(`Ffmpeg error:  ${err.message}`);
        //     })
        //     .on('end', function() {
        //         ffmpeg_aging_map.delete(ffmpeg_handler);
        //     });     
    
        //     // ffmpeg는 일정 시간 지나도 안꺼지면 강종
        //     ffmpeg_aging_map.set(ffmpeg_handler, Date.now());

        //     audio_stream = ffmpeg_handler.stream();
        // }
        // else
        // {
        //     audio_stream = file_audio_stream;
        // }
        
        // this.current_audio_streams.push(audio_stream); //어차피 ffmpeg handler를 죽일거라 필요없음

        //SeekStream 가져다 쓰는 방식, 열심히 커스텀했다
        //23.11.08 대충 예상컨데 아마 파일은 ReadStream으로만 읽어올 수 있는데 유튜브용 SeekStream을 파일로도 쓸 수 있게 바꿨던 것 같다
        if(cut_audio == true)
        {
            const seek_stream = new SeekStream(
                question,
                (audio_length_sec + 10), //duration, 10는 패딩
                0, //header length 안넘겨도됨
                size_in_bytes,
                bitrate, //TODO BITRATE 정확한 값으로 넘기기
                question,
                {
                    file: true,
                    seek: audio_start_point,
                }
            )
            audio_stream = seek_stream.stream;
            inputType = seek_stream.type;
        }
        else
        {
            audio_stream = fs.createReadStream(question, {flags:'r'});
        }

        this.current_audio_streams.push(audio_stream);

        let resource = undefined;
        // let inputType = StreamType.Arbitrary; //Arbitrary로 해야지 ffmpeg를 edge로 resource를 만든다.


        //미리 Opus로 변환할 수 있게 inputTye 정의해주면 성능면에서 좋다고 함
        //(Discord에서 스트리밍 가능하게 변환해주기 위해 FFMPEG 프로세스가 계속 올라와있는데 Opus 로 변환하면 이 과정이 필요없음)
        resource = createAudioResource(audio_stream, {
            inputType: inputType,
            inlineVolume: SYSTEM_CONFIG.use_inline_volume,
            // seek: parseInt(audio_start_point),
            // to: parseInt(audio_start_point) + parseInt(audio_length_sec), //seekstream 을 사용하니깐 이제 이 옵션 필요없다
        }); //seek하고 to 옵션은 직접 모듈 수정한거다

        if(SYSTEM_CONFIG.use_inline_volume)
        {
            resource.volume.setVolume(0);
        }

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
        target_question['question'] = " \n" + question + " \n"
        const question_type = target_question['type'];
        target_question['is_long'] = ((question_type == QUIZ_TYPE.TEXT_LONG || question_type == QUIZ_TYPE.OX_LONG) ? true : false);
    }

    async prepareCustom(target_question) //TODO 나중에 Dev quiz랑 중복 코드 처리하자...어우 귀찮아
    {
        const option_data = this.quiz_session.option_data;
        const game_data = this.quiz_session.game_data;
        const ipv4 = this.quiz_session.ipv4;
        const ipv6 = this.quiz_session.ipv6;

        const target_question_data = target_question.data;

        /**
         * question_audio_url, 문제용 오디오 url
         * audio_start, 최소 시작 구간
         * audio_end, 최대 재생
         * audio_play_time. 재생 시간
         */
        const question_audio_url = target_question_data['question_audio_url'];
        if(question_audio_url != undefined && question_audio_url !== '' && utility.isValidURL(question_audio_url))
        {
            const question_audio_play_time = target_question_data['audio_play_time'];
            const question_audio_start = target_question_data['audio_start'];
            const question_audio_end = target_question_data['audio_end'];

            const [question_audio_resource, question_audio_play_time_ms, error_message] = 
                await this.getAudioResourceFromWeb(question_audio_url, question_audio_play_time, question_audio_start, question_audio_end, 'question', [ipv4, ipv6]);

            target_question['audio_resource'] = question_audio_resource;
            target_question['audio_length'] = question_audio_play_time_ms;

            if(error_message != undefined)
            {
                target_question['question_text'] += "\n\nAUDIO_ERROR: "+ error_message;
            }
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
        const answer_audio_url = target_question_data['answer_audio_url'];
        if(answer_audio_url != undefined && answer_audio_url !== '' && utility.isValidURL(answer_audio_url))
        {
            const answer_audio_play_time = target_question_data['answer_audio_play_time'];
            const answer_audio_start = target_question_data['answer_audio_start'];
            const answer_audio_end = target_question_data['answer_audio_end'];

            //정답용 오디오가 있다면 0.5초 간격 둔다, 아마도 문제용 오디오 파싱을 위해 유튜브 접속 직후, 정답용 오디오 파싱을 진행하려하면 403 뜨는 것 같다...아마도(문제랑 정답이 같은 url이면 그런가?)
            //우선 같은 url일 때만 한번 1초 대기 적용해보자
            if(answer_audio_url == question_audio_url)
            {
                await utility.sleep(1000);
            }
    
            const [answer_audio_resource, answer_audio_play_time_ms, error_message] = 
                await this.getAudioResourceFromWeb(answer_audio_url, answer_audio_play_time, answer_audio_start, answer_audio_end, 'answer', [ipv4, ipv6]);
    
            target_question['answer_audio_resource'] = answer_audio_resource;
            target_question['answer_audio_play_time'] = answer_audio_play_time_ms;

            if(error_message != undefined)
            {
                target_question['question_text'] += "\n\nAUDIO_ERROR: "+ error_message;
            }
        }
        
        /**
         * answer_image_url, 정답 공개용 이미지 url
         */
        //Initial 할 때 이미 처리됨 target_question_data[''answer_image_url'];

        /**
         * answer_text, 정답 공개용 텍스트
         */
        //Initial 할 때 이미 처리됨 target_question_data['answer_text'];
    }


    /** audio_url_row: 오디오 url, audio_start_row: 오디오 시작 지점(sec), audio_end_row: 오디오 끝 지점(sec), audio_play_time_row: 재생 시간(sec)*/
    async getAudioResourceFromWeb(audio_url_row, audio_play_time_row=undefined, audio_start_row=undefined, audio_end_row=undefined, type='question', ip_info=[]) 
    {
        let error_message;

        if(ytdl.validateURL(audio_url_row) == false)
        {
            logger.warn(`${audio_url_row} is not validateURL`);
            error_message = `${audio_url_row} is not validateURL`;
            return [undefined, undefined, error_message];
        }

        const option_data = this.quiz_session.option_data;

        const max_play_time_sec = (type == 'question' ? SYSTEM_CONFIG.max_question_audio_play_time : SYSTEM_CONFIG.max_answer_audio_play_time); //question->60s, answer->12s

        let audio_resource; //최종 audio_resource
        let audio_length_ms; //최종 audio_length

        //오디오 정보 가져오기
        const [ipv4, ipv6] = ip_info;

        const try_info_list = [];
        if(ipv6 != undefined) //처음엔 ipv6로 시도
        {
            try_info_list.push([ipv6, 6]);
        }

        if(ipv4 != undefined) //그 다음엔 ipv4로 시도
        {
            try_info_list.push([ipv4, 4]);
        }

        try_info_list.push([undefined, undefined]); //다 안되면 마지막엔 그냥 해보기
        logger.debug(`ytdl get info scenario is ${try_info_list.length}`);

        let youtube_info = undefined;
        let available_address;
        let available_family;

        for(let i = 0; i < try_info_list.length; ++i)
        {
            const [ip, family] = try_info_list[i];

            try
            {
                if(ip == undefined || family == undefined)
                {
                    youtube_info = await ytdl.getInfo(audio_url_row);
                }
                else
                {
                    youtube_info = await ytdl.getInfo(audio_url_row, {
                        requestOptions:
                        {
                            localAddress: ip,
                            family: family
                        }
                    });
                }

                if(youtube_info != undefined)
                {
                    available_address = ip,
                    available_family = family;

                    if(i != 0) //첫 시나리오에서 성공한게 아니면 failover가 잘 동작했으니 로그 하나 찍어주자
                    {
                        logger.warn(`Succeed Failover Scenario${i} of ytdl.getInfo! Available ipv${available_family}...${available_address}`);
                    }

                    break; //성공했다면
                }
            }
            catch(err)
            {
                logger.warn(`Failed ytdl.getInfo... Using ipv${family}...${ip} err_message: ${err.message}, url: ${audio_url_row}`);

                if(i == try_info_list.length - 1) //마지막 시도였다면
                {
                    logger.error(`Failed ytdl.getInfo... for all scenario throwing...`);
                    throw err;
                }
            }  
        }

        const audio_format = ytdl.chooseFormat(youtube_info.formats, { 
            filter: 'audioonly', 
            quality: 'lowestaudio' 
        }); //connReset 에러가 빈번히 발생하여 우선 구글링한 해법을 적용해본다. https://blog.huzy.net/308 -> 24.02.02 해결책은 아니었다.

        if(audio_format == undefined) 
        {
            logger.error(`cannot found audio format from ${youtube_info}`);
            error_message = `cannot found audio format from ${youtube_info}`;
            return [undefined, undefined, error_message];
        }

        const audio_duration_ms = audio_format.approxDurationMs;
        const audio_duration_sec = Math.floor((audio_duration_ms ?? 0) / 1000);
        const audio_size = audio_format.contentLength;
        const audio_bitrate = audio_format.averageBitrate;
        const audio_byterate = audio_bitrate / 8;

        if(audio_duration_sec > SYSTEM_CONFIG.custom_audio_ytdl_max_length) //영상 최대 길이 제한, 영상이 너무 길고 seek 지점이 영상 중후반일 경우 로드하는데 너무 오래 걸림
        {
            logger.warn(`${audio_url_row}'s duration[${audio_duration_sec}] is over then ${SYSTEM_CONFIG.custom_audio_ytdl_max_length}`);
            error_message = `${audio_url_row}'s 오디오 길이(${audio_duration_sec}초)가 ${SYSTEM_CONFIG.custom_audio_ytdl_max_length}를 초과합니다.`;
            return [undefined, undefined, error_message];
        }

        //최종 재생 길이 구하기, 구간 지정했으면 그래도 재생할 수 있는 최대치는 재생해줄거임
        let audio_length_sec = (audio_play_time_row ?? 0) <= 0 ? Math.floor(option_data.quiz.audio_play_time / 1000) : audio_play_time_row; //얼만큼 재생할지

        if(audio_start_row == undefined || audio_start_row >= audio_duration_sec) //시작 요청 값 없거나, 시작 요청 구간이 오디오 범위 넘어서면
        {
            audio_start_row = undefined; //구간 요청값 무시
            audio_end_row = undefined;
        }
        else
        {
            if(audio_end_row == undefined || audio_end_row > audio_duration_sec) //끝 요청 값 없거나, 오디오 길이 초과화면 자동으로 최대치
            {
                audio_end_row = audio_duration_sec;
            }

            audio_length_sec = audio_end_row - audio_start_row; //우선 딱 구간만큼만 재생
        }

        if(audio_length_sec > audio_duration_sec) 
        {
            audio_length_sec = audio_duration_sec; //오디오 길이보다 더 재생할 순 없다.
        }

        if(audio_length_sec > max_play_time_sec) 
        {
            audio_length_sec = max_play_time_sec; //최대치를 넘어설 순 없다
        }

        audio_length_ms = audio_length_sec * 1000;


        //오디오 시작 지점이 될 수 있는 포인트 범위
        const audio_min_start_point_sec = audio_start_row ?? 0;
        const audio_max_start_point_sec = (audio_end_row ?? Math.floor(audio_duration_ms/1000)) - audio_length_sec;

        let audio_final_min_start_point_sec = audio_min_start_point_sec;
        let audio_final_max_start_point_sec = audio_max_start_point_sec;

        let audio_start_point = audio_min_start_point_sec;

        //오디오 자르기 기능
        if(audio_max_start_point_sec - audio_min_start_point_sec > audio_length_sec) //충분히 재생할 수 있는 구간이 지정돼 있어서 오디오 랜덤 구간 재생이 필요하다면
        {
            if(option_data.quiz.improved_audio_cut == OPTION_TYPE.ENABLED) //옵션 켜져있다면 최대한 중간 범위로 좁힌다.
            {
                const audio_mid_point_sec = Math.floor(audio_min_start_point_sec + (audio_max_start_point_sec - audio_min_start_point_sec) / 2); //두 지점의 중앙 포인트

                //중앙 포인트 부터 audio_length_sec 의 절반씩
                const audio_guess_min_start_point_sec = audio_mid_point_sec - Math.floor(audio_length_sec/2) + 1; //1s는 패딩
                const audio_guess_max_start_point_sec = audio_mid_point_sec + Math.floor(audio_length_sec/2) + 1;

                if(audio_min_start_point_sec <= audio_guess_min_start_point_sec && audio_guess_max_start_point_sec <= audio_max_start_point_sec) //좁히기 성공이면
                {
                    audio_final_min_start_point_sec = audio_guess_min_start_point_sec;
                    audio_final_max_start_point_sec = audio_guess_max_start_point_sec;
                    logger.debug(`Refined audio point, question: ${audio_url_row} min: ${audio_min_start_point_sec} -> ${audio_final_min_start_point_sec}, max: ${audio_max_start_point_sec} -> ${audio_final_max_start_point_sec}`);
                }
            }

            audio_start_point = utility.getRandom(audio_final_min_start_point_sec, audio_final_max_start_point_sec)  //second
        }
        
        //이건 왜 안쓰지? 아놔 진짜 기억 안나네 아마 ffmpeg 프로세스 실행돼서 그럴듯
        // audio_stream = ytdl.downloadFromInfo(youtube_info, { format: audio_format, range: {start: audio_start_point, end: audio_end_point} }); 
        
        logger.debug(`cut audio, ${type}: ${audio_url_row}, point: ${audio_start_point} ~ ${(audio_start_point + audio_length_sec)}`);

        const download_option = {
            format: audio_format ,
            opusEncoded: true,
            // encoderArgs: ['-af', 'bass=g=10,dynaudnorm=f=200', `-to ${audio_end_point}`, `-fs ${10 * 1024 * 1024}`],

            //10초 패딩 줬다, 패딩 안주면 재생할 시간보다 Stream이 짧아지면 EPIPE 에러 뜰 수 있음, -t 옵션은 duration임 (sec)
            //패딩 주는 이유? ytdl core는 ffmpeg로 동작하는데 stream 데이터 읽어서 ffmpeg로 오디오 처리하고 pipe로 전달한다. 근데 pipe에서 read하는 ffmpeg 먼저 끝나면 읽지를 못해서 에러나지
            encoderArgs: ['-af', 'bass=g=10,dynaudnorm=f=200', '-t', `${audio_length_sec + 10}`], 
            seek: audio_start_point, 

            dlChunkSize: 0, //disabling chunking is recommended in discord bot
            bitrate: 128, //max bitrate for discord bot, (부스트 없는 서버 기준),
            highWaterMark: AUDIO_BUFFER_SIZE //오디오 버퍼 사이즈(이게 connReset의 원인일까...?)
        };

        if(available_address != undefined && available_family != undefined) //잘 되는 ip 정보가 있다면
        {
            download_option['requestOptions'] = {
                localAddress: available_address,
                family: available_family
            };

            logger.debug(`found available address info!!! ${available_family}, ${available_address}`);
        };

        let audio_stream = ytdl(audio_url_row, download_option);

         /** 
        23.11.08 확인 결과 
        -to 옵션이 안먹는다...
        -> (`-to ${audio_length}`) 에서 ('-t', `${audio_length}`) 로 하니깐 된다.

        23.11.15 
        ytdl-core 를 업데이트했더니 getInfo가 안된다.
        ytdl-core 를 원래 쓰던 버전인 4.9.1로 롤백했다(이후 버전은 버그가 많음)

        23.11.16
        ytdl-core 4.9.1 버전은 youtube 데이터 다운로드가 매우매우 느린 문제가 있다.
        따라서 다시 최신 버전으로 업데이트 후, 아래의 이슈 확인하여 sig.js를 패치하였다.
        https://github.com/fent/node-ytdl-core/issues/1250#issuecomment-1712550800 

        getInfo 정상 동작 및 4.9.1 보다 youtube 데이터 다운로드 속도도 빠른걸 확인함
        **/

        /**
         * 시도해 볼만한 방법들
         * 1. MP3는 잘라도 재생이 잘 된다. MP3는 Discord에서 어떻게 변환하는지 확인하고 Webm과 차이점을 확인
         * 2. 오디오를 전부 받고, Create Resource를 해준다. 그 다음 start_point를 지정한다.
         * ㄴ start_point를 지정할 수 있는지도 불확실하고 성능면에서 비효율적이다.
         * 3. 이미 Webm/opus 타입이다. inline 볼륨 꺼보고 해보자
         * 4. discord-ytdl-core 라는게 있다. 좀 옛날거라 지금은 안될텐데 참고는 해보자
         * 5. 정상적으로 돌아갈 때랑 잘렸을 때 edge 상태 확인
         * 6. https://www.npmjs.com/package/discord-ytdl-core?activeTab=explore, 이건 discord-ytdl-core 의 소스코드다
         * 확인해보면 ytdl 로 받은걸 ffmpeg 를 직접 만들고 실행하는걸 볼 수 있다. 이 중 seek 옵션이 있는데, 이게 시작 위치(second)이고 -t 옵션으로 duration, -to 옵션으로 ~~까지를 설정할 수 있다
         * https://github.com/skdhg/discord-ytdl-core/issues/17
         * 이게 되면 veryvery thank u T.T, => 6번으로 해결했다!!!!
         */

        audio_resource = createAudioResource(audio_stream, { //Opus로 실행해주면 된다.
            inputType: StreamType.Opus,
            inlineVolume: SYSTEM_CONFIG.use_inline_volume,
        });

        if(SYSTEM_CONFIG.use_inline_volume)
        {
            // resource.volume.setVolume(0);
        }
        
        return [audio_resource, audio_length_ms, undefined];
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

        this.is_select_question = false; //객관식 퀴즈 여부
        this.selected_answer_map = undefined; //객관식 퀴즈에서 각자 선택한 답안

        this.hint_voted_user_list = []; //힌트 투표 이미했는지 확인
        this.skip_voted_user_list = []; //스킵 투표 이미했는지 확인
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

        this.is_select_question = false; //객관식 퀴즈 여부
        this.selected_answer_map = undefined; //객관식 퀴즈에서 각자 선택한 답안

        this.hint_voted_user_list = []; //힌트 투표 이미했는지 확인
        this.skip_voted_user_list = []; //스킵 투표 이미했는지 확인

        if(game_data['question_num'] >= quiz_data['quiz_size']) //모든 퀴즈 제출됐음
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
        const essential_term = Date.now() + 3000; //최소 문제 제출까지 3초간의 텀은 주자

        //아직 prepared queue에 아무것도 없다면
        let current_check_prepared_queue = 0;
        const max_try = SYSTEM_CONFIG.max_check_prepared_queue;
        const check_interval = SYSTEM_CONFIG.prepared_queue_check_interval
        // const max_try = 40; //고정값으로 테스트해보자
        while(game_data.prepared_question_queue.length == 0)
        {
            if(this.quiz_session.force_stop == true) return false;

            if(++current_check_prepared_queue >= max_try) //최대 체크 횟수 초과 시
            {
                this.next_cycle = CYCLE_TYPE.CLEARING; 
                logger.error(`Prepared Queue is Empty, tried ${current_check_prepared_queue} * ${check_interval}..., going to CLEARING cycle, guild_id: ${this.quiz_session.guild_id}`);
                this.quiz_session.channel.send({content: `예기치 않은 문제로 오디오 리소스 초기화에 실패했습니다...\n퀴즈가 강제 종료됩니다...\n서버 메모리 부족, 네트워크 연결 등의 문제일 수 있습니다.`});

                const memoryUsage = process.memoryUsage();
                logger.error('Memory Usage:', {
                    'Heap Used': `${memoryUsage.heapUsed / 1024 / 1024} MB`,
                    'Heap Total': `${memoryUsage.heapTotal / 1024 / 1024} MB`,
                    'RSS': `${memoryUsage.rss / 1024 / 1024} MB`,
                    'External': `${memoryUsage.external / 1024 / 1024} MB`,
                });

                return false;
            }

            await utility.sleep(check_interval);
            // await utility.sleep(500); //고정값으로 테스트 해보자
        }
        
        this.current_question = game_data.prepared_question_queue.shift(); //하나 꺼내오자
        

        //이제 문제 준비가 끝났다. 마지막으로 최소 텀 지키고 ㄱㄱ
        const left_term = essential_term - Date.now();
        if(left_term < 0) 
        {
            return;
        }
        await new Promise((resolve, reject) => {
            setTimeout(() => {
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
        }
        let description_message = text_contents.quiz_play_ui.description;
        description_message = description_message.replace("${quiz_question_num}", `${(game_data['question_num']+1)}`);
        quiz_ui.embed.description = description_message;

        let components = [quiz_ui.quiz_play_comp];
        if(quiz_type == QUIZ_TYPE.OX || quiz_type == QUIZ_TYPE.OX_LONG) //ox 퀴즈면
        {
            components.push(quiz_ui.ox_quiz_comp);
        }
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

        const progress_bar_timer = setInterval(() => {

            ++progress_percentage

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
    async submittedCorrectAnswer(member)
    {
        const option_data = this.quiz_session.option_data;

        if(this.current_question['answer_members'] != undefined) //이미 맞춘사람 있다면 패스
        {
            return;
        }

        if(this.timeover_timer != undefined)
        {
            this.current_question['answer_members'] = [ member ];

            await this.stopTimeoverTimer(); //맞췄으니 타임오버 타이머 중지!

            let score = 1;
            if(option_data.quiz.score_type == OPTION_TYPE.SCORE_TYPE.TIME) //남은 시간 비례 가산점 방식이면
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

            let scoreboard = this.quiz_session.scoreboard;
            scoreboard.set(member, (scoreboard.get(member) ?? 0) + score);
        }
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
        const hint_timer = setTimeout(() => {
            this.showHint(this.current_question); //현재 퀴즈 hint 표시
        }, hint_timer_wait);
        this.hint_timer = hint_timer;
    }

    //정답 대기 타이머 생성 및 지연 시작
    async createWaitForAnswerTimer(delay_time, wait_time, bgm_type)
    {
        this.wait_for_answer_timer = setTimeout(async () => {

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
        const timeover_promise = new Promise(async (resolve, reject) => {

            this.timeover_resolve = resolve; //정답 맞췄을 시, 이 resolve를 호출해서 promise 취소할거임
            this.timeover_timer = await setTimeout(async () => {

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
                    this.current_question['fade_out_timer'] = setTimeout(() => {
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

    onMessageCreate(message)
    {
        const option_data = this.quiz_session.option_data;

        if(message.author == bot_client.user) return;

        if(option_data.quiz.use_message_intent == OPTION_TYPE.DISABLED) return; //Message Intent 안쓴다면 return

        if(message.channel != this.quiz_session.channel) return; //퀴즈 진행 중인 채널 아니면 return

        if(this.timeover_timer_created == undefined) return; //아직 timeover 시작도 안했다면 return

        if(this.is_select_question == true) return; //객관식 퀴즈면 pass

        let submit_answer = message.content ?? '';
        if(submit_answer == '') return;
        submit_answer = submit_answer.trim().replace(/ /g, '').toLowerCase();
        
        if(this.answers.includes(submit_answer))
        {
            this.submittedCorrectAnswer(message.member);
            // let result_message = "```" + `${message.member.displayName}: [ ${submit_answer} ]... 정답입니다!` + "```"
            // message.reply({content: result_message})
            // .catch(err => {
            //     logger.error(`Failed to replay to correct submit, guild_id:${this.quiz_session.guild_id}, err: ${err.stack}`);
            // });
            return;
        }

        if(submit_answer === 'ㅎ')
        {
            this.requestHint(message.author);
        }

        if(submit_answer === 'ㅅ')
        {
            this.requestSkip(message.author);
        }
    }

    async handleChatInputCommand(interaction)
    {
        if(interaction.commandName === '답') {

            if(this.timeover_timer_created == undefined) return; //아직 timeover 시작도 안했다면 return

            if(this.is_select_question == true) return; // 객관식 퀴즈면 pass 
    
            let submit_answer = interaction.options.getString('답안') ?? '';
            if(submit_answer == '') return;
            submit_answer = submit_answer.trim().replace(/ /g, '').toLowerCase();
            
            if(this.answers.includes(submit_answer))
            {
                this.submittedCorrectAnswer(interaction.member);
                let message = "```" + `${interaction.member.displayName}: [ ${submit_answer} ]... 정답입니다!` + "```"
                interaction.reply({content: message})
                .catch(err => {
                    logger.error(`Failed to replay to correct submit, guild_id:${this.quiz_session.guild_id}, err: ${err.stack}`);
                });
            }
            else
            {
                let message = "```" + `${interaction.member.displayName}: [ ${submit_answer} ]... 오답입니다!` + "```"
                interaction.reply({content: message})
                .catch(error => {
                    logger.error(`Failed to replay to wrong submit, guild_id:${this.quiz_session.guild_id}, err: ${err.stack}`);
                });;
            }
        
            return;
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

        if(this.is_select_question == true) //객관식 퀴즈일 경우
        {
            const selected_value = interaction.customId;
            const member = interaction.member

            if(this.selected_answer_map == undefined) 
            {
                this.selected_answer_map = new Map();
            }
            this.selected_answer_map.set(member, selected_value);
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
        const member_id = member.id;
        if(this.hint_voted_user_list.includes(member_id))
        {
            return;
        }

        this.hint_voted_user_list.push(member_id);

        if(option_data.quiz.hint_type == OPTION_TYPE.HINT_TYPE.OWNER) //주최자만 hint 사용 가능하면
        {
            if(member_id == this.quiz_session.owner.id)
            {
                this.showHint(current_question);
                return;
            }
            const reject_message = '```' + `${text_contents.quiz_play_ui.only_owner_can_use_hint}` +'```'
            this.quiz_session.channel.send({content: reject_message});
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
            this.quiz_session.channel.send({content: hint_vote_message});
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

        const member_id = member.id;
        if(this.skip_voted_user_list.includes(member_id))
        {
            return;
        }

        this.skip_voted_user_list.push(member_id);

        if(option_data.quiz.skip_type == OPTION_TYPE.SKIP_TYPE.OWNER) //주최자만 skip 사용 가능하면
        {
            if(member_id == this.quiz_session.owner.id)
            {
                this.skip(this.current_question);
                return;
            }
            const reject_message = '```' + `${text_contents.quiz_play_ui.only_owner_can_use_skip}` +'```'
            this.quiz_session.channel.send({content: reject_message});
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
            this.quiz_session.channel.send({content: skip_vote_message});

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
            if(this.current_question['answer_members'] != undefined) //정답자가 있다?
            {
                this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
            }
            else if(this.current_question['skip_used'] == true) //스킵이다?
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

            if(this.current_question['answer_members'] != undefined) //정답자가 있다?
            {
                this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
            }
            else if(this.current_question['skip_used'] == true) //스킵이다?
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
            if(this.current_question['answer_members'] != undefined) //정답자가 있다?
            {
                this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
            }
            else if(this.current_question['skip_used'] == true) //스킵이다?
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

            if(this.current_question['answer_members'] != undefined) //정답자가 있다?
            {
                this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
            }
            else if(this.current_question['skip_used'] == true) //스킵이다?
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

        this.is_select_question = true; //객관식 퀴즈라고 알림

        this.answers = current_question['answers'];
        const question = current_question['question'];

        logger.info(`Questioning Text, guild_id:${this.quiz_session.guild_id}, question_num: ${game_data['question_num']+1}/${quiz_data['quiz_size']}, question: ${question.trim()}`);

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
        else //타임오버거나 정답자 없다면
        {
            this.next_cycle = CYCLE_TYPE.TIMEOVER; //우선 타임오버로
            
            const selected_answer_map = this.selected_answer_map;
            if(selected_answer_map != undefined)
            {
                const iter = selected_answer_map.entries();
                let scoreboard = this.quiz_session.scoreboard;
                const score = 1; //객관식은 1점 고정
    
                for(let i = 0; i < selected_answer_map.size; ++i)
                {
                    const [member, selected_value] = iter.next().value;
                    
                    if(this.answers.includes(selected_value)) //정답 맞춘 사람 1명이라도 있으면 CorrectAnswer
                    {
                        this.next_cycle = CYCLE_TYPE.CORRECTANSWER;
    
                        scoreboard.set(member, (scoreboard.get(member) ?? 0) + score); //객관식은 타임오버일 때, 점수 계산
    
                        const answer_members = current_question['answer_members'];
                        if(answer_members == undefined)
                        {
                            current_question['answer_members'] = [ member ];
                        }
                        else
                        {
                            answer_members.push(member);
                        }
                    }
                }
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

        logger.info(`Questioning Custom, guild_id:${this.quiz_session.guild_id}, question_num: ${game_data['question_num']+1}/${quiz_data['quiz_size']}, question_id: ${question_id}`);

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

        if(audio_play_time != 0) //오디오 재생해야하면
        {
            this.is_playing_bgm = false;
            this.startAudio(audio_player, resource)
            .then((result) => fade_in_end_time = result); //비동기로 오디오 재생 시켜주고
            this.autoFadeOut(audio_player, resource, audio_play_time); //audio_play_time으로 자동 페이드 아웃 체크
        }
        else //오디오 없으면 10초 타이머로 대체
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
            if(this.current_question['answer_members'] != undefined) //정답자가 있다?
            {
                this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
            }
            else if(this.current_question['skip_used'] == true) //스킵이다?
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
        channel.send({content: text_contents.quiz_play_ui.unknown_quiz_type})
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
            answers.forEach((answer) => {
                answer_list_message += answer + "\n";
            });
        }

        let author_list_message = '';
        const author_list = processing_question['author'] ?? [];
        if(author_list.length > 0)
        {
            author_list.forEach((author) => {
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

        const is_last_question = game_data['question_num'] >= quiz_data['quiz_size'];
        if(is_last_question)
        {
            quiz_ui.embed.footer =  {
                "text": text_contents.timeover_ui.footer_for_end
            }
        }
        else
        {
            quiz_ui.embed.footer = {
                "text": text_contents.timeover_ui.footer_for_continue
            }
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
        let answer_members_nickname = "???";
        if(answer_members != undefined)
        {
            if(answer_members.length > 1)
            {
                answer_members_nickname = "\n";
            }

            answer_members.forEach(member => 
            {
                answer_members_nickname =  `[ ${member.displayName} ]\n`;
            });
        }

        let quiz_ui = this.quiz_session.quiz_ui;

        quiz_ui.embed.color = 0x54B435;

        quiz_ui.embed.title = text_contents.correct_answer_ui.title;

        let answer_list_message = '';
        const answers = processing_question['answers'] ?? [];
        answers.forEach((answer) => {
            answer_list_message += answer + "\n";
        });

        let author_list_message = '';
        const author_list = processing_question['author'] ?? [];
        author_list.forEach((author) => {
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

        const is_last_question = game_data['question_num'] >= quiz_data['quiz_size'];
        if(is_last_question)
        {
            quiz_ui.embed.footer =  {
                "text": text_contents.correct_answer_ui.footer_for_end
            }
        }
        else
        {
            quiz_ui.embed.footer = {
                "text": text_contents.correct_answer_ui.footer_for_continue
            }
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
                used_stream.forEach((audio_stream) => {
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

        if(game_data['question_num'] >= quiz_data['quiz_size']) //모든 퀴즈 제출됐음
        {
            this.next_cycle = CYCLE_TYPE.ENDING;
            logger.info(`All Question Submitted on Clearing, guild_id:${this.quiz_session.guild_id}`);
            return; //더 이상 진행할 게 없다.
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
        const quiz_type = ['quiz_type'];
        let quiz_ui = this.quiz_session.quiz_ui;

        quiz_ui.embed.color = 0xFED049,

        quiz_ui.embed.title = text_contents.ending_ui.title;
        quiz_ui.embed.description = `${quiz_data['icon']} ${quiz_data['title']}\n \n \n`;
        quiz_ui.embed.footer = undefined //footer 없앰

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
            scoreboard = utility.sortMapByValue(scoreboard); //정렬 해주고
            let iter = scoreboard.entries();
            
            let winner_member = undefined;
            for(let i = 0; i < scoreboard.size; ++i)
            {
                const [member, score] = iter.next().value;

                let medal = '🧐';
                switch(i)
                {
                    case 0: {
                        winner_member = member;
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
                quiz_ui.embed.description += `${medal} ${member.displayName}    ${score}${text_contents.scoreboard.point_name}\n`;
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
            let top_score_description_message = text_contents.ending_ui.winner_user_message;
            top_score_description_message = top_score_description_message.replace('${winner_nickname}', quiz_data['winner_nickname']);
            top_score_description_message = top_score_description_message.replace('${winner_username}', winner_member.displayName);
            quiz_ui.embed.description += top_score_description_message;
        }
        
        utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.ENDING);
        quiz_ui.update();
        await utility.sleep(SYSTEM_CONFIG.ending_wait); 

        logger.info(`End Quiz Session, guild_id:${this.quiz_session.guild_id}`);
    }
}

//#endregion

//#region Finish Cycle
/** Quiz session 종료 **/
class Finish extends QuizLifecycle
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
            try{
                voice_connection.destroy();
            }catch(error){

            }
        }
    }

    async exit()
    {
        const guild_id = this.quiz_session.guild_id;
        
        const quiz_session = quiz_session_map[guild_id];
        quiz_session.free();

        delete quiz_session_map[guild_id];
    }
}
//#endregion
