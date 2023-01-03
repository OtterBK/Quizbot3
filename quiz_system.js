//외부 모듈 로드
const fs = require('fs');
const { joinVoiceChannel, createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType } = require('@discordjs/voice');

//로컬 모듈 로드
const text_contents = require('./text_contents.json')["kor"]; //한국어로 가져와서 사용
const GAME_TYPE = require('./game_type.json');

const LIFE_CYCLE_STATE_TYPE = 
{
    'UNDEFINED': 'UNDEFINED',
    'INITIALIZING': 'INITIALIZING', //초기화 state
    'EXPLAIN': 'EXPLAIN', //게임 설명 state
    'QUESTIONING': 'QUESTIONING', //문제 제출 중
    'CORRECTANSWER': 'CORRECTANSWER', //정답 맞췄을 시
    'TIMEOVER': 'TIMEOVER', //정답 못맞추고 제한 시간 종료 시
    'CLEARING': 'CLEARING', //한 문제 끝날 때마다 호출, 음악 종료, 메시지 삭제 등
    'ENDING': 'ENDING', //점수 발표
    'FINISHED': 'FINISHED', //세션 정상 종료. 삭제 대기 중
    'FORCEFINISHED': 'FORCEFINISHED', //세션 강제 종료. 삭제 대기 중
}

let guild_session_map = [] //게임 중인 길드, 세션 map, //TODO 락 걸어줘야 하는지 확인해보자, 혹시 2에서 자주 죽은 이유가 이것..?
exports.startQuiz = (guild, owner, quiz_info, base_ui) =>
{
    if(guild_session_map.hasOwnProperty(guild))
    {
        //TODO 이미 게임 진행 중이라고 알림
        return;
    }

    if(!owner.voice.channel) //음성 채널 참가 중인 사람만 시작 가능
    {
        //TODO 음성 채널 들어가서 하라고 알림
        return;
    }

    guild_session_map[guild] = new QuizSession(guild, owner, quiz_info, base_ui);
}

//퀴즈 게임용 세션
class QuizSession
{
    constructor(guild, owner, quiz_info, base_ui)
    {
        this.guild = guild;
        this.owner = owner;
        this.voice_channel = owner.voice.channel;

        this.guild_id = guild.id;
        this.quiz_info = quiz_info;
        this.base_ui = base_ui;

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
        //Questioning -> if quiz_finish Ending else ->
        //(CorrectAnswer 또는 Timeover) -> Questioning
        this.inputLifeCycleStates(LIFE_CYCLE_STATE_TYPE.INITIALIZING, new Initializing(this));
        this.inputLifeCycleStates(LIFE_CYCLE_STATE_TYPE.EXPLAIN, new Explain(this));
        this.inputLifeCycleStates(LIFE_CYCLE_STATE_TYPE.QUESTIONING, new Questioning(this));
        

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
        target_state.enter();
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

    enter() //처음 state 들어왔을 때
    {
        this.act();
    }

    act() //state 의 act
    {
        this.exit();
    }

    exit() //state 끝낼 때
    {
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

    act()
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
            'question_num': 0, //현재 내야하는 문제번호
            'scoreboard': {}, //점수표
            'ranking_list': [], //순위표
       };

       super.act();
    }
}

//게임 방식 설명하는 단계
class Explain extends QuizLifecycle
{
    static state_type = LIFE_CYCLE_STATE_TYPE.EXPLAIN;
    constructor(quiz_session)
    {
        super(quiz_session);
        this.next_state = LIFE_CYCLE_STATE_TYPE.QUESTIONING;
    }

    act()
    {
        //TODO 퀴즈 설명

        super.act();
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

    enter()
    {
        let quiz_data = this.quiz_session.quiz_data;
        let game_data = this.quiz_session.game_data;

        const quiz_size = quiz_data['quiz_size'];
        let question_num = game_data['question_num'] + 1;

        if(question_num >= quiz_size) //모든 퀴즈 제출됐음
        {
            this.next_state = LIFE_CYCLE_STATE_TYPE.ENDING;
        }
        else
        {
            game_data['question_num'] = question_num;
            this.current_quiz = quiz_data.quiz_list[question_num]; //TODO length체크하는 가드 코드 넣기
        }

        super.enter();
    }

    act()
    {
        const current_quiz = this.current_quiz;
        
        let audio_player = this.quiz_session.audio_player;
        const quiz_type = current_quiz['type'];
        const question = current_quiz['question'];
        
        let resource = undefined;
        if(question.endsWith('.ogg'))
        {
            resource = createAudioResource(createReadStream(question, {
                inputType: StreamType.OggOpus,
            }));
        }
        else if(question.endsWith('webm'))
        {
            resource = createAudioResource(createReadStream(question, {
                inputType: StreamType.WebmOpus,
            }));
        }
        else
        {
            resource = createAudioResource(question);
        }
        
        audio_player.play(resource);
    }

}