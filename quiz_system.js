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
const { SeekStream } = require('play-dl');
//#endregion

//#region 로컬 모듈 로드
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE, EXPLAIN_TYPE, BGM_TYPE, QUIZ_MAKER_TYPE } = require('./system_setting.js');
const option_system = require("./quiz_option.js");
const OPTION_TYPE = option_system.OPTION_TYPE;
const text_contents = require('./text_contents.json')[SYSTEM_CONFIG.language]; 
const utility = require('./utility.js');
const logger = require('./logger.js')('QuizSystem');
const db_manager = require('./db_manager.js');

//#endregion

//#region Cycle 타입 정의
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

    if(image_resource == undefined) return;

    if(image_resource.includes(SYSTEM_CONFIG.dev_quiz_path) == true) //dev path 포함하면 로컬 이미지 취급
    {
        const file_name = image_resource.split('/').pop(); 
        this.files = [ { attachment: image_resource, name: file_name } ];
        this.embed.image = { url: "attachment://" + file_name };
    }
    else
    {
        this.embed.image = {
            url: image_resource,
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
        if(err.code === RESTJSONErrorCodes.UnknownChannel)
        {
            const guild_id = this.channel.guild.id;
            const quiz_session = exports.getQuizSession(guild.id);
            logger.info(`Unknown channel for ${this.channel.id}, guild_id: ${guild_id}`);
            if(quiz_session != undefined)
            {
                quiz_session.forceStop();
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

        this.guild = undefined;
        this.owner = undefined;
        this.channel = undefined;
        this.quiz_info = undefined;
        this.voice_channel = undefined;

        this.quiz_ui = undefined; //직접 새로 UI만들자

        this.voice_connection = undefined;
        this.audio_player = undefined;

        this.lifecycle_map = {};

        this.quiz_data = undefined; //얘는 처음 initialize 후 바뀌지 않는다.
        this.game_data = undefined; //얘는 자주 바뀐다.
        this.option_data = undefined; //옵션

        this.scoreboard = undefined; //scoreboard 

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
        if(this.lifecycle_map.hasOwnProperty(cycle_type) == false)
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
        this.quiz_session = undefined;
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
                resource.volume.volume = 1.0;
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
                    value: '\u1CBC\n',
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
    applyAnswerAudioInfo(target_question)
    {
        let audio_play_time = undefined;

        if(target_question['answer_audio_resource'] == undefined) //정답 표시용 음악 없다면 패스
        {
            return audio_play_time;
        }

        const audio_player = this.quiz_session.audio_player;
        const audio_resource = target_question['answer_audio_resource'];
        audio_play_time = target_question['answer_audio_play_time'];

        audio_player.stop(true); //우선 지금 나오는 거 멈춤
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
            return false;
        }
        const image_resource = target_question['answer_image_resource'];
        quiz_ui.setImage(image_resource);
        return true;
    }

    //페이드 아웃 자동 시작
    async autoFadeOut(audio_player, resource, audio_play_time)
    {
        if(SYSTEM_CONFIG.use_inline_volume)
        {
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

        const quiz_info = this.quiz_session.quiz_info;
        const quiz_data = this.quiz_session.quiz_data;
        //실제 퀴즈들 로드
        let question_list = [];

        const quiz_id = quiz_info['quiz_id']; //커스텀 퀴즈는 quiz_id가 있다.
        const question_row_list = await db_manager.getQuestionList(quiz_id);

        if(question_row_list == undefined || question_row_list.rowCount == 0) 
        {
            throw 'question row list is empty, quiz_id: ' + quiz_id
        }
        
        question_row_list.rows.forEach((question_row) => {

            let question = {};
            question['type']  = QUIZ_TYPE.CUSTOM;
            question['hint_used'] = false;
            question['skip_used'] = false;
            question['play_bgm_on_question_finish'] = true;

            Object.keys(question_row).forEach((key) => {
                const value = question_row[key];
                question[key] = value;
            });

            question_list.push(question);

        });

        question_list.sort(() => Math.random() - 0.5); //퀴즈 목록 무작위로 섞기
        quiz_data['question_list'] = question_list;
        quiz_data['quiz_size'] = question_list.length; //퀴즈 수 재정의 하자
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
        quiz_ui.embed.description = '\u1CBC\n\u1CBC\n';

        quiz_ui.components = [];

        const explain_type = EXPLAIN_TYPE.ShortAnswerType;
        //TODO 퀴즈 타입에 따라 설명 다르게

        const explain_list = text_contents.quiz_explain[explain_type];
        for(let i = 0; i < explain_list.length; ++i)
        {
            const explain = explain_list[i];
            quiz_ui.embed.description += explain;
            utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.PLING);
            quiz_ui.update();
            
            await new Promise((resolve, reject) =>
            {
                setTimeout(() => {
                    //그냥 sleep용
                    resolve();
                },SYSTEM_CONFIG.explain_wait);
            });
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
            else if(question_type == QUIZ_TYPE.CUSTOM)
            {
                await this.prepareCustom(target_question);
            }

            await this.prepareAnswerAdditionalInfo(target_question); //정답 표시 시, 사용할 추가 정보
        }
        catch(err)
        {
            if(this.quiz_session == undefined)
            {
                logger.error(`Failed prepare step by quiz_session undefined, guess force stop`);
                this.skip_prepare = true;
                return;
            }
            logger.error(`Failed prepare enter step quiz, guild_id:${this.quiz_session?.guild_id}, target_question: ${target_question?.question}, err: ${err.stack ?? err.message}`);
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

    async prepareAnswerAdditionalInfo(target_question)
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
                audio_play_time = ((audio_info.format.duration) ?? 1000) * 1000; //10000000 -> 무조건 오디오 길이 쓰도록 //TODO 이게 맞나? 재고해보셈
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
        const audio_duration_sec = audio_info.format.duration ?? 100000; //duration 없으면 무조건 서버 설정 값 따르게 할거임
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
                        logger.debug(`Refined audio point, question: ${question}min: ${audio_min_start_point} -> ${refined_audio_min_start_point}, max: ${audio_max_start_point} -> ${refined_audio_max_start_point}`);
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
        if(cut_audio == true)
        {
            const seek_stream = new SeekStream(
                question,
                audio_duration_sec, //duration 
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
        target_question['question'] = "\u1CBC\n" + question + "\u1CBC\n"
        const question_type = target_question['type'];
        target_question['is_long'] = ((question_type == QUIZ_TYPE.TEXT_LONG || question_type == QUIZ_TYPE.OX_LONG) ? true : false);
    }

    async prepareCustom(target_question) //TODO 나중에 Dev quiz랑 중복 코드 처리하자...어우 귀찮아
    {
        const option_data = this.quiz_session.option_data;
        const game_data = this.quiz_session.game_data;

        /**
         * question_audio_url,
         * audio_start,
         * audio_end,
         */
        const question_audio_url = target_question['question_audio_url'];

        //오디오 정보 가져오기
        const youtube_info = await ytdl.getInfo(question_audio_url);
        let audio_formats = ytdl.filterFormats(youtube_info.formats, 'audioonly');
        if(audio_formats.length == 0) 
        {
            logger.error(`cannot found audio format from ${youtube_info}`);
            return;
        }

        const audio_format = audio_formats[audio_formats.length - 1]; //맨 뒤에 있는게 가장 low 퀄리티, 반대로 맨 앞이면 high 퀄리티
        const audio_duration = audio_format.approxDurationMs;
        const audio_size = audio_format.contentLength;
        const audio_bitrate = audio_format.averageBitrate;
        const audio_byterate = audio_bitrate / 8;

        let audio_play_time = (target_question['audio_play_time'] ?? 0) <= 0 ? option_data.quiz.audio_play_time / 1000 : target_question['audio_play_time'];
        if(audio_play_time > 60) audio_play_time = 60; //60초가 넘어가서는 안된다.

        const audio_start_sec = target_question['audio_start'];
        const audio_end_sec = target_question['audio_end'] ?? audio_duration;
        

        //오디오 길이가 audio_play_time 보다 작으면 오디오 길이를 audio_length로
        let audio_length; 

        if(audio_duration == undefined || audio_play_time < audio_duration) 
        {
            audio_length = audio_play_time * 1000;
        } 
        else
        {
            audio_length = audio_duration * 1000;
        }
        target_question['audio_length'] = audio_length;

        let audio_min_start_point = audio_start_sec;
        let audio_max_start_point = audio_end_sec - audio_play_time;

        let audio_start_point = undefined;
        let audio_end_point = undefined;

        //오디오 자르기 기능
        if(audio_max_start_point > audio_min_start_point) //충분히 재생할 수 있는 start point가 있다면
        {
            if(option_data.quiz.improved_audio_cut == OPTION_TYPE.ENABLED) //최대한 중간 범위로 좁힌다.
            {
                const audio_mid_point = (audio_min_start_point + audio_max_start_point) / 2;
                const refined_audio_min_start_point = audio_mid_point - (audio_play_time / 2) + 1;
                const refined_audio_max_start_point = audio_mid_point + (audio_play_time /2) + 1;

                if(audio_min_start_point < refined_audio_min_start_point && refined_audio_max_start_point < audio_max_start_point) //좁히기 성공이면
                {
                    logger.debug(`Refined audio point, question: ${question_audio_url}min: ${audio_min_start_point} -> ${refined_audio_min_start_point}, max: ${audio_max_start_point} -> ${refined_audio_max_start_point}`);
                    audio_min_start_point = refined_audio_min_start_point;
                    audio_max_start_point = refined_audio_max_start_point;
                }
            }

            audio_start_point = parseInt(utility.getRandom(audio_min_start_point, audio_max_start_point));
            audio_end_point = parseInt(audio_start_point + audio_play_time);
        }

        
        //오디오 스트림 미리 생성
        let audio_stream = undefined;

        if(audio_start_point == undefined) audio_start_point = 0;
        if(audio_end_point == undefined) audio_end_point = audio_start_point + audio_play_time; 

        logger.debug(`cut audio, question: ${question_audio_url}, point: ${audio_start_point} ~ ${(audio_end_point == Infinity ? 'Infinity' : audio_end_point)}`);
        // audio_stream = ytdl.downloadFromInfo(youtube_info, { format: audio_format, range: {start: audio_start_point, end: audio_end_point} });
        audio_stream = ytdl(question_audio_url, { 
            format: audio_format ,
            opusEncoded: true,
            // encoderArgs: ['-af', 'bass=g=10,dynaudnorm=f=200', `-to ${audio_end_point}`, `-fs ${10 * 1024 * 1024}`],
            encoderArgs: ['-af', 'bass=g=10,dynaudnorm=f=200', `-to ${audio_play_time}`],
            seek: audio_start_point,
        });
        this.current_audio_streams.push(audio_stream);

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

        let resource = undefined;
        resource = createAudioResource(audio_stream, { //Opus로 실행해주면 된다.
            inputType: StreamType.Opus,
            inlineVolume: SYSTEM_CONFIG.use_inline_volume,
        });

        if(SYSTEM_CONFIG.use_inline_volume)
        {
            resource.volume.setVolume(0);
        }

        target_question['audio_resource'] = resource;


        /**
         * question_image_url
         */
        target_question['image_resource'] = target_question['question_image_url'];

        /**
         * question_answers
         */

        let answers = [];
        const answer_string = target_question['answers'];
        if(answer_string != undefined)
        {
            answer_string.split(",").forEach((answer_row) => 
            {
                let answer = answer_row.trim().replace(/ /g, "");
                answers.push(answer);
            });
            target_question['answers'] = answers;
        }

        /**
         * question_hint
         */

        //힌트는 그대로


        /**
         * question_text
         */
        //question_text 도 그대로

        /**
         * answer_audio_url
         */
        const answer_audio_url = target_question['answer_audio_url'];
        if(answer_audio_url != undefined)
        {
            const answer_audio_play_time = SYSTEM_CONFIG.correct_answer_cycle_wait;

            const answer_youtube_info = await ytdl.getInfo(answer_audio_url)
            let audioFormats = ytdl.filterFormats(answer_youtube_info.formats, 'audioonly');
            if(audioFormats.length > 0)
            {
                const audioFormat = audioFormats[audioFormats.length - 1]; //맨 뒤에 있는게 가장 low 퀄리티, 반대로 맨 앞이면 high 퀄리티
                const bitrate = audioFormat.averageBitrate;
                const byterate = bitrate / 8;
    
                const answer_audio_stream = ytdl.downloadFromInfo(answer_youtube_info, { format: audio_format, range: { start: 0, end: (answer_audio_play_time * byterate)}});
    
                let answer_audio_resource = undefined;
                answer_audio_resource = createAudioResource(answer_audio_stream, {
                    inputType: WebmOpus,
                    inlineVolume: SYSTEM_CONFIG.use_inline_volume,
                });
    
                if(SYSTEM_CONFIG.use_inline_volume)
                {
                    audio_resource.volume.setVolume(0);
                }
    
                target_question['answer_audio_resource'] = answer_audio_resource;
                target_question['answer_audio_play_time'] = answer_audio_play_time;
    
            }
        }
        

        /**
         * answer_image_url
         */
        target_question['answer_image_resource'] = target_question['answer_image_url'];

        /**
         * answer_text
         */
        target_question['author'] = target_question['answer_text'];
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
        // const max_try = SYSTEM_CONFIG.max_check_prepared_queue;
        const max_try = 40; //고정값으로 테스트해보자
        while(game_data.prepared_question_queue.length == 0)
        {
            if(this.quiz_session.force_stop == true) return false;

            if(++current_check_prepared_queue >= max_try) //최대 체크 횟수 초과 시
            {
                this.next_cycle = CYCLE_TYPE.CLEARING; 
                logger.error(`Prepared Queue is Empty, tried ${current_check_prepared_queue} * ${500}..., going to CLEARING cycle, guild_id: ${this.quiz_session.guild_id}`);
                return false;
            }

            // await utility.sleep(SYSTEM_CONFIG.prepared_queue_check_interval);
            await utility.sleep(500); //고정값으로 테스트 해보자
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

        quiz_ui.embed.title = `[\u1CBC${quiz_data['icon']} ${quiz_data['title']}\u1CBC]`;
        
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

        await quiz_ui.send(false);

        return quiz_ui;
    }

    //힌트 표시
    async showHint(question)
    {
        if(question['hint_used'] == true || question['hint'] == undefined)
        {
            return;    
        }
        question['hint_used'] = true;

        const hint = question['hint'];
        const channel = this.quiz_session.channel;
        let hint_message = text_contents.quiz_play_ui.show_hint;
        hint_message = hint_message.replace("${hint}", hint);
        channel.send({content: hint_message});

        let quiz_ui = this.quiz_session.quiz_ui;
        quiz_ui.setButtonStatus(0, false); //스킵 버튼 비활성화
        quiz_ui.update();
    }

    //스킵
    async skip(question)
    {
        if(question['skip_used'] == true)
        {
            return;    
        }
        question['skip_used'] = true;

        const channel = this.quiz_session.channel;
        let skip_message = text_contents.quiz_play_ui.skip;
        channel.send({content: skip_message});
        
        let quiz_ui = this.quiz_session.quiz_ui;
        quiz_ui.setButtonStatus(1, false); //스킵 버튼 비활성화
        quiz_ui.update();
        
        this.stopTimeoverTimer(); //그리고 다음으로 진행 가능하게 타임오버 타이머를 중지해줌
    }

    //진행 bar 시작
    async startProgressBar(audio_play_time)
    {
        //진행 상황 bar, 10%마다 호출하자
        const progress_max_percentage = 10;
        const progress_bar_interval = audio_play_time / progress_max_percentage;
        let progress_percentage = 0; //시작은 0부터
        
        let quiz_ui = this.quiz_session.quiz_ui;

        let progress_bar_string = this.getProgressBarString(progress_percentage, progress_max_percentage);
        quiz_ui.embed.description = this.progress_bar_fixed_text ?? '';
        quiz_ui.embed.description += `\u1CBC\n\u1CBC\n🕛\u1CBC**${progress_bar_string}**\n\u1CBC\n\u1CBC\n`;
        quiz_ui.update(); // 우선 한 번은 그냥 시작해주고~

        const progress_bar_timer = setInterval(() => {

            ++progress_percentage

            let progress_bar_string = this.getProgressBarString(progress_percentage, progress_max_percentage);

            quiz_ui.embed.description = this.progress_bar_fixed_text ?? '';
            quiz_ui.embed.description += `\u1CBC\n\u1CBC\n⏱\u1CBC**${progress_bar_string}**\n\u1CBC\n\u1CBC\n`;
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

            this.stopTimeoverTimer(); //맞췄으니 타임오버 타이머 중지!

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
        if(option_data.quiz.hint_type == OPTION_TYPE.HINT_TYPE.AUTO) //자동 힌트 사용 중이라면
        {
            const hint_timer_wait = audio_play_time / 2; //절반 지나면 힌트 표시할거임
            const hint_timer = setTimeout(() => {
                this.showHint(this.current_question); //현재 퀴즈 hint 표시
            }, hint_timer_wait);
            this.hint_timer = hint_timer;
        }   
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

                if(audio_player.state.status == 'playing') //아직도 오디오 플레이 중이라면
                {
                    logger.debug(`Graceful timeover, guild_id:${this.quiz_session.guild_id}, graceful_count: ${graceful_timeover_try}/${SYSTEM_CONFIG.graceful_timeover_max_try}`);
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
        const option_data = this.quiz_session.option_data;
        const current_question = this.current_question;
        if(current_question == undefined) 
        {
            return;
        }

        if(this.timeover_timer == undefined)
        {
            return; //타임 오버 타이머 시작도 안했는데 누른거면 패스한다.
        }

        if(interaction.customId === 'hint') 
        {
            if(current_question['hint_used'] == true || current_question['hint'] == undefined) //2중 체크
            {
                return;
            }

            if(option_data.quiz.hint_type == OPTION_TYPE.HINT_TYPE.OWNER) //주최자만 hint 사용 가능하면
            {
                if(interaction.member == this.quiz_session.owner)
                {
                    this.showHint(current_question);
                    return;
                }
                const reject_message = '```' + `${text_contents.quiz_play_ui.only_owner_can_use_hint}` +'```'
                interaction.channel.send({content: reject_message});
            }
            else if(option_data.quiz.hint_type == OPTION_TYPE.HINT_TYPE.VOTE)
            {
                const voice_channel = this.quiz_session.voice_channel;
                const vote_criteria = parseInt((voice_channel.members.size - 2) / 2) + 1; 

                let current_hint_vote_count = 0;
                if(current_question['hint_vote_count'] == undefined)
                {
                    current_hint_vote_count = 1;
                }
                else 
                {
                    current_hint_vote_count = current_question['hint_vote_count'] + 1;
                }
                current_question['hint_vote_count'] = current_hint_vote_count;

                let hint_vote_message = text_contents.quiz_play_ui.hint_vote;
                hint_vote_message = hint_vote_message.replace("${who_voted}", interaction.member.displayName);
                hint_vote_message = hint_vote_message.replace("${current_vote_count}", current_hint_vote_count);
                hint_vote_message = hint_vote_message.replace("${vote_criteria}", vote_criteria);
                interaction.channel.send({content: hint_vote_message});
                if(current_hint_vote_count >= vote_criteria)
                {
                    this.showHint(current_question);
                }

            }
            return;
        }

        if(interaction.customId === 'skip') 
        {
            if(current_question['skip_used'] == true) //2중 체크
            {
                return;
            }

            if(option_data.quiz.skip_type == OPTION_TYPE.SKIP_TYPE.OWNER) //주최자만 skip 사용 가능하면
            {
                if(interaction.member == this.quiz_session.owner)
                {
                    this.skip(this.current_question);
                    return;
                }
                const reject_message = '```' + `${text_contents.quiz_play_ui.only_owner_can_use_skip}` +'```'
                interaction.channel.send({content: reject_message});
            }
            else if(option_data.quiz.skip_type == OPTION_TYPE.SKIP_TYPE.VOTE)
            {
                const voice_channel = this.quiz_session.voice_channel;
                const vote_criteria = parseInt((voice_channel.members.size - 2) / 2) + 1; 

                let current_skip_vote_count = 0;
                if(current_question['skip_vote_count'] == undefined)
                {
                    current_skip_vote_count = 1;
                }
                else
                {
                    current_skip_vote_count = current_question['skip_vote_count'] + 1;
                }
                current_question['skip_vote_count'] = current_skip_vote_count;

                let skip_vote_message = text_contents.quiz_play_ui.skip_vote;
                skip_vote_message = skip_vote_message.replace("${who_voted}", interaction.member.displayName);
                skip_vote_message = skip_vote_message.replace("${current_vote_count}", current_skip_vote_count);
                skip_vote_message = skip_vote_message.replace("${vote_criteria}", vote_criteria);
                interaction.channel.send({content: skip_vote_message});

                if(current_skip_vote_count >= vote_criteria)
                {
                    this.skip(current_question);
                }
            }
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
            audio_player.stop(true); //BGM 바로 멈춰준다.

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

        //오디오 재생 부
        const audio_player = this.quiz_session.audio_player;
        const resource = current_question['audio_resource'];
        const audio_play_time = (current_question['audio_length'] ?? option_data.quiz.audio_play_time) + 1000; //인트로 퀴는 1초 더 준다.

        this.startAudio(audio_player, resource, false); //인트로 퀴즈는 fadeIn, fadeout 안 쓴다.

        const wait_for_answer_time = 10000; //인트로 퀴즈는 문제 내고 10초 더 준다.
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
            audio_player.stop(true); //BGM 바로 멈춰준다.

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
            audio_player.stop(true); //BGM 바로 멈춰준다.

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
class QuestionCustom extends Question
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
        const question_id = current_question['question_id'];

        logger.info(`Questioning Custom, guild_id:${this.quiz_session.guild_id}, question_num: ${game_data['question_num']+1}/${quiz_data['quiz_size']}, question_id: ${question_id}`);

        //이미지 표시
        const image_resource = current_question['image_resource'];
        if(image_resource != undefined)
        {
            let quiz_ui = this.quiz_session.quiz_ui; 
            quiz_ui.setImage(image_resource);
            await quiz_ui.update(); //대기 해줘야한다. 안그러면 타이밍 이슈 땜에 이미지가 2번 올라간다.
        }

        //텍스트 표시
        const question_text = current_question['question_text'];
        if(question_text != undefined)
        {
            this.progress_bar_fixed_text = question_text; //텍스트 퀴즈는 progress bar 위에 붙여주면 된다.
        }

        //오디오 재생
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
                author_list_message += author + "\n";
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

        this.custom_wait = this.applyAnswerAudioInfo(processing_question);
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
        const wait_time = this.custom_wait != undefined ? this.custom_wait : SYSTEM_CONFIG.timeover_cycle_wait; //정답 얼마동안 보여줄 지
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                resolve();
            }, wait_time);
        });
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
            author_list_message += author + "\n";
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

        this.custom_wait = this.applyAnswerAudioInfo(processing_question);
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
        const wait_time = this.custom_wait != undefined ? this.custom_wait : SYSTEM_CONFIG.timeover_cycle_wait; //정답 얼마동안 보여줄 지
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                resolve();
            }, wait_time);
        });
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
        quiz_ui.embed.description = `${quiz_data['icon']} ${quiz_data['title']}\n\u1CBC\n\u1CBC\n`;
        quiz_ui.embed.footer = undefined //footer 없앰

        quiz_ui.embed.fields = [ //페이크 필드
            {
                name: '\u1CBC\n',
                value: '\u1CBC\n',
            },
        ];

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
                    quiz_ui.embed.description += `\u1CBC\n\u1CBC\n`;
                }
                quiz_ui.embed.description += `${medal} ${member.displayName} \u1CBC\u1CBC ${score}${text_contents.scoreboard.point_name}\n`;
                if(i < 3) //3등까지는 하나씩 보여줌
                {
                    quiz_ui.embed.description += `\u1CBC\n`; //3등까지는 간격도 늘려줌
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
            quiz_ui.embed.description += `\u1CBC\n\u1CBC\n`;
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