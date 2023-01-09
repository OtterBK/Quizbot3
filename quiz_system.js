'use strict';

//#region 외부 모듈 로드
const fs = require('fs');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');
//#endregion

//#region 로컬 모듈 로드
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE, EXPLAIN_TYPE, BGM_TYPE, QUIZ_MAKER_TYPE } = require('./system_setting.js');
const option_system = require("./quiz_option.js");
const OPTION_TYPE = option_system.OPTION_TYPE;
const text_contents = require('./text_contents.json')[SYSTEM_CONFIG.language]; 
const utility = require('./utility.js');
const { config } = require('process');
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
let guild_session_map = {};
//#endregion

//#region exports 정의
/** exports **/
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

    if(guild_session_map.hasOwnProperty(guild_id) == false)
    {
        return undefined;
    }

    return guild_session_map[guild_id];
}

exports.startQuiz = (guild, owner, channel, quiz_info) =>
{
    const quiz_session = new QuizSession(guild, owner, channel, quiz_info);
    guild_session_map[guild.id] = quiz_session;

    return quiz_session;
}

exports.getLocalQuizSessionCount = () => {
    return Object.keys(guild_session_map).length;
}

exports.getMultiplayQuizSessionCount = () => {
    return 0; //TODO 나중에 멀티플레이 만들면 수정
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

    this.components = [ ];
  }

  async send(previous_delete, remember_ui = true)
  {
    if(previous_delete == true && this.ui_instance != undefined)
    {
        this.ui_instance.delete() //이전 UI는 삭제
        .catch(err => {
            console.log(`Failed Delete QuizPlayUI: ${err.message}`);
        });
    }
    await this.channel.send({embeds: [ this.embed ], components: this.components}) //await로 대기
    .then((ui_instance) => {
        if(remember_ui == false)
        {
            return;
        }
        this.ui_instance = ui_instance;
    })
    .catch(err => {
        console.log(`Failed Send QuizPlayUI: ${err.message}`);
    });
  }

  async delete()
  {
    if(this.ui_instance == undefined)
    {
        return;
    }
    this.ui_instance.delete();
    this.ui_instance = undefined;
  }

  async update()
  {
    if(this.ui_instance != undefined)
    {
        this.ui_instance.edit({embeds: [ this.embed ], components: this.components})
        .catch(err => {
            console.log(`Failed Update QuizPlayUI: ${err.message}`);
        });
    }
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

    createCycle()
    {
        const quiz_info = this.quiz_info;

        const quiz_maker_type = quiz_info['quiz_maker_type'];
        //Initialize 단계 선택
        if(quiz_maker_type == QUIZ_MAKER_TYPE.BY_DEVELOPER)
        {
            this.inputLifeCycle(CYCLE_TYPE.INITIALIZING, new InitializeDevQuiz(this));
        }
        else if(quiz_maker_type == QUIZ_MAKER_TYPE.BY_USER)
        {
            this.inputLifeCycle(CYCLE_TYPE.INITIALIZING, new InitializeUserQuiz(this));
        }
        else
        {
            this.inputLifeCycle(CYCLE_TYPE.INITIALIZING, new InitializeUnknownQuiz(this));
        }

        this.inputLifeCycle(CYCLE_TYPE.EXPLAIN, new Explain(this));

        this.inputLifeCycle(CYCLE_TYPE.PREPARE, new Prepare(this));

        //Questioning 단계 선택

        const quiz_type = quiz_info['quiz_type'];
        if(quiz_type == QUIZ_TYPE.SONG)
        {
            this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionSong(this));
        }
        else
        {
            this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new QuestionUnknown(this));
        }


        this.inputLifeCycle(CYCLE_TYPE.CORRECTANSWER, new CorrectAnswer(this));
        this.inputLifeCycle(CYCLE_TYPE.TIMEOVER, new TimeOver(this));

        //이 아래는 공통
        this.inputLifeCycle(CYCLE_TYPE.ENDING, new Ending(this));
        this.inputLifeCycle(CYCLE_TYPE.FINISH, new Finish(this));
    }

    inputLifeCycle(cycle_type, cycle)
    {
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
            console.log(`Failed to go to cycle ${cycle_type}`);
            return;
        }
        this.current_cycle_type = cycle_type;
        target_cycle.do();
    }

    async forceStop() //세션에서 강제 종료 시,
    {
        this.force_stop = true;
        const current_cycle_type = this.current_cycle_type;
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
        this.quiz_session = quiz_session;
        this.next_cycle = CYCLE_TYPE.UNDEFINED;
        this.cannot_block = false;
    }

    do()
    {
        this._enter();
    }

    async asyncCallCycle(cycle_type) //비동기로 특정 cycle을 호출, PREPARE 같은거
    {
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
                console.log(err);
            }
        }

        if(this.quiz_session.force_stop == true)
        {
            goNext = false;
        }

        if(goNext == false && this.cannot_block == false) return;
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
                console.log(err);
            }
        }

        if(this.quiz_session.force_stop == true) 
        {
            goNext = false;
        }

        if(goNext == false && this.cannot_block == false) return;
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
                console.log(err);
            }
        }

        if(this.quiz_session.force_stop == true) 
        {
            goNext = false;
        }

        if(goNext == false && this.cannot_block == false) return;

        if(this.next_cycle == CYCLE_TYPE.UNDEFINED) //다음 Lifecycle로
        {
            return;
        }        
        this.quiz_session.goToCycle(this.next_cycle);
    }

    async forceStop()
    {
        console.log(`force stop`);
        this.quiz_session.force_stop = true;
        this.next_cycle == CYCLE_TYPE.UNDEFINED;
        if(this.exit != undefined)
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
                this.forceStop();
                let force_stop_message = text_contents.quiz_play_ui.force_stop;
                force_stop_message = force_stop_message.replace("${who_stopped}", event_object.member.user.username);
                event_object.channel.send({content: force_stop_message});
                return;
            }
            return this.onInteractionCreate(event_object);
        }
    }

    /** 커스텀 이벤트 핸들러 **/
    onInteractionCreate(interaction)
    {

    }
}

class QuizLifeCycleScoreboarding extends QuizLifecycle
{
    //스코어보드 fields 가져오기
    getScoreboardFields()
    {
        let option_data = this.quiz_session.option_data;
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

            const show_count = option_data.quiz.score.show_max == -1 ? scoreboard.size : option_data.quiz.score.show_max;

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
    }

    async enter() //모든 Initialize 단계에서 공통
    {
        const voice_channel = this.quiz_session.voice_channel;
        const guild = this.quiz_session.guild;

        //보이스 커넥션
        const voice_connection = joinVoiceChannel({
            channelId: voice_channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        });

        //보이스 끊겼을 때 핸들링
        voice_connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {

            if(this.quiz_session.force_stop == true || this.quiz_session.current_cycle_type == CYCLE_TYPE.FINISH) //강종이나 게임 종료로 끊긴거면
            {
                return;
            }

            try {
                //우선 끊어졌으면 재연결 시도를 해본다.
                await Promise.race([
                    entersState(voice_connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(voice_connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                //근데 정말 연결 안되면 강제 종료한다.
                try{
                    voice_connection.destroy();
                }catch(error) {
                }
                
                await this.quiz_session.forceStop();
            }
        });

        const audio_player = createAudioPlayer();
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
            'prepared_quiz_queue': [], //PREPARE Cycle을 거친 퀴즈 큐
        };
        this.quiz_session.game_data = game_data;
        this.quiz_session.quiz_data = quiz_data;
    }

    async act() //quiz_maker_type 별로 다르게 동작
    {

    }

    async exit()
    {
        this.asyncCallCycle(CYCLE_TYPE.PREPARE); //미리 문제 준비
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

        if(option_data.quiz.answer.use_similar_answer) //유사 정답 사용 시
        {
            similar_answers.forEach((similar_answer) => { //유사 정답도 넣어주자
                answers.push(similar_answer);
            });
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

        return hint;
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
        const quiz_info = this.quiz_session.quiz_info;
        const quiz_data = this.quiz_session.quiz_data;
        const quiz_path = quiz_info['quiz_path'];
        //실제 퀴즈들 로드
        let quiz_list = [];
        
        //TODO 인트로 퀴즈도 있고 그림퀴즈도 있고 쨋든 종류가 많은데, 너무 예전이라 기억이 안난다. 우선 노래 퀴즈 중점으로 만들고 고치자
        const quiz_folder_list = fs.readdirSync(quiz_path); //TODO 여기도 그냥 정적으로 읽어올까..?
                    
        quiz_folder_list.forEach(quiz_folder_name => {
            
            if(quiz_folder_name.includes(".txt")) return;

            //우선 퀴즈 1개 생성
            let quiz = {};
            quiz['type'] = quiz_data['quiz_type'];
            quiz['hint_used'] = false;
            quiz['skip_used'] = false;

            //작곡가 파싱
            let author_string = undefined;
            let try_parse_author =  quiz_folder_name.split("&^"); //가수는 &^로 끊었다.

            if(try_parse_author.length > 1) //가수 데이터가 있다면 넣어주기
            {
                author_string = try_parse_author[1];

                let authors = [];
                author_string.split("&^").forEach((author_row) => {
                    const author = author_row.trim();
                    authors.push(author);
                })

                quiz['author'] = authors;
            }

            //정답 키워드 파싱
            let answer_string = try_parse_author[0];
            answer_string = quiz_folder_name.split("&^")[0];
            let answers_row = answer_string.split("&#"); //정답은 &#으로 끊었다.
            const answers = this.makeAnswers(answers_row);
            quiz['answers'] = answers;


            //힌트 만들기
            let hint = undefined;
            if(answers_row.length > 0)
            {
                hint = this.makeHint(answers_row[0]);
                if(hint == undefined)
                {
                    console.log(`Unknown hint from answer: ${answers_row}`);
                }
            }
            quiz['hint'] = hint ?? 'No Hint';

            //실제 문제로 낼 퀴즈 파일
            const quiz_folder_path = quiz_path + "/" + quiz_folder_name + "/";
            const quiz_file_list = fs.readdirSync(quiz_folder_path);
            quiz_file_list.forEach(quiz_folder_filename => { 
                quiz['question'] = quiz_folder_path + "/" + quiz_folder_filename;
            });

            //quiz_list에 넣어주기
            quiz_list.push(quiz);
        });

        quiz_list.sort(() => Math.random() - 0.5); //퀴즈 목록 무작위로 섞기
        quiz_data['quiz_list'] = quiz_list;
        quiz_data['quiz_size'] = quiz_list.length; //퀴즈 수 재정의 하자
    }
}

class InitializeUserQuiz extends Initialize
{
    constructor(quiz_session)
    {
        super(quiz_session);
    }
    
    async act() //user 퀴즈 파싱
    {

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
        channel.send({content: '아직 지원하지 않는 퀴즈 유형입니다.'})
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
        this.prepared_quiz = undefined;
    }

    async enter()
    {
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
        if(this.skip_prepare == true)
        {
            return;
        }

        //다음에 문제낼 퀴즈 꺼내기
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        const question_num = game_data['question_num'];
        let target_quiz = quiz_data.quiz_list[question_num];

        const quiz_type = target_quiz['type'];
        if(
               quiz_type == QUIZ_TYPE.SONG
        )   
        {
            try{
                await this.prepareAudio(target_quiz);
            }catch(error)
            {
                console.log(`Failed Prepare Audio[${target_quiz['question']}]: ${error.message}`);
            }
        }

        this.prepared_quiz = target_quiz;
    }

    async exit()
    {
        let game_data = this.quiz_session.game_data;
        let quiz_data = this.quiz_session.quiz_data;
        const question_num = game_data['question_num'];

        if(this.skip_prepare == false && this.prepared_quiz != undefined)
        {
            game_data.prepared_quiz_queue.push(this.prepared_quiz );
            console.log(`prepared ${question_num}`);
            return;
        }

        if(this.skip_prepare == false) //prepare 시도 했는데 실패한거라면
        {
            let failed_quiz = quiz_data.quiz_list[game_data['question_num']];
            console.log(`Failed to prepare quiz: ${failed_quiz}`);
        }
    }

    async prepareAudio(target_quiz)
    {
        let option_data = this.quiz_session.option_data;

        const question = target_quiz['question'];

        //오디오 정보 가져오기
        const audio_play_time = option_data.quiz.audio_play_time; 

        //오디오 길이 먼저 넣어주고~
        const audio_info = await utility.getAudioInfo(question);
        const audio_length = (audio_info.format.duration ?? (await getAudioDurationInSeconds(question))) * 1000;
        target_quiz['audio_length'] = audio_length < audio_play_time ? audio_length : audio_play_time;

        //노래 재생 시작 지점 파싱
        const audio_byte_size = audio_info.format.size; //오디오 bytes 사이즈
        const audio_bitrate = audio_info.format.bit_rate; //오디오 비트레이트
        const audio_byterate = audio_bitrate / 8; //초당 재생 bytes

        //오디오 자르기 기능
        /**
        mp3 타입아니면 시작을 첨부터 해야함, 별 짓을 다했는데 mp3아니면 몇몇 노래들이 깨짐
        wav 파일 기준으로 앞 44byte를 metadata로 하여서 별도의 stream으로 만들고 무작위 구간으로 생성한 file_stream으로 생성해서 테스트 해봤는데
        metadata를 아예 안붙이면 play 조차 안됨, 아마 CreateAudioResource 할 때 변환이 안되는 듯
        어떤건 잘되고 어떤건 잘 안됨, mp3의 경우는 metadata 안 붙여도 잘돼서 그냥 mp3만 지원하자 
        **/
        const audio_format = audio_info.format.format_name;
        const do_begin_start = audio_format === 'mp3' ? false : true;
        
        let audio_start_point = undefined;
        let audio_end_point = undefined;

        //TODO 나중에 여유 있을 때 랜덤 재생 구간을 최대한 중간 쪽으로 잡도록 만들자
        const audio_play_time_sec = audio_play_time / 1000; //계산하기 쉽게 초로 환산 ㄱㄱ
        const audio_max_start_point = audio_byte_size - (audio_play_time_sec + 2.5) * audio_byterate;  //우선 이 지점 이후로는 시작 지점이 될 수 없음, +2.5 하는 이유는 padding임
        const audio_min_start_point = 2.5 * audio_byterate;  //앞에도 2.5초 정도 자르고 싶음

        if((audio_max_start_point > audio_min_start_point)) //충분히 재생할 수 있는 start point가 있다면
        {
            audio_start_point = do_begin_start ? 0 : parseInt(utility.getRandom(audio_min_start_point, audio_max_start_point)); //mp3타입만 랜덤 start point 지원
            audio_end_point = parseInt(audio_start_point + (audio_play_time_sec * audio_byterate));
        }
        
        //오디오 스트림 미리 생성
        let audio_stream_for_close = undefined;
        let audio_stream = undefined;

        if(audio_start_point == undefined) audio_start_point = 0;
        if(audio_end_point == undefined) audio_end_point = Infinity;

        console.log(`audio cut start: ${audio_start_point/audio_byterate} end: ${audio_end_point/audio_byterate}`);
        audio_stream = fs.createReadStream(question, {flags:'r', start: audio_start_point, end: audio_end_point});
        if(SYSTEM_CONFIG.explicit_close_audio_stream) //오디오 Stream 명시적으로 닫아줄거임
        {
            audio_stream_for_close = [audio_stream];
        }

        let resource = undefined;
        let inputType = StreamType.WebmOpus;
        if(question.endsWith('.ogg')) //ogg
        {
            inputType = StreamType.OggOpus;
        }

        //굳이 webm 또는 ogg 파일이 아니더라도 Opus 형식으로 변환하는 것이 더 좋은 성능을 나타낸다고함
        //(Discord에서 스트리밍 가능하게 변환해주기 위해 FFMPEG 프로세스가 계속 올라와있는데 Opus 로 변환하면 이 과정이 필요없음)
        if(config.use_inline_volume == false) //Inline volume 옵션 켜면 의미 없음
        {
            resource = createAudioResource(audio_stream, {
                inputType: inputType,
                inlineVolume: SYSTEM_CONFIG.use_inline_volume,
            });
        }
        else
        {
            resource = createAudioResource(audio_stream, {
                inlineVolume: SYSTEM_CONFIG.use_inline_volume,
            });
        }

        if(SYSTEM_CONFIG.use_inline_volume)
        {
            resource.volume.setVolume(0);
        }
        else
        {
            resource.volume.setVolume(1);
        }

        target_quiz['audio_resource'] = resource;
        target_quiz['audio_stream_for_close'] = audio_stream_for_close;
    }
}

//#endregion

//#region Question Cycle
/** 퀴즈 내는 단계인 Question, 여기가 제일 처리할게 많다. **/
class Question extends QuizLifecycle
{
    static cycle_type = CYCLE_TYPE.QUESTIONING;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_cycle = CYCLE_TYPE.TIMEOVER;

        this.current_quiz = undefined; //현재 진행 중인 퀴즈

        this.hint_timer = undefined; //자동 힌트 타이머
        this.timeover_timer = undefined; //타임오버 timer id
        this.timeover_resolve = undefined; //정답 맞췄을 시 강제로 타임오버 대기 취소
        this.fade_out_timer = undefined;
        this.already_start_fade_out = false;

        this.skip_prepare_cycle = false; //마지막 문제라면 더 이상 prepare 할 필요없음
        this.progress_bar_timer = undefined; //진행 bar
        this.answers = undefined; //문제 정답 목록

        this.is_timeover = false;
    }

    async enter()
    {
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        
        this.current_quiz = undefined; //현재 진행 중인 퀴즈

        this.hint_timer = undefined; //자동 힌트 타이머
        this.timeover_timer = undefined; //타임오버 timer id
        this.timeover_resolve = undefined; //정답 맞췄을 시 강제로 타임오버 대기 취소
        this.fade_out_timer = undefined;
        this.already_start_fade_out = false;

        this.skip_prepare_cycle = false;
        this.progress_bar_timer = undefined; //진행 bar

        this.is_timeover = false;

        if(game_data['question_num'] >= quiz_data['quiz_size']) //모든 퀴즈 제출됐음
        {
            this.next_cycle = CYCLE_TYPE.ENDING;
            this.skip_prepare_cycle = true;
            this.current_quiz = undefined;
            console.log("finished quiz");
            return; //더 이상 진행할 게 없다.
        }

        await this.quiz_session.audio_player.stop(); //시작 전엔 audio stop 걸고 가자

        //진행 UI 관련
        utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.ROUND_ALARM);
        let quiz_ui = await this.createQuestionUI();
        const essential_term = Date.now() + 3000; //최소 문제 제출까지 3초간의 텀은 주자

        //이전 퀴즈 resource 해제
        const previous_quiz = game_data['processing_quiz'];
        if(previous_quiz != undefined)
        {
            if(SYSTEM_CONFIG.explicit_close_audio_stream) //오디오 STREAM 명시적으로 닫음
            {
                const audio_stream_for_close = previous_quiz['audio_stream_for_close'];
                if(audio_stream_for_close != undefined)
                {
                    audio_stream_for_close.forEach((audio_stream) => audio_stream.close());
                }
            }

            const fade_out_timer = previous_quiz['fade_out_timer']; //이전에 호출한 fadeout이 아직 안끝났을 수도 있다.
            if(fade_out_timer != undefined)
            {
                clearTimeout(fade_out_timer);
            }
        }

        //아직 prepared queue에 아무것도 없다면
        let current_check_prepared_queue = 0;
        while(game_data.prepared_quiz_queue.length == 0)
        {
            if(current_check_prepared_queue >= SYSTEM_CONFIG.max_check_prepared_queue) //최대 체크 횟수 초과 시
            {
                this.next_cycle = CYCLE_TYPE.ENDING;
                console.log(`no prepared quiz... tried ${current_check_prepared_queue}... go to ending cycle`);
                break;
            }

            await new Promise((resolve, reject) => setTimeout(() => {
                console.log("timeout_log_check_prepared_queue");
                ++current_check_prepared_queue;
                resolve();
            }, SYSTEM_CONFIG.prepared_queue_check_interval));
        }
        
        this.current_quiz = game_data.prepared_quiz_queue.shift(); //하나 꺼내오자
        

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

        if(this.quiz_session.force_stop == true) //강제 종료가 호출됐다.
        {
            this.skip_prepare_cycle = true; //더 이상 prepare는 필요없다.
            this.stopTimeoverTimer(); //타임오버 타이머도 취소한다.
        }

        if(this.skip_prepare_cycle == false)
        {
            this.asyncCallCycle(CYCLE_TYPE.PREPARE); //다음 문제 미리 준비
        }

        if(this.progress_bar_timer != undefined)
        {
            clearInterval(this.progress_bar_timer);
        }

        if(this.hint_timer != undefined)
        {
            clearTimeout(this.hint_timer);
        }
    }

    //UI관련
    async createQuestionUI()
    {
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;
        let option_data = this.quiz_session.option_data;
        const quiz_ui = this.quiz_session.quiz_ui;

        quiz_ui.embed.color = 0xFED049;

        quiz_ui.embed.title = `[\u1CBC${quiz_data['icon']}${quiz_data['title']}\u1CBC]`;
        
        let footer_message = text_contents.quiz_play_ui.footer;
        footer_message = footer_message.replace("${quiz_question_num}", `${(game_data['question_num']+1)}`);
        footer_message = footer_message.replace("${quiz_size}", `${quiz_data['quiz_size']}`);
        footer_message = footer_message.replace("${option_hint_type}", `${option_data.quiz.hint.type}`);
        footer_message = footer_message.replace("${option_skip_type}", `${option_data.quiz.skip.type}`);
        quiz_ui.embed.footer = {
            "text": footer_message,
        }
        let description_message = text_contents.quiz_play_ui.description;
        description_message = description_message.replace("${quiz_question_num}", `${(game_data['question_num']+1)}`);
        quiz_ui.embed.description = description_message;

        quiz_ui.components = [quiz_ui.quiz_play_comp];

        quiz_ui.embed.fields = [];

        quiz_ui.setButtonStatus(0, option_data.quiz.hint.type == OPTION_TYPE.HINT_TYPE.AUTO ? false : true); //버튼 1,2,3 다 활성화
        quiz_ui.setButtonStatus(1, true); 
        quiz_ui.setButtonStatus(2, true);

        await quiz_ui.send(false);

        return quiz_ui;
    }

    //힌트 표시
    async showHint(quiz)
    {
        if(quiz['hint_used'] == true)
        {
            return;    
        }
        quiz['hint_used'] = true;

        const hint = quiz['hint'];
        const channel = this.quiz_session.channel;
        let hint_message = text_contents.quiz_play_ui.show_hint;
        hint_message = hint_message.replace("${hint}", hint);
        channel.send({content: hint_message});

        let quiz_ui = this.quiz_session.quiz_ui;
        quiz_ui.setButtonStatus(0, false); //스킵 버튼 비활성화
        quiz_ui.update();
    }

    //스킵
    async skip(quiz)
    {
        if(quiz['skip_used'] == true)
        {
            return;    
        }
        quiz['skip_used'] = true;

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
        quiz_ui.embed.description = `\u1CBC\n\u1CBC\n🕛\u1CBC**${progress_bar_string}**\n\u1CBC\n\u1CBC\n`;
        quiz_ui.update(); // 우선 한 번은 그냥 시작해주고~

        const progress_bar_timer = setInterval(() => {

            console.log("timeout_log_progress_bar");

            ++progress_percentage

            let progress_bar_string = this.getProgressBarString(progress_percentage, progress_max_percentage);

            quiz_ui.embed.description = `\u1CBC\n\u1CBC\n⏱\u1CBC**${progress_bar_string}**\n\u1CBC\n\u1CBC\n`;
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
        if(this.current_quiz['answer_user'] != undefined) //이미 맞춘사람 있다면 패스
        {
            return;
        }

        if(this.timeover_timer != undefined)
        {
            this.current_quiz['answer_user'] = member;

            this.stopTimeoverTimer(); //맞췄으니 타임오버 타이머 중지!

            const score = undefined;
            let scoreboard = this.quiz_session.scoreboard;
            if(scoreboard.has(member))
            {
                const prev_score = scoreboard.get(member);
                scoreboard.set(member, prev_score + 1); //1점 추가~
            }
            else
            {
                scoreboard.set(member, 1); //1점 등록~
            }
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

        if(this.timeover_resolve != undefined)
        {
            this.timeover_resolve('force stop timeover timer'); //타임오버 promise await 취소s
        }
    }

    //자동 힌트 체크
    async checkAutoHint(audio_play_time) 
    {
        const option_data = this.quiz_session.option_data;
        if(option_data.quiz.hint.type == OPTION_TYPE.HINT_TYPE.AUTO) //자동 힌트 사용 중이라면
        {
            const hint_timer_wait = audio_play_time / 2; //절반 지나면 힌트 표시할거임
            const hint_timer = setTimeout(() => {
                console.log("timeout_log_hint_timer");
                this.showHint(current_quiz); //현재 퀴즈 hint 표시
            }, hint_timer_wait);
            this.hint_timer = hint_timer;
        }   
    }

    //페이드 아웃 자동 시작
    async autoFadeOut(audio_player, resource, audio_play_time)
    {
        if(SYSTEM_CONFIG.use_inline_volume)
        {
            const fade_in_duration = SYSTEM_CONFIG.fade_in_duration;
            const fade_out_duration = SYSTEM_CONFIG.fade_out_duration;
            const fade_out_start_offset = audio_play_time - fade_out_duration - 1000; //해당 지점부터 fade_out 시작, 부드럽게 1초 정도 간격두자
            if(fade_out_start_offset < fade_in_duration)
            {
                fade_out_start_offset = fade_in_start_time;
            }

            //일정시간 후에 fadeout 시작
            const fade_out_timer = setTimeout(() => {
                console.log("timeout_log_start_fade_out");
                this.already_start_fade_out = true;
                utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, fade_out_duration);
            }, fade_out_start_offset);

            this.fade_out_timer = fade_out_timer;
        }
    }

    //오디오 재생
    async startAudio(audio_player, resource)
    {
        const fade_in_duration = SYSTEM_CONFIG.fade_in_duration;
        if(SYSTEM_CONFIG.use_inline_volume)
        {
            utility.fade_audio_play(audio_player, resource, 0.1, 1.0, fade_in_duration);
            return Date.now() + fade_in_duration;  //
        }
        
        audio_player.play(resource); 
        return undefined;
    }

    //타임오버 타이머 생성 및 시작
    async createTimeoverTimer(timeover_wait)
    {
        this.is_timeover = false;
        const timeover_promise = new Promise(async (resolve, reject) => {

            this.timeover_resolve = resolve; //정답 맞췄을 시, 이 resolve를 호출해서 promise 취소할거임
            this.timeover_timer = await setTimeout(() => {

                console.log("timeout_log_timeover_timer");
                this.is_timeover = true; 
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
            let fade_out_duration = SYSTEM_CONFIG.fade_out_duration;
            const fade_in_left_time = (Date.now() - (fade_in_end_time ?? 0)) * -1;
            if(fade_in_left_time > 0) //아직 fade_in이 안끝났다면
            {
                fade_out_duration = SYSTEM_CONFIG.correct_answer_cycle_wait - fade_in_left_time - 1000; //fadeout duration 재계산, 1000ms는 padding
                console.log(`fade_in_left_time: ${fade_in_left_time}`);
                console.log(`fade_out_duration: ${fade_out_duration}`);
                if(fade_out_duration > 1000) //남은 시간이 너무 짧으면 걍 패스
                {
                    this.current_quiz['fade_out_timer'] = setTimeout(() => {
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
            this.buttonCommand(interaction);
        }
    }

    async handleChatInputCommand(interaction)
    {
        if(interaction.commandName === '답') {
    
            let submit_answer = interaction.options.getString('답안') ?? '';
            if(submit_answer == '') return;
            submit_answer = submit_answer.trim().replace(/ /g, '').toLowerCase();
            
            if(this.answers.includes(submit_answer))
            {
                this.submittedCorrectAnswer(interaction.member);
                let message = "```" + `${interaction.member.displayName}: [ ${submit_answer} ]... 정답입니다!` + "```"
                interaction.reply({content: message})
                .catch(error => {
                    console.log(`Failed to replay to correct submit ${error}`);
                });
            }
            else
            {
                let message = "```" + `${interaction.member.displayName}: [ ${submit_answer} ]... 오답입니다!` + "```"
                interaction.reply({content: message})
                .catch(error => {
                    console.log(`Failed to replay to wrong submit ${error}`);
                });;
            }
        
            return;
        }
    }

    async buttonCommand(interaction)
    {
        const option_data = this.quiz_session.option_data;
        const current_quiz = this.current_quiz;
        if(current_quiz == undefined) 
        {
            return;
        }

        if(interaction.customId === 'hint') 
        {
            if(current_quiz['hint_used'] == true) //2중 체크
            {
                return;
            }

            if(option_data.quiz.hint.type == OPTION_TYPE.HINT_TYPE.OWNER) //주최자만 hint 사용 가능하면
            {
                if(interaction.member == this.quiz_session.owner)
                {
                    this.showHint(current_quiz);
                    return;
                }
                const reject_message = '```' + `${text_contents.quiz_play_ui.only_owner_can_use_hint}` +'```'
                interaction.channel.send({content: reject_message});
            }
            else if(option_data.quiz.hint.type == OPTION_TYPE.HINT_TYPE.VOTE)
            {
                const voice_channel = this.quiz_session.voice_channel;
                const vote_criteria = parseInt((voice_channel.members.size - 2) / 2) + 1; 

                let current_hint_vote_count = 0;
                if(current_quiz['hint_vote_count'] == undefined)
                {
                    current_hint_vote_count = 1;
                }
                else 
                {
                    current_hint_vote_count = current_quiz['hint_vote_count'] + 1;
                }
                current_quiz['hint_vote_count'] = current_hint_vote_count;

                let hint_vote_message = text_contents.quiz_play_ui.hint_vote;
                hint_vote_message = hint_vote_message.replace("${who_voted}", interaction.member.displayName);
                hint_vote_message = hint_vote_message.replace("${current_vote_count}", current_hint_vote_count);
                hint_vote_message = hint_vote_message.replace("${vote_criteria}", vote_criteria);
                interaction.channel.send({content: hint_vote_message});
                if(current_hint_vote_count >= vote_criteria)
                {
                    this.showHint(current_quiz);
                }

            }
            return;
        }

        if(interaction.customId === 'skip') 
        {
            if(current_quiz['skip_used'] == true) //2중 체크
            {
                return;
            }

            if(option_data.quiz.skip.type == OPTION_TYPE.SKIP_TYPE.OWNER) //주최자만 skip 사용 가능하면
            {
                if(interaction.member == this.quiz_session.owner)
                {
                    this.skip(this.current_quiz);
                    return;
                }
                const reject_message = '```' + `${text_contents.quiz_play_ui.only_owner_can_use_skip}` +'```'
                interaction.channel.send({content: reject_message});
            }
            else if(option_data.quiz.skip.type == OPTION_TYPE.SKIP_TYPE.VOTE)
            {
                const voice_channel = this.quiz_session.voice_channel;
                const vote_criteria = parseInt((voice_channel.members.size - 2) / 2) + 1; 

                let current_skip_vote_count = 0;
                if(current_quiz['skip_vote_count'] == undefined)
                {
                    current_skip_vote_count = 1;
                }
                else
                {
                    current_skip_vote_count = current_quiz['skip_vote_count'] + 1;
                }
                current_quiz['skip_vote_count'] = current_skip_vote_count;

                let skip_vote_message = text_contents.quiz_play_ui.skip_vote;
                skip_vote_message = skip_vote_message.replace("${who_voted}", interaction.member.displayName);
                skip_vote_message = skip_vote_message.replace("${current_vote_count}", current_skip_vote_count);
                skip_vote_message = skip_vote_message.replace("${vote_criteria}", vote_criteria);
                interaction.channel.send({content: skip_vote_message});

                if(current_skip_vote_count >= vote_criteria)
                {
                    this.skip(current_quiz);
                }
            }
            return;
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

        const current_quiz = this.current_quiz;
        if(current_quiz == undefined || this.next_cycle == CYCLE_TYPE.ENDING) //제출할 퀴즈가 없으면 패스
        {
            return;
        }

        game_data['processing_quiz'] = this.current_quiz; //현재 제출 중인 퀴즈

        this.answers = current_quiz['answers'];
        const quiz_type = current_quiz['type'];
        const question = current_quiz['question'];

        console.log(`questioning ${question}`);

        //오디오 재생 부
        const audio_player = this.quiz_session.audio_player;
        const resource = current_quiz['audio_resource'];
        const audio_play_time = current_quiz['audio_length'] ?? option_data.quiz.audio_play_time;

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
            if(this.current_quiz['answer_user'] != undefined) //정답자가 있다?
            {
                this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~
            }
            else if(this.current_quiz['skip_used'] == true) //스킵이다?
            {
                this.next_cycle = CYCLE_TYPE.TIMEOVER; //그럼 타임오버로~
            }

            this.gracefulAudioExit(audio_player, resource, fade_in_end_time); //타이머가 제 시간에 끝난게 아니라 오디오 재생이 남아있으니 부드러운 오디오 종료 진행
        }
        else //타임오버거나 정답자 없다면
        {
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
        channel.send({content: '아직 지원하지 않는 퀴즈 타입입니다.'})
    }
}

//#endregion

//#region Timeover Cycle
/** 문제 못 맞춰서 Timeover 일 떄 **/
class TimeOver extends QuizLifeCycleScoreboarding
{
    static cycle_type = CYCLE_TYPE.TIMEOVER;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_cycle = CYCLE_TYPE.QUESTIONING;
    }

    async enter()
    {
        //정답 표시
        const quiz_data = this.quiz_session.quiz_data;
        const game_data = this.quiz_session.game_data;
        const processing_quiz = game_data['processing_quiz'];

        let quiz_ui = this.quiz_session.quiz_ui;

        quiz_ui.embed.color = 0X850000;

        quiz_ui.embed.title = text_contents.timeover_ui.title;

        let description_message = text_contents.timeover_ui.description;
        let answer_list_message = '';
        const answers = processing_quiz['answers'];
        answers.forEach((answer) => {
            answer_list_message += answer + "\n";
        });
        let author_list_message = '';
        const author_list = processing_quiz['author'];
        author_list.forEach((author) => {
            author_list_message += author + "\n";
        });
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

        quiz_ui.send(false, false);
    }

    async act()
    {
        const game_data = this.quiz_session.game_data;
        const processing_quiz = game_data['processing_quiz'];
        if(processing_quiz['skip_used'] == false) //스킵으로 넘어온게 아니면
        {
            utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.FAIL); //bgm 재생
        }
        const wait_time = SYSTEM_CONFIG.timeover_cycle_wait; //정답 얼마동안 보여줄 지
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                console.log("timeout_log_timeover_wait");
                resolve();
            }, wait_time);
        });
    }

    async exit()
    {
        let quiz_ui = this.quiz_session.quiz_ui;
        quiz_ui.delete();
    }
}

//#endregion

//#region CorrectAnswer Cycle
/** Question 상태에서 정답 맞췄을 때 **/
class CorrectAnswer extends QuizLifeCycleScoreboarding
{
    static cycle_type = CYCLE_TYPE.CORRECTANSWER;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_cycle = CYCLE_TYPE.QUESTIONING;
    }

    async enter()
    {
        //정답자 표시
        const quiz_data = this.quiz_session.quiz_data;
        const game_data = this.quiz_session.game_data;
        const processing_quiz = game_data['processing_quiz'];
        const answer_user = processing_quiz['answer_user'];
        let answer_user_nickname = "???";
        if(answer_user != undefined)
        {
            answer_user_nickname = answer_user.displayName;
        }

        let quiz_ui = this.quiz_session.quiz_ui;

        quiz_ui.embed.color = 0x54B435;

        quiz_ui.embed.title = text_contents.correct_answer_ui.title;

        let description_message = text_contents.correct_answer_ui.description;
        let answer_list_message = '';
        const answers = processing_quiz['answers'];
        answers.forEach((answer) => {
            answer_list_message += answer + "\n";
        });
        let author_list_message = '';
        const author_list = processing_quiz['author'];
        author_list.forEach((author) => {
            author_list_message += author + "\n";
        });
        description_message = description_message.replace('${answer_username}', answer_user_nickname); //정답 ui은 이거 추가됏음
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

        quiz_ui.send(false, false);
    }

    async act()
    {
        const wait_time = SYSTEM_CONFIG.correct_answer_cycle_wait; //정답 얼마동안 보여줄 지
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                console.log("timeout_log_correct_answer_wait");
                resolve();
            }, wait_time);
        });
    }

    async exit()
    {
        let quiz_ui = this.quiz_session.quiz_ui;
        quiz_ui.delete();
    }

}

//#endregion

//#region Ending Cycle
/** 점수 공개 **/
class Ending extends QuizLifeCycleScoreboarding
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
        quiz_ui.embed.description = `${quiz_data['icon']}${quiz_data['title']}\n\u1CBC\n\u1CBC\n`;
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
        this.cannot_block = true; //FINISH Cycle은 막을 수가 없다.
    }

    async act()
    {
        const audio_player = this.quiz_session.audio_player;
        if(audio_player != undefined)
        {
            audio_player.stop();
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
        delete guild_session_map[guild_id];
    }
}
//#endregion