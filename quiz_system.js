'use strict';

//외부 모듈 로드
const fs = require('fs');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType } = require('@discordjs/voice');

//로컬 모듈 로드
const { config } = require('./GAME_CONFIG.js');
const text_contents = require('./text_contents.json')[config.language]; 
const utility = require('./utility.js');
const QUIZ_TYPE = require('./QUIZ_TYPE.json');

const LIFE_CYCLE_STATE_TYPE = 
{
    'UNDEFINED': 'UNDEFINED',
    'INITIALIZING': 'INITIALIZING', //초기화 state
    'EXPLAIN': 'EXPLAIN', //게임 설명 state
    'PREPARE': 'PREPARE', //문제 제출 준비 중
    'QUESTIONING': 'QUESTIONING', //문제 제출 중
    'CORRECTANSWER': 'CORRECTANSWER', //정답 맞췄을 시
    'TIMEOVER': 'TIMEOVER', //정답 못맞추고 제한 시간 종료 시
    'CLEARING': 'CLEARING', //한 문제 끝날 때마다 호출, 음악 종료, 메시지 삭제 등
    'ENDING': 'ENDING', //점수 발표
    'FINISHED': 'FINISHED', //세션 정상 종료. 삭제 대기 중
    'FORCEFINISHED': 'FORCEFINISHED', //세션 강제 종료. 삭제 대기 중
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

    if(guild_session_map.hasOwnProperty(guild))
    {
        //TODO 이미 게임 진행 중이라고 알림
        reason = '이미 진행중'
        return { 'result': result, 'reason': reason };
    }

    result = true;
    return { 'result': result, 'reason': reason };
}

exports.startQuiz = (guild, owner, quiz_info, quiz_play_ui) =>
{
    guild_session_map[guild] = new QuizSession(guild, owner, quiz_info, quiz_play_ui);
}

exports.getSessionMap = () =>
{
    return guild_session_map;
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
        this.current_state = LIFE_CYCLE_STATE_TYPE.UNDEFINED;

        this.quiz_data = undefined;
        this.game_data = undefined;

        //퀴즈 타입에 따라 cycle을 다른걸 넣어주면된다.
        //기본 LifeCycle 동작은 다음과 같다
        //Initializing ->
        //EXPLAIN ->
        //Prepare -> if quiz_finish Ending else -> Questioning
        //Questioning ->
        //(CorrectAnswer 또는 Timeover) -> Questioning
        this.inputLifeCycleStates(LIFE_CYCLE_STATE_TYPE.INITIALIZING, new Initializing(this));
        this.inputLifeCycleStates(LIFE_CYCLE_STATE_TYPE.EXPLAIN, new Explain(this));
        this.inputLifeCycleStates(LIFE_CYCLE_STATE_TYPE.PREPARE, new Prepare(this));
        this.inputLifeCycleStates(LIFE_CYCLE_STATE_TYPE.QUESTIONING, new Questioning(this));
        this.inputLifeCycleStates(LIFE_CYCLE_STATE_TYPE.CORRECTANSWER, new CorrectAnswer(this));
        this.inputLifeCycleStates(LIFE_CYCLE_STATE_TYPE.TIMEOVER, new TimeOver(this));
        

        this.stateLoop();
    }

    inputLifeCycleStates(state_type, lifecycle_state)
    {
        this.lifecycle_map[state_type] = lifecycle_state;
    }

    stateLoop()
    {
        this.goToState(LIFE_CYCLE_STATE_TYPE.INITIALIZING);
    }

    goToState(state_type)
    {
        const target_state = this.lifecycle_map[state_type];
        if(target_state == undefined)
        {
            //TODO initializing 누락 에러
            return;
        }
        this.current_state = state_type;
        target_state.do();
    }
}

//퀴즈 state 용 lifecycle
class QuizLifecycle
{
    static state_type = LIFE_CYCLE_STATE_TYPE.UNDEFINED;

    constructor(quiz_session)
    {
        this.quiz_session = quiz_session;
        this.next_state = LIFE_CYCLE_STATE_TYPE.UNDEFINED;
    }

    do()
    {
        this._enter();
    }

    async _enter() //처음 state 들어왔을 때
    {
        if(this.enter != undefined) await this.enter();
        this._act();
    }

    async _act() //state 의 act
    {
        if(this.act != undefined) await this.act();
        this._exit();
    }

    async _exit() //state 끝낼 때
    {
        if(this.exit != undefined) await this.exit();
        //다음 Lifecycle로
        if(this.next_state == LIFE_CYCLE_STATE_TYPE.UNDEFINED)
        {
            //TODO UNDEFINED STATE 에러
            return;
        }        
        this.quiz_session.goToState(this.next_state);
    }
}

//처음 초기화 시
class Initializing extends QuizLifecycle
{
    static state_type = LIFE_CYCLE_STATE_TYPE.INITIALIZING;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_state = LIFE_CYCLE_STATE_TYPE.EXPLAIN;
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

               let answer_row = undefined;
               let author_row = undefined;

               let try_parse_author =  quiz_folder_name.split("&^"); //가수는 &^로 끊었다.
               if(try_parse_author.length > 1) //가수 데이터가 있다면 넣어주기
               {
                author_row = try_parse_author[1];
                let authors = quiz_folder_name.split("&#"); //정답은 &#으로 끊었다.
                authors.forEach((author) => {
                    author = author.trim();
                })
                quiz['author'] = authors;
               }

               //정답 키워드 파싱
               answer_row = try_parse_author[0];
               answer_row = quiz_folder_name.split("&^")[0];
               let answers = quiz_folder_name.split("&#"); //정답은 &#으로 끊었다.
               answers.forEach((answer) => {
                answer = answer.trim();
               })
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
       };
    }
}

//게임 방식 설명하는 단계
class Explain extends QuizLifecycle
{
    static state_type = LIFE_CYCLE_STATE_TYPE.EXPLAIN;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_state = LIFE_CYCLE_STATE_TYPE.PREPARE;
    }

    async act()
    {
        //TODO 퀴즈 설명
    }
}

//퀴즈 내기 전, 퀴즈 준비
class Prepare extends QuizLifecycle
{
    static state_type = LIFE_CYCLE_STATE_TYPE.PREPARE;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_state = LIFE_CYCLE_STATE_TYPE.QUESTIONING;
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
            this.next_state = LIFE_CYCLE_STATE_TYPE.ENDING;
            return;
        }

        game_data['question_num'] = question_num;
    }
}

//퀴즈 내는 단계, 여기가 제일 처리할게 많다.
class Questioning extends QuizLifecycle
{
    static state_type = LIFE_CYCLE_STATE_TYPE.QUESTIONING;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_state = LIFE_CYCLE_STATE_TYPE.TIMEOVER;
        this.current_quiz = undefined;
    }

    async enter()
    {
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;
        const question_num = game_data['question_num'];
        
        this.current_quiz = quiz_data.quiz_list[question_num]; //TODO length체크하는 가드 코드 넣기
    }

    async act()
    {
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        const current_quiz = this.current_quiz;
        
        let audio_player = this.quiz_session.audio_player;
        const quiz_type = current_quiz['type'];
        const question = current_quiz['question'];
        
        let resource = undefined;

        //주의! inline volume 옵션 사용 시, 성능 떨어짐
        //fateIn, fateOut 구현을 위해 inline volume 사용해야할 듯...

        const audio_stream = fs.createReadStream(question, {flags:'r'});
        const audio_length = (await getAudioDurationInSeconds(audio_stream)) * 1000;

        if(question.endsWith('.ogg')) //ogg
        {
            resource = createAudioResource(audio_stream, {
                inputType: StreamType.OggOpus,
                inlineVolume: config.use_inline_volume,
            });
        }
        // else if(question.endsWith('webm')) //webm
        //굳이 webm 또는 ogg 파일이 아니더라도 Opuse 형식으로 변환하는 것이 더 좋은 성능을 나타낸다고함
        //(Discord에서 스트리밍 가능하게 변환해주기 위해 FFMPEG 프로세스가 계속 올라와있는데 Opus 로 변환하면 이 과정이 필요없음)
        else 
        {
            resource = createAudioResource(audio_stream, {
                inputType: StreamType.WebmOpus,
                inlineVolume: config.use_inline_volume,
            });
        }
        // else //mp3 or wav
        // {
        //     resource = createAudioResource(audio_stream, {
        //         inputType: StreamType.Arbitrary,
        //     });
        // }
        
        //비동기로 오디오 재생 시켜주고
        const fade_in_duration = config.fade_in_duration;
        if(config.use_inline_volume)
        {
            utility.fade_audio_play(audio_player, resource, 0, 1.0, fade_in_duration);
        }
        else
        {
            audio_player.play(resource); //TODO 엥? 이거 async 아닌 것 같은데... 한번 확인해볼 것,  async 아니면 setTimeout으로 별도 호출하자
        }

        //제한시간 동안 대기
        const audio_play_time = 30000; //TODO 서버별 설정값 가져오는 걸로
        if(audio_play_time < audio_length) 
        {
            audio_play_time = audio_play_time;
        }
            
        const interval_amount = 10; //10% 씩 총 10번 호출해서 진행상황을 100%로 할 거임
        const stop_audio_criteria = Date.now() + audio_play_time; //노래 언제 stop 할지

        const interval = (audio_play_time / interval_amount) - 100; //함수 오버헤드 대충 고려해서 -100ms정도?

        let current_play_time = 0;
        const current_question_num = game_data['question_num']; //현재 question number 기억


        if(config.use_inline_volume)
        {
            const fade_out_duration = config.fade_out_duration;
            const fade_out_start_offset = audio_play_time - fade_out_duration - 500; //해당 지점부터 fade_out 시작, 부드럽게 0.5초 정도 간격두자
            if(fade_out_start_offset < fade_in_duration)
            {
                fade_out_start_offset = fade_in_start_time;
            }

            //일정시간 후에 fadeout 시작
            const fade_out_timer = setTimeout(() => {
                utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, fade_out_duration);
            }, fade_out_start_offset);
        }

        await new Promise((resolve, reject) => {
            const timeover_timer = setInterval(() => {
                current_play_time += interval;
                
                const current_time = Date.now();
                if(current_time >= stop_audio_criteria)
                {
                    clearInterval(timeover_timer);
                    if(current_question_num < game_data['question_num']) //이미 다음 문제로 넘어갔다면, (정답 맞추거나 스킵 등으로)
                    {
                        return; //패스~
                    }
                }
    
                //TODO 여기에 오디오 플레이 진행상황 표시
                //⏩⏩⏩⏩⬜⬜⬜⬜⬜⬜
    
            }, interval);
        });

        console.log("finish promise");
    }
}

//문제 못 맞춰서 Timeover 일 떄
class TimeOver extends QuizLifecycle
{
    static state_type = LIFE_CYCLE_STATE_TYPE.TIMEOVER;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_state = LIFE_CYCLE_STATE_TYPE.PREPARE;
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
                utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, wait_time);
            }, wait_time);
        });
    }
}

//Questioning 상태에서 정답 맞췄을 때
class CorrectAnswer extends QuizLifecycle
{
    static state_type = LIFE_CYCLE_STATE_TYPE.CORRECTANSWER;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_state = LIFE_CYCLE_STATE_TYPE.PREPARE;
    }

    async act()
    {
        //다음에 문제낼 퀴즈 꺼내기
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        //바로 페이드 아웃 실행 해주고
        const fade_out_duration = config.fade_out_duration;
        utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, fade_out_duration);

        //TODO 정답 표시

        const wait_time = 6500; //정답 얼마동안 보여줄 지
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                utility.fade_audio_play(audio_player, resource, resource.volume.volume, 0, wait_time);
            }, wait_time);
        });
    }
}
