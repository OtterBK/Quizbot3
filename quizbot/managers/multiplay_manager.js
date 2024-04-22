
//로컬 모듈 로드
const logger = require('../utility/logger.js')('MultiplayManager');
const quiz_system = require('../quiz_system.js'); //퀴즈봇 메인 시스템
// const quiz_ui = require('../quiz_ui.js'); //퀴즈봇 UI
const text_contents = require('../../config/text_contents.json')[SYSTEM_CONFIG.language]; 
const utility = require('../../utility/utility.js');

exports.createMultiplaySession = (guild, owner, channel, multiplay_session_setting) =>
{
    if(checkJoinable(guild, owner, channel) == false)
    {
        return false;
    }
    
    const multiplay_session = new MultiplaySession(guild, owner);

    //초기 입력 정보
    multiplay_session.title = multiplay_session_setting.title;
    multiplay_session.max_guild_count = multiplay_session_setting.max_guild_count;
    multiplay_session.max_question_num = multiplay_session_setting.max_question_num;

    if(multiplay_session.join(guild, owner, channel, true) == false) 
    {
        return;
    }

    return multiplay_session.lobby_ui;
}

exports.joinMultiplaySession = (guild, owner, channel, multiplay_session) =>
{
    if(checkJoinable(guild, owner, channel) == false)
    {
        return false;
    }

    if(multiplay_session.join(guild, owner, channel, true) == false) 
    {
        return;
    }

    return multiplay_session.lobby_ui;
}

const checkJoinable = (guild, owner, channel) =>
{
    const check_ready = quiz_system.checkReadyForStartQuiz(guild, owner); //퀴즈를 플레이할 준비가 됐는지(음성 채널 참가 확인 등)
    if(check_ready == undefined || check_ready.result == false)
    {
      const reason = check_ready.reason;
      let reason_message = text_contents.quiz_info_ui.failed_start;
      reason_message = reason_message.replace("${reason}", reason);
      channel.send({content: reason_message});
      return;
    }
}

class MultiplaySession //해당 세션 생성 시부터 사실 상 퀴즈 플레이 중이다. 이제 모든 이벤트와 UI를 여기서 처리한다.
{
    constructor(host_guild, host_owner, channel)
    {
        logger.info(`Creating Multiplay Session, host_id: ${host_guild.id}`);

        this.host_guild = host_guild; //호스트 길드
        this.host_owner = owner;

        this.title = undefined; //방 제목
        this.max_guild_count = undefined; //최대 인원 수
        this.current_guild_count = undefined; //현재 인원 수

        this.max_question_num = undefined; //최대 문제 수

        this.quiz_tags = { //플레이 대상 퀴즈
            "dev_quiz": [],
            "user_quiz": 0, //이건 tags value로
        };

        this.created_time = new Date();

        this.playing_guilds = //guild_id, {guild, owner, channel, quiz_sessions}
        { 

        };

        this.expired = false;

        
    }

    free()
    {
        this.lobby_ui = null;
    }

    join(guild, owner, channel, silently = false)
    {
        if(Object.keys(this.playing_guilds).includes(guild.id))
        {
            channel.send("이미 이 방에 참가 중 입니다.");
            return false;
        }

        if(this.expired)
        {
            channel.send("존재하지 않는 멀티플레이 세션입니다.");
            return false;
        }

        const guild_id = guild.id;
        this.playing_guilds[guild_id] = {}; //우선 등록

        const quiz_session = quiz_system.startQuiz(guild, owner, channel, undefined, true);
        this.playing_guilds[guild_id] = quiz_session; //suspend 세션 생성하고 등록

        this.sendLobbyUI();
        
        return true;
    }

    refreshLobbyUI = () => 
    {
        this.lobby_ui.embed = {
            color: 0x05f1f1,
            title: `**${this.title}**`,
            description: `문제 개수: ${this.max_question_num}\n퀴즈 장르: ${utility.convertTagsValueToString(this.quiz_tags['user_quiz'])}`,
            footer: {
                text: `${this.current_guild_count} / ${this.max_guild_count}`,
            }
        }
    }

}