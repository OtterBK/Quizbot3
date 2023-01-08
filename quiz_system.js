'use strict';

//외부 모듈 로드
const fs = require('fs');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType } = require('@discordjs/voice');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');

//로컬 모듈 로드
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE, EXPLAIN_TYPE, BGM_TYPE } = require('./system_setting.js');
const text_contents = require('./text_contents.json')[SYSTEM_CONFIG.language]; 
const utility = require('./utility.js');
const { config } = require('process');

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

/** global 변수 **/
let guild_session_map = {};


/** exports **/
exports.checkReadyForStartQuiz = (guild, owner) => 
{
    let result = false;
    let reason = '';
    if(!owner.voice.channel) //음성 채널 참가 중인 사람만 시작 가능
    {
        //TODO 음성 채널 들어가서 하라고 알림
        reason = '음성채널참가';
        return { 'result': result, 'reason': reason };
    }

    if(this.getQuizSession(guild.id) != undefined)
    {
        //TODO 이미 게임 진행 중이라고 알림
        reason = '이미 진행중';
        return { 'result': result, 'reason': reason };
    }

    result = true;
    reason = "플레이 가능";
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


/***************************/

//퀴즈 플레이에 사용될 UI
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
      .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('skip')
        .setLabel('스킵')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('quiz_stop')
        .setLabel('그만하기')
        .setStyle(ButtonStyle.Danger),
    )

    this.components = [ ];
  }

  async send(previous_delete)
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
        this.ui_instance = ui_instance;
    })
    .catch(err => {
        console.log(`Failed Send QuizPlayUI: ${err.message}`);
    });
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

}


//퀴즈 게임용 세션
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

        this.scoreboard = new Map(); //scoreboard 

        //퀴즈 타입에 따라 cycle을 다른걸 넣어주면된다.
        //기본 LifeCycle 동작은 다음과 같다
        //Initializing ->
        //EXPLAIN ->
        //Prepare -> if quiz_finish Ending else -> Questioning
        //Questioning ->
        //(CorrectAnswer 또는 Timeover) -> Questioning
        this.inputLifeCycle(CYCLE_TYPE.INITIALIZING, new Initializing(this));
        this.inputLifeCycle(CYCLE_TYPE.EXPLAIN, new Explain(this));
        this.inputLifeCycle(CYCLE_TYPE.PREPARE, new Prepare(this));
        this.inputLifeCycle(CYCLE_TYPE.QUESTIONING, new Questioning(this));
        this.inputLifeCycle(CYCLE_TYPE.CORRECTANSWER, new CorrectAnswer(this));
        this.inputLifeCycle(CYCLE_TYPE.TIMEOVER, new TimeOver(this));
        this.inputLifeCycle(CYCLE_TYPE.ENDING, new Ending(this));
        this.inputLifeCycle(CYCLE_TYPE.FINISH, new Finish(this));
        

        this.cycleLoop();
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
            //TODO initializing 누락 에러
            return;
        }
        this.current_cycle_type = cycle_type;
        target_cycle.do();
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

//퀴즈 cycle 용 lifecycle
class QuizLifecycle
{
    static cycle_type = CYCLE_TYPE.UNDEFINED;

    constructor(quiz_session)
    {
        this.quiz_session = quiz_session;
        this.next_cycle = CYCLE_TYPE.UNDEFINED;
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
        if(this.enter != undefined) 
        {
            const goNext = (await this.enter()) ?? true;
            if(goNext == false) return;
        }
        this._act();
    }

    async _act() //Cycle 의 act
    {
        if(this.act != undefined) 
        {
            const goNext = (await this.act()) ?? true;
            if(goNext == false) return;
        }
        this._exit();
    }

    async _exit() //Cycle 끝낼 때
    {
        if(this.exit != undefined) 
        {
            const goNext = (await this.exit()) ?? true;
            if(goNext == false) return;
        }

        if(this.next_cycle == CYCLE_TYPE.UNDEFINED) //다음 Lifecycle로
        {
            //TODO UNDEFINED Cycle 에러
            return;
        }        
        this.quiz_session.goToCycle(this.next_cycle);
    }

    //공통 함수
    //스코어보드 fields 가져오기
    getScoreboardFields()
    {
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

            const show_count = SYSTEM_CONFIG.scoreboard_show_max == -1 ? scoreboard.size : SYSTEM_CONFIG.scoreboard_show_max;

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

    //이벤트 처리(비동기로 해도 무방)
    async on(event_name, event_object)
    {
        switch(event_name) 
        {
          case CUSTOM_EVENT_TYPE.interactionCreate:
            return this.onInteractionCreate(event_object);
        }
    }

    /** 커스텀 이벤트 핸들러 **/
    onInteractionCreate(interaction)
    {

    }
}

//처음 초기화 시
class Initializing extends QuizLifecycle
{
    static cycle_type = CYCLE_TYPE.INITIALIZING;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_cycle = CYCLE_TYPE.EXPLAIN;
    }

    async enter()
    {
        const voice_channel = this.quiz_session.voice_channel;
        const guild = this.quiz_session.guild;

        const voice_connection = joinVoiceChannel({
            channelId: voice_channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
        }); //보이스 커넥션

        const audio_player = createAudioPlayer();
        voice_connection.subscribe(audio_player);

        this.quiz_session.voice_connection = voice_connection;
        this.quiz_session.audio_player = audio_player;
    }

    async act()
    {
        let quiz_ui = new QuizPlayUI(this.quiz_session.channel);
        await quiz_ui.send(true); //처음에는 기다려줘야한다. 안그러면 explain 단계에서 update할 ui가 없어서 안됨
        this.quiz_session.quiz_ui = quiz_ui;


        //우선 quiz_info 에서 필요한 내용만 좀 뽑아보자
        const quiz_info = this.quiz_session.quiz_info;

        let quiz_data = {};
        quiz_data['title'] = quiz_info['title'];
        quiz_data['description'] = quiz_info['description'];
        quiz_data['author'] = quiz_info['author'];
        quiz_data['quiz_type'] = quiz_info['quiz_type'];
        quiz_data['quiz_size'] = quiz_info['quiz_size'];
        quiz_data['thumbnail'] = quiz_info['thumbnail'];
        quiz_data['winner_nickname'] = quiz_info['winner_nickname'];

        //실제 퀴즈들 로드
        let quiz_path = quiz_info['quiz_path']; //Dev 퀴즈, 개발자 퀴즈면은 quiz_path 값이 있다.
        let quiz_id = quiz_info['quiz_id']; //유저 제작 퀴즈면 quiz_id 값이 있다.
        if(quiz_path == undefined && quiz_id == undefined) //엥? 근데 둘다 없다?
        {
            //TODO 뭔가가...잘못됐다는 메시지
            return;
        }

        let quiz_list = [];
        if(quiz_path != undefined) //Dev 퀴즈일 경우
        {
            //TODO 아 인트로 퀴즈도 있고 그림퀴즈도 있고 쨋든 종류가 많은데, 너무 예전이라 기억이 안난다. 우선 노래 퀴즈 중점으로 만들고 고치자
            const quiz_folder_list = fs.readdirSync(quiz_path); //TODO 여기도 그냥 정적으로 읽어올까..?
            
            quiz_folder_list.forEach(quiz_folder_name => {
                
                if(quiz_folder_name.includes(".txt")) return;

                let quiz = {};

                quiz['type'] = quiz_data['quiz_type'];

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

                let answers = [];
                answers_row.forEach((answer_row) => {

                    answer_row = answer_row.trim()

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
                        if(answers.includes(similar_answer) == false)
                            answers.push(similar_answer);
                    }
                    
                    const answer = answer_row.replace(/ /g,"").toLowerCase(); // /문자/gi 로 replace하면 replaceAll 로 동작, g = 전역검색 i = 대소문자 미구분
                    if(answers.includes(answer) == false)
                            answers.push(answer);
                });

                quiz['answers'] = answers;
                
                const quiz_folder_path = quiz_path + "/" + quiz_folder_name + "/";
                const quiz_file_list = fs.readdirSync(quiz_folder_path);
                quiz_file_list.forEach(quiz_folder_filename => {
                    if(quiz_folder_filename.includes("&^")) //TODO 내가 정답 우선순위를 폴더명 기준으로 했는지, 노래파일 기준으로 했는지 기억이 안난다. 확인하고 처리할 것
                    {

                    }
                    quiz['question'] = quiz_folder_path + "/" + quiz_folder_filename;
                });

                quiz_list.push(quiz);
            });
        }

        quiz_list.sort(() => Math.random() - 0.5); //퀴즈 목록 무작위로 섞기
        quiz_data['quiz_list'] = quiz_list;
        quiz_data['quiz_size'] = quiz_list.length; //퀴즈 수 재정의 하자

        this.quiz_session.quiz_data = quiz_data;

        this.quiz_session.game_data = {
                'question_num': -1, //현재 내야하는 문제번호
                'scoreboard': {}, //점수표
                'ranking_list': [], //순위표
                'prepared_quiz_queue': [], //PREPARE Cycle을 거친 퀴즈 큐
        };
    }

    async exit()
    {
        this.asyncCallCycle(CYCLE_TYPE.PREPARE); //미리 문제 준비
    }
}

//게임 방식 설명하는 단계
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

//퀴즈 내기 전, 퀴즈 준비
class Prepare extends QuizLifecycle
{
    static cycle_type = CYCLE_TYPE.PREPARE;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_cycle = CYCLE_TYPE.UNDEFINED;
    }

    async enter()
    {

    }

    async act()
    {
        //다음에 문제낼 퀴즈 꺼내기
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        const quiz_size = quiz_data['quiz_size'];
        let question_num = game_data['question_num'] + 1;

        if(question_num >= quiz_size) //모든 퀴즈 제출됐음
        {
            return; //더 이상 준비할 게 없으니 return
        }

        game_data['question_num'] = question_num;

        let target_quiz = quiz_data.quiz_list[question_num];

        const quiz_type = target_quiz['type'];

        if(
               quiz_type == QUIZ_TYPE.SONG
            || quiz_type == QUIZ_TYPE.INTRO
        )   
        {
            try{
                await this.prepareAudio(target_quiz);
            }catch(error)
            {
                console.log(`Failed Prepare Audio[${target_quiz['question']}]: ${error.message}`);
            }
        }

        game_data.prepared_quiz_queue.push(target_quiz);

        console.log(`prepared ${question_num}`);
    }

    async prepareAudio(target_quiz)
    {
        const question = target_quiz['question'];

        //오디오 정보 가져오기
        const audio_play_time = 20000; //TODO 서버 설정 값 사용하자

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

        console.log(`audio cut start: ${audio_start_point/audio_byterate} end: ${audio_end_point/audio_byterate}`);
        audio_stream = fs.createReadStream(question, {flags:'r', start: audio_start_point, end: audio_end_point ?? Infinity});
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
        if(config.use_inline_volume == false || true) //Inline volume 옵션 켜면 의미 없음
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

//퀴즈 내는 단계, 여기가 제일 처리할게 많다.
class Questioning extends QuizLifecycle
{
    static cycle_type = CYCLE_TYPE.QUESTIONING;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_cycle = CYCLE_TYPE.TIMEOVER;

        this.current_quiz = undefined; //현재 진행 중인 퀴즈

        this.timeover_timer = undefined; //타임오버 timer id
        this.timeover_resolve = undefined; //정답 맞췄을 시 강제로 타임오버 대기 취소
        this.fade_out_timer = undefined;

        this.skip_prepare_cycle = false; //마지막 문제라면 더 이상 prepare 할 필요없음
        this.progress_bar_timer = undefined; //진행 bar
        this.answers = undefined; //문제 정답 목록
    }

    async enter()
    {
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        if(game_data['question_num'] >= quiz_data['quiz_size']) //모든 퀴즈 제출됐음
        {
            this.next_cycle = CYCLE_TYPE.ENDING;
            this.skip_prepare_cycle = true;
            this.current_quiz = undefined;
            console.log("finished quiz");
            return; //더 이상 진행할 게 없다.
        }

        //진행 UI 관련
        let quiz_ui = await this.createUI();
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
                //TODO 뭔가 잘못됐다고 알림
                break;
            }

            await new Promise((resolve, reject) => setTimeout(() => {
                console.log("timeout_log_check_prepared_queue");
                ++current_check_prepared_queue;
                resolve();
            }, SYSTEM_CONFIG.prepared_queue_check_interval));
        }
        
        this.current_quiz = game_data.prepared_quiz_queue.shift(); //하나 꺼내오자
        this.quiz_session.audio_player.stop(); //시작 전엔 audio stop 걸고 가자
        utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.ROUND_ALARM);
        

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
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;
        let quiz_ui = this.quiz_session.quiz_ui;

        const current_quiz = this.current_quiz;
        if(current_quiz == undefined || this.next_cycle == CYCLE_TYPE.ENDING) //제출할 퀴즈가 없으면 패스
        {
            return;
        }

        game_data['processing_quiz'] = this.current_quiz; //현재 제출 중인 퀴즈

        this.answers = current_quiz['answers'];
        
        let audio_player = this.quiz_session.audio_player;
        const quiz_type = current_quiz['type'];
        const question = current_quiz['question'];

        console.log(`questioning ${question}`);

        //오디오 재생 부
        const resource = current_quiz['audio_resource'];
        
        //비동기로 오디오 재생 시켜주고
        const fade_in_duration = SYSTEM_CONFIG.fade_in_duration;
        let fade_in_end_time = undefined; 
        if(SYSTEM_CONFIG.use_inline_volume)
        {
            fade_in_end_time = Date.now() + fade_in_duration; 
            utility.fade_audio_play(audio_player, resource, 0.1, 1.0, fade_in_duration);
        }
        else
        {
            audio_player.play(resource); 
        }

        //제한시간 동안 대기
        let audio_play_time = current_quiz['audio_length'] ?? 20000; //TODO 서버별 설정값 가져오는 걸로

        if(SYSTEM_CONFIG.use_inline_volume)
        {
            const fade_out_duration = SYSTEM_CONFIG.fade_out_duration;
            const fade_out_start_offset = audio_play_time - fade_out_duration - 1000; //해당 지점부터 fade_out 시작, 부드럽게 1초 정도 간격두자
            if(fade_out_start_offset < fade_in_duration)
            {
                fade_out_start_offset = fade_in_start_time;
            }

            //일정시간 후에 fadeout 시작
            const fade_out_timer = setTimeout(() => {
                console.log("timeout_log_start_fade_out");
                utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, fade_out_duration);
            }, fade_out_start_offset);

            this.fade_out_timer = fade_out_timer;
        }

        this.startProgressBar(audio_play_time);

        let is_timeover = false;
        const timeover_promise = new Promise(async (resolve, reject) => {

            this.timeover_resolve = resolve; //정답 맞췄을 시, 이 resolve를 호출해서 promise 취소할거임
            this.timeover_timer = await setTimeout(() => {

                console.log("timeout_log_timeover_timer");
                is_timeover = true; 
                resolve('done timeover timer');

            }, audio_play_time);
        });

        await Promise.race([timeover_promise]); //race로 돌려서 Promise가 끝나는걸 기다림

        //타이머가 끝났다.
        if(is_timeover == false && this.current_quiz['answer_user'] != undefined) //그런데 타임오버도 아니고 정답자도 있는거다
        {
            this.next_cycle = CYCLE_TYPE.CORRECTANSWER; //그럼 정답으로~

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
                            utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, fade_out_duration);
                        }, fade_in_left_time); //fade_in 끝나면 호출되도록
                    }
                }
                else
                {
                    utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, fade_out_duration);
                }
            }
        }
        else //타임오버거나 정답자 없다면
        {
            this.next_cycle = CYCLE_TYPE.TIMEOVER; //타임오버로
        }
    }

    exit()
    {
        if(this.skip_prepare_cycle == false)
        {
            this.asyncCallCycle(CYCLE_TYPE.PREPARE); //다음 문제 미리 준비
        }

        if(this.progress_bar_timer != undefined)
        {
            clearInterval(this.progress_bar_timer);
        }
    }

    //UI관련
    async createUI()
    {
        let quiz_info = this.quiz_session.quiz_info;
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;
        const quiz_ui = this.quiz_session.quiz_ui;

        quiz_ui.embed.color = 0xFED049;

        quiz_ui.embed.title = `[\u1CBC${quiz_info['icon']}${quiz_data['title']}\u1CBC]`;
        
        let footer_message = text_contents.quiz_play_ui.footer;
        footer_message = footer_message.replace("${quiz_question_num}", `${(game_data['question_num']+1)}`);
        footer_message = footer_message.replace("${quiz_size}", `${(quiz_data['quiz_size'])}`);
        footer_message = footer_message.replace("${option_hint_type}", `투표`); //TODO 옵션 만들면 적용
        footer_message = footer_message.replace("${option_skip_type}", `투표`);
        quiz_ui.embed.footer = {
            "text": footer_message,
        }
        let description_message = text_contents.quiz_play_ui.description;
        description_message = description_message.replace("${quiz_question_num}", `${(game_data['question_num']+1)}`);
        quiz_ui.embed.description = description_message;

        quiz_ui.components = [quiz_ui.quiz_play_comp];

        quiz_ui.embed.fields = [];

        await quiz_ui.send(false);

        return quiz_ui;
    }

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

            quiz_ui.embed.description = `\u1CBC\n\u1CBC\n🕛\u1CBC**${progress_bar_string}**\n\u1CBC\n\u1CBC\n`;
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
            
            clearTimeout(this.timeover_timer); //타임오버 타이머 중지
            if(this.fade_out_timer != undefined)
            {
                clearTimeout(this.fade_out_timer); //fadeout timer 중지
            }
            this.timeover_resolve('Submitted correct Answer'); //Promise await 취소

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

    /** 이벤트 핸들러 **/
    onInteractionCreate(interaction)
    {
        if(interaction.commandName === '답') {
    
            let submit_answer = interaction.options.getString('답안') ?? '';
            if(submit_answer == '') return;
            submit_answer = submit_answer.trim().replace(/ /g, '').toLowerCase();
            
            if(this.answers.includes(submit_answer))
            {
                this.submittedCorrectAnswer(interaction.member);
                let message = "```" + interaction.member.displayName + ": [" + submit_answer + "]... 정답입니다!```"
                interaction.reply({content: message})
                .catch(error => {
                    console.log(`Failed to replay to correct submit ${error}`);
                });
            }
            else
            {
                let message = "```" + interaction.member.displayName + ": [" + submit_answer + "]... 땡입니다!```"
                interaction.reply({content: message})
                .catch(error => {
                    console.log(`Failed to replay to wrong submit ${error}`);
                });;
            }
        
            return;
        }
    }
}

//문제 못 맞춰서 Timeover 일 떄
class TimeOver extends QuizLifecycle
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

        quiz_ui.send(true);
    }

    async act()
    {
        utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.FAIL);
        const wait_time = SYSTEM_CONFIG.timeover_cycle_wait; //정답 얼마동안 보여줄 지
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                console.log("timeout_log_timeover_wait");
                resolve();
            }, wait_time);
        });
    }
}

//Questioning 상태에서 정답 맞췄을 때
class CorrectAnswer extends QuizLifecycle
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

        quiz_ui.send(true);
    }

    async act()
    {
        //TODO 정답자 표시

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

    }

}

//점수 공개
class Ending extends QuizLifecycle
{
    static cycle_type = CYCLE_TYPE.ENDING;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_cycle = CYCLE_TYPE.FINISH;
    }

    async act()
    {
        const quiz_info = this.quiz_session.quiz_info;
        const quiz_data = this.quiz_session.quiz_data;
        const quiz_type = ['quiz_type'];
        let quiz_ui = this.quiz_session.quiz_ui;

        quiz_ui.embed.color = 0xFED049,

        quiz_ui.embed.title = text_contents.ending_ui.title;
        quiz_ui.embed.description = `${quiz_info['icon']}${quiz_data['title']}\n\u1CBC\n\u1CBC\n`;
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
            top_score_description_message = top_score_description_message.replace('${winner_nickname}', quiz_info['winner_nickname']);
            top_score_description_message = top_score_description_message.replace('${winner_username}', winner_member.displayName);
            quiz_ui.embed.description += top_score_description_message;
        }
        
        utility.playBGM(this.quiz_session.audio_player, BGM_TYPE.ENDING);
        quiz_ui.update();
        await utility.sleep(SYSTEM_CONFIG.ending_wait); 
    }
}

//Quiz session 종료
class Finish extends QuizLifecycle
{
    static cycle_type = CYCLE_TYPE.FINISH;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_cycle = CYCLE_TYPE.UNDEFINED;
    }

    async act()
    {
        const voice_connection = this.quiz_session.voice_connection;
        voice_connection.disconnect();
    }

    async exit()
    {
        const guild_id = this.quiz_session.guild_id;
        delete guild_session_map[guild_id];
    }
}