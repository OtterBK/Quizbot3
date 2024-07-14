'use strict';

//voice 용으로 libsodium-wrapper 를 쓸 것! sodium 으로 하면 cpu 사용량 장난아님;;

//#region 외부 모듈 로드
const fs = require('fs');
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, RESTJSONErrorCodes, TeamMemberMembershipState } = require('discord.js');
const pathToFfmpeg = require('ffmpeg-static');
process.env.FFMPEG_PATH = pathToFfmpeg;
//#endregion

//#region 로컬 모듈 로드
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE, EXPLAIN_TYPE, BGM_TYPE, QUIZ_MAKER_TYPE } = require('../../config/system_setting.js');
const option_system = require("../quiz_option/quiz_option.js");
const OPTION_TYPE = option_system.OPTION_TYPE;
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const utility = require('../../utility/utility.js');
const logger = require('../../utility/logger.js')('QuizSystem');
const { SeekStream } = require('../../utility/SeekStream/SeekStream.js');
const feedback_manager = require('../managers/feedback_manager.js');
const { loadQuestionListFromDBByTags } = require('../managers/user_quiz_info_manager.js');
const tagged_dev_quiz_manager = require('../managers/tagged_dev_quiz_manager.js');
const audio_cache_manager = require('../managers/audio_cache_manager.js');


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

        this.already_liked = true; //이미 like 버튼 눌렀는지 여부. 기본 true 깔고 initializeCustom에서만 false 또는 true 다시 정함

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

        this.already_liked = null;

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

    sendMessage(message)
    {
        this.channel.send(message);
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

            if(event_object.isButton() && this.quiz_session.already_liked == false && event_object.customId == 'like') //추천하기 버튼 눌렀을 때
            {
                const interaction = event_object;
                const quiz_info = this.quiz_session.quiz_info;

                feedback_manager.addQuizLikeAuto(interaction, quiz_info.quiz_id, quiz_info.title);
                // this.quiz_session.already_liked = true; //유저별 추천 가능이라 무조건 계속 띄우게 변경

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
    generateAnswers(answers_row)
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
    generateHint(base_answer)
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

        Object.keys(question_row).forEach((key) => {
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
            question['hint'] = this.generateHint(answers[0]) //힌트 없으면 알아서 만들기
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
        question_file_list.forEach(question_folder_filename => { 
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
        quiz_folder_list.forEach(question_folder_name => {

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
        
        question_row_list.forEach((question_row) => {

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
            await this.OmakaseQuizInitialize();
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
        const dev_quiz_tags = quiz_info['dev_quiz_tags']; //오마카세 퀴즈는 quiz_tags 가 있다.
        const custom_quiz_type_tags = quiz_info['custom_quiz_type_tags']; //오마카세 퀴즈는 quiz_type_tags 가 있다.
        const custom_quiz_tags = quiz_info['custom_quiz_tags']; //오마카세 퀴즈는 quiz_tags 도 있다.
        const selected_question_count = quiz_info['selected_question_count']; //최대 문제 개수도 있다.
        
        const limit = selected_question_count * 2; //question prepare 에서 오류 발생 시, failover 용으로 넉넉하게 2배 잡는다.

        //무작위로 question들 뽑아내자. 각각 넉넉하게 limit 만큼 뽑는다.
        const [total_dev_question_count, dev_question_list] = tagged_dev_quiz_manager.getQuestionListByTags(dev_quiz_tags, limit);
        const [total_custom_question_count, custom_question_list] = await loadQuestionListFromDBByTags(custom_quiz_type_tags, custom_quiz_tags, limit);

        //각각 문제 수 비율로 limit을 나눠 가진다.
        const total_all_question_count = total_dev_question_count + total_custom_question_count; //둘 합치고
        const dev_quiz_count = Math.round(total_dev_question_count / total_all_question_count * limit);
        const custom_quiz_count = Math.round(total_custom_question_count / total_all_question_count * limit);

        logger.info(`Omakase Question count of this session. dev=${dev_quiz_count}, custom=${custom_quiz_count}, limit=${limit}`);
        
        //좀 더 세부적으로 섞어야할 것 같은데...너무 귀찮다 우선 걍 이렇게 ㄱㄱ하자

        //build dev questions 
        dev_question_list.slice(0, dev_quiz_count).forEach(question_row => {
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
        custom_question_list.slice(0, custom_quiz_count).forEach((question_row) => {

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

        if(question_num >= quiz_size 
			|| quiz_data['question_list'].length == 0) //모든 퀴즈 제출됐음
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
            const image_resource = target_question['answer_image']
            target_question['answer_image_resource'] = image_resource;
        }
    }

    /** 오디오 파일 경로와, 오디오 파일의 전체 재싱길이, 시작 지점을 기준으로 스트림 반환 */
    generateAudioFileStream(audio_path, audio_duration, audio_start_point, audio_length)
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
    
        if (audio_start_point != undefined && audio_start_point !== 0) {

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
                    seek: parseInt(audio_start_point),
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
    
    generateAudioResource(audio_stream, inputType) {
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
        
        const [audio_stream, inputType] = this.generateAudioFileStream(question, audio_duration_sec, audio_start_point, audio_length_sec);
        const resource = this.generateAudioResource(audio_stream, inputType);
        
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
    
        const [question_audio_resource, question_audio_play_time_ms, question_error_message] = 
            await this.generateAudioResourceFromWeb(
                question_audio_url, 
                audio_start, 
                audio_end, 
                SYSTEM_CONFIG.max_question_audio_play_time, 
                [ipv4, ipv6]
            );
    
        target_question['audio_resource'] = question_audio_resource;
        target_question['audio_length'] = question_audio_play_time_ms;
    
        if (question_error_message) {
            target_question['question_text'] += `\n\nAUDIO_ERROR: ${question_error_message}`;
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

        const { answer_audio_play_time, answer_audio_start, answer_audio_end } = target_question_data;
    
        const [answer_audio_resource, answer_audio_play_time_ms, answer_error_message] = 
            await this.generateAudioResourceFromWeb(
                answer_audio_url, 
                answer_audio_start, 
                answer_audio_end, 
                SYSTEM_CONFIG.max_answer_audio_play_time, 
                [ipv4, ipv6]
            );
    
        target_question['answer_audio_resource'] = answer_audio_resource;
        target_question['answer_audio_play_time'] = answer_audio_play_time_ms;
    
        if (answer_error_message) {
            target_question['author'].push(`\n\nAUDIO_ERROR: ${answer_error_message}`);
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

     /** audio_url_row: 오디오 url, audio_start_point: 오디오 시작 지점(sec), audio_end_point: 오디오 끝 지점(sec), audio_play_time_point: 재생 시간(sec)*/
    async generateAudioResourceFromWeb(audio_url, audio_start_point=undefined, audio_end_point=undefined,  max_play_time=undefined) 
    {
        if(audio_url == undefined)
        {
            return [undefined, undefined, undefined];
        }

        let error_message;

        const video_id = utility.extractYoutubeVideoID(audio_url);
        if(video_id == undefined)
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
            
            this.quiz_session.sendMessage({content: `해당 오디오에 대한 캐시가 없어 다운로드 중입니다...\n시간이 좀 걸리 수 있습니다. ㅜㅜ 😥`});

            const ip_info = {
                ipv4: this.quiz_session.ipv4,    
                ipv6: this.quiz_session.ipv6,
            }
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
        const audio_duration_sec = audio_info.duration ?? 0;

        if(audio_duration_sec == undefined)
        {
            logger.warn(`no audio duration by getAudioCacheDuration. ${cache_file_name}`);
            const audio_info =  await utility.getAudioInfoFromPath(question);
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

        const [audio_stream, inputType] = this.generateAudioFileStream(cache_file_path, audio_duration_sec, audio_start_point, audio_length_sec);
        const resource = this.generateAudioResource(audio_stream, inputType);
        
        return [resource, audio_length_sec * 1000, undefined];
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
                this.quiz_session.sendMessage({content: `예기치 않은 문제로 오디오 리소스 초기화에 실패했습니다...\n퀴즈가 강제 종료됩니다...\n서버 메모리 부족, 네트워크 연결 등의 문제일 수 있습니다.`});

                const memoryUsage = process.memoryUsage();
                logger.error('Memory Usage:', JSON.stringify({
                    'Heap Used': `${memoryUsage.heapUsed / 1024 / 1024} MB`,
                    'Heap Total': `${memoryUsage.heapTotal / 1024 / 1024} MB`,
                    'RSS': `${memoryUsage.rss / 1024 / 1024} MB`,
                    'External': `${memoryUsage.external / 1024 / 1024} MB`,
                }));

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
        logger.info(`Questioning Omakase, guild_id:${this.quiz_session.guild_id}, question_num: ${question_num + 1}/${quiz_size}, question_id: ${question_id ?? current_question['question']}`);

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
            this.next_cycle = CYCLE_TYPE.QUESTIONING;
            game_data['question_num'] -= 1;
            utility.playBGM(audio_player, BGM_TYPE.FAILOVER); //failover용 브금(오디오 다운로드할 시간 벌기)
            await utility.sleep(11000); //Failover 브금 11초임 

            let error_message = '```';
            error_message += `❗ 문제 제출 중 오디오 에러가 발생하여 다른 문제로 다시 제출합니다. 잠시만 기다려주세요.\n에러 메시지: `;
            error_message += this.progress_bar_fixed_text?.trim();
            error_message += '```';

            this.quiz_session.sendMessage({content: error_message});
            
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
