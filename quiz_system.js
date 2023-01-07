'use strict';

//외부 모듈 로드
const fs = require('fs');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType } = require('@discordjs/voice');

//로컬 모듈 로드
const { SYSTEM_CONFIG, CUSTOM_EVENT_TYPE, QUIZ_TYPE } = require('./system_setting.js');
const text_contents = require('./text_contents.json')[SYSTEM_CONFIG.language]; 
const utility = require('./utility.js');

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

exports.startQuiz = (guild, owner, quiz_info, quiz_play_ui) =>
{
    const quiz_session = new QuizSession(guild, owner, quiz_info, quiz_play_ui);
    guild_session_map[guild.id] = quiz_session;

    return quiz_session;
}

//퀴즈 게임용 세션
class QuizSession
{
    constructor(guild, owner, quiz_info, quiz_play_ui)
    {
        this.guild = guild;
        this.owner = owner;
        this.voice_channel = owner.voice.channel;

        this.guild_id = guild.id;
        this.quiz_info = quiz_info;
        this.quiz_ui = quiz_play_ui;

        this.voice_connection = joinVoiceChannel({
            channelId: this.voice_channel.id,
            guildId: this.guild.id,
            adapterCreator: this.guild.voiceAdapterCreator,
        }); //보이스 커넥션
        this.audio_player = createAudioPlayer();
        this.voice_connection.subscribe(this.audio_player);

        this.lifecycle_map = {};
        this.current_cycle_type = CYCLE_TYPE.UNDEFINED;

        this.quiz_data = undefined;
        this.game_data = undefined;

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
        

        this.cycleLoop();
    }

    inputLifeCycle(cycle_type, cycle)
    {
        this.lifecycle_map[cycle_type] = cycle;
    }

    cycleLoop()
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
        this.next_cycle_type = CYCLE_TYPE.UNDEFINED;
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

    async act()
    {
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
                }

                if(similar_answer != '')
                {
                    if(answers.includes(similar_answer) == false)
                        answers.push(similar_answer);
                }
                
                const answer = answer_row.replace(/ /g,""); // /문자/gi 로 replace하면 replaceAll 로 동작, g = 전역검색 i = 대소문자 미구분
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
        //TODO 퀴즈 설명
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
        let audio_player = this.quiz_session.audio_player;
        audio_player.stop(); //무조건 stop 상태에서 시작
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
            await this.prepareAudio(target_quiz);
        }

        game_data.prepared_quiz_queue.push(target_quiz);

        console.log(`prepared ${question_num}`);
    }

    async prepareAudio(target_quiz)
    {
        const question = target_quiz['question'];

        //오디오 길이 미리 파싱
        const audio_length = await utility.getAudioLength(question) * 1000;
        target_quiz['audio_length'] = audio_length;

        //오디오 스트림 미리 생성
        const audio_stream = fs.createReadStream(question, {flags:'r'});

        let resource = undefined;
        if(question.endsWith('.ogg')) //ogg
        {
            resource = createAudioResource(audio_stream, {
                inputType: StreamType.OggOpus,
                inlineVolume: SYSTEM_CONFIG.use_inline_volume,
            });
        }
        // else if(question.endsWith('webm')) //webm
        //굳이 webm 또는 ogg 파일이 아니더라도 Opuse 형식으로 변환하는 것이 더 좋은 성능을 나타낸다고함
        //(Discord에서 스트리밍 가능하게 변환해주기 위해 FFMPEG 프로세스가 계속 올라와있는데 Opus 로 변환하면 이 과정이 필요없음)
        else 
        {
            resource = createAudioResource(audio_stream, {
                inputType: StreamType.WebmOpus,
                inlineVolume: SYSTEM_CONFIG.use_inline_volume,
            });
        }
        // else //mp3 or wav
        // {
        //     resource = createAudioResource(audio_stream, {
        //         inputType: StreamType.Arbitrary,
        //     });
        // }

        if(SYSTEM_CONFIG.use_inline_volume)
        {
            resource.volume.setVolume(0);
        }
        else
        {
            resource.volume.setVolume(1);
        }

        target_quiz['audio_resource'] = resource;
        target_quiz['audio_stream'] = audio_stream;
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
        this.current_quiz = undefined;
        this.audio_stream = undefined;
        this.timeover_timer = undefined;
        this.skip_prepare_cycle = false;
        this.progress_bar_timer = undefined;
        this.answers = undefined;
    }

    async enter()
    {
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        if(game_data['question_num'] >= quiz_data['quiz_size']) //모든 퀴즈 제출됐음
        {
            this.next_cycle = CYCLE_TYPE.ENDING;
            this.skip_prepare_cycle = true;
            return; //더 이상 진행할 게 없다.
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
    }

    async act()
    {
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        const current_quiz = this.current_quiz;
        if(current_quiz == undefined) //제출할 퀴즈가 없으면 패스
        {
            return;
        }

        this.answers = current_quiz['answers'];
        
        let audio_player = this.quiz_session.audio_player;
        const quiz_type = current_quiz['type'];
        const question = current_quiz['question'];

        console.log(`questioning ${question}`);
        
        //주의! inline volume 옵션 사용 시, 성능 떨어짐
        //fateIn, fateOut 구현을 위해 inline volume 사용해야할 듯...

        this.audio_stream = current_quiz['audio_stream'];
        const resource = current_quiz['audio_resource'];
        
        //비동기로 오디오 재생 시켜주고
        const fade_in_duration = SYSTEM_CONFIG.fade_in_duration;
        if(SYSTEM_CONFIG.use_inline_volume)
        {
            utility.fade_audio_play(audio_player, resource, 0.1, 1.0, fade_in_duration);
        }
        else
        {
            audio_player.play(resource); //TODO 엥? 이거 async 아닌 것 같은데... 한번 확인해볼 것,  async 아니면 setTimeout으로 별도 호출하자
        }

        //제한시간 동안 대기
        let audio_play_time = 30000; //TODO 서버별 설정값 가져오는 걸로
        const audio_length = current_quiz['audio_length'];
        if(audio_length != undefined && audio_play_time < audio_length) 
        {
            audio_play_time = audio_play_time;
        }
            
        const interval_amount = 10; //10% 씩 총 10번 호출해서 진행상황을 100%로 할 거임
        const stop_audio_criteria = Date.now() + audio_play_time; //노래 언제 stop 할지

        const interval = (audio_play_time / interval_amount) - 100; //함수 오버헤드 대충 고려해서 -100ms정도?

        let current_play_time = 0;
        const current_question_num = game_data['question_num']; //현재 question number 기억


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
        }

        //진행 상황 bar, 10%마다 호출하자
        const progress_max_percentage = 10;
        const progress_bar_interval = audio_play_time / progress_max_percentage;
        let progress_percentage = 0;
        const progress_bar_timer = setInterval(() => {

            console.log("timeout_log_progress_bar");

            ++progress_percentage
            if(progress_percentage == progress_max_percentage)
            {
                clearInterval(this.progress_bar_timer);
            }

            let progress_bar_string = '';
            for(let i = 0; i < progress_max_percentage; i++)
            {
                if(i < progress_percentage)
                {
                    progress_bar_string += text_contents.icon.ICON_PROGRESS_PROGRESSED;
                }
                else
                {
                    progress_bar_string += text_contents.icon.ICON_PROGRESS_WATING;
                }
            }

        }, progress_bar_interval);

        this.progress_bar_timer = progress_bar_timer;

        //일정시간 후에 timeover로
        const timeover_timer = new Promise((resolve, reject) => {
            setTimeout(() => {
                console.log("timeout_log_timeover_timer");
                resolve('done timeover timer');
            }, audio_play_time)
        })
        .then()
        {
            //타이머가 끝났다
            if(current_quiz['answer_user'] == undefined) //정답을 맞춘 사람이 없다면
            {
                this.next_cycle_type = CYCLE_TYPE.TIMEOVER; //타임오버로 ㄱㄱ
                super.act(); //어쩔 수 없다. 직접 next  ㄱㄱ
            }
        };
        this.timeover_timer = timeover_timer;

        return false; //next 수행은 여기서 직접 하겠다고 전달

    }

    exit()
    {
        if(this.audio_stream != undefined)
        {
            this.audio_stream.close();
        }

        if(this.skip_prepare_cycle == false)
        {
            this.asyncCallCycle(CYCLE_TYPE.PREPARE); //다음 문제 미리 준비
        }

        if(this.progress_bar_timer != undefined)
        {
            clearTimeout(this.progress_bar_timer);
        }
    }

    //정답 맞췄을 때
    submittedCorrectAnswer(member)
    {
        if(this.current_quiz['answer_user'] != undefined) //이미 맞춘사람 있다면 패스
        {
            return;
        }

        if(this.timeover_timer != undefined)
        {
            this.current_quiz['answer_user'] = member;
            
            clearInterval(this.timeover_timer); //타임오버 타이머 중기
            this.next_cycle_type = CYCLE_TYPE.CORRECTANSWER;
            super.act(); //직접 next ㄱㄱ
        }
    }

    /** 이벤트 핸들러 **/
    onInteractionCreate(interaction)
    {
        if(interaction.commandName === '답') {
    
            let submit_answer = interaction.options.getString('답안');
            submit_answer = submit_answer.trim();
            
            if(this.answers.includes(submit_answer))
            {
                this.submittedCorrectAnswer(interaction.member);
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

    async act()
    {
        //다음에 문제낼 퀴즈 꺼내기
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        //TODO 타입오버는 정답 표시

        const wait_time = 6500; //정답 얼마동안 보여줄 지
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

    async act()
    {
        //다음에 문제낼 퀴즈 꺼내기
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        //바로 페이드 아웃 실행 해주고
        const fade_out_duration = SYSTEM_CONFIG.fade_out_duration;
        utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, fade_out_duration);

        //TODO 정답 표시

        const wait_time = 6500; //정답 얼마동안 보여줄 지
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                console.log("timeout_log_correct_answer_wait");
                resolve();
            }, wait_time);
        });
    }
}

//점수 공개
class Ending extends QuizLifecycle
{
    static cycle_type = CYCLE_TYPE.ENDING;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_cycle = CYCLE_TYPE.ENDING;
    }

    async act()
    {

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