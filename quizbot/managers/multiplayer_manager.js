'use strict';

//외부 모듈
const { messageType } = require('discord-hybrid-sharding');

//로컬 모듈
const logger = require('../../utility/logger.js')('MultiplayerManager');
const { IPC_MESSAGE_TYPE } = require('./ipc_manager.js');
const { CLIENT_SIGNAL, SERVER_SIGNAL } = require('./multiplayer_signal.js');
const db_manager = require('./db_manager.js');

const utility = require('../../utility/utility.js');

/**
 * 멀티플레이 세션 및 메시지 처리용 매니저
 */
let cluster_manager = undefined;
const multiplayer_sessions = {}; //

// Server Signals (최상위 비트를 1로 설정하여 서버 신호를 구분)

exports.initialize = (manager) =>
{
  cluster_manager = manager;
  db_manager.initialize();
};

const signalHandlers = 
{
  [CLIENT_SIGNAL.REQUEST_LOBBY_LIST]: handleRequestLobbyList,
  [CLIENT_SIGNAL.CREATE_LOBBY]: handleCreateLobby,
  [CLIENT_SIGNAL.JOIN_LOBBY]: handleJoinLobby,
  [CLIENT_SIGNAL.LEAVE_LOBBY]: handleLeaveLobby,
  [CLIENT_SIGNAL.EDIT_LOBBY]: handleEditLobby,
  [CLIENT_SIGNAL.REQUEST_KICK_PARTICIPANT]: handleRequestKick,
  [CLIENT_SIGNAL.START_LOBBY]: handleStartLobby,
  [CLIENT_SIGNAL.QUESTION_LIST_GENERATED]: handleQuestionListGenerated,
  [CLIENT_SIGNAL.SYNC_WAIT]: handleSyncWait,
  [CLIENT_SIGNAL.SYNC_FAILED]: handleSyncFailed,
  [CLIENT_SIGNAL.NEXT_QUESTION_GENERATED]: handleNextQuestionGenerated,
  [CLIENT_SIGNAL.REQUEST_HINT]: handleRequestHint,
  [CLIENT_SIGNAL.REQUEST_SKIP]: handleRequestSkip,
  [CLIENT_SIGNAL.REQUEST_ANSWER_HIT]: handleRequestAnswerHit,
  [CLIENT_SIGNAL.LEAVE_GAME]: handleLeaveGame,
  [CLIENT_SIGNAL.FINISH_UP]: handleFinishUp,
  [CLIENT_SIGNAL.FINISHED]: handleFinished,
  [CLIENT_SIGNAL.REQUEST_CHAT]: handleRequestChat,  
};

exports.onSignalReceived = (signal) => 
{
  if(isClientSignal(signal) === false)
  {
    logger.error(`Multiplayer Manager Received ${signal.signal_type} signal! this is not client signal`);
    return undefined;
  }

  if(signal.guild_id === undefined)
  {
    logger.error(`Signal ${signal.signal_type} does not have guild_id. ignore this signal`);
    return undefined;
  }

  const handler = signalHandlers[signal.signal_type];
    
  if (handler) 
  {
    return handler(signal);
  } 
  else 
  {
    logger.error(`Unknown signal type: ${signal.signal_type}`);
    return undefined;
  }
};

function isServerSignal(signal) 
{
  return (signal & 0x80) !== 0;  // 최상위 비트가 1이면 서버 시그널
}

function isClientSignal(signal) 
{
  return (signal & 0x80) === 0;  // 최상위 비트가 0이면 클라이언트 시그널
}



function handleRequestLobbyList(signal) 
{
  const guild_id = signal.guild_id;
    
  //TODO 사실 캐싱해두는게 성능상 제일 좋긴할텐데... 내가 귀찮다. 나중에 바꿔두자
  //세션이 많아봤자 얼마나 많겠는가?
  //세션 객체 자체를 넘기려고 했는데 솔직히 말이 안된다. hybrid 라이브러리가 IPC에서 객체 자체를 넘길 수 있게 해두진 않았을 것 같다.
  //통신은 무조건 json으로 하도록 하자

  let lobby_session_list = [];
  for(const session of Object.values(multiplayer_sessions))
  {
    if(session.getState() !== SESSION_STATE.LOBBY)
    {
      continue;
    }

    let simple_session_info = 
    {
      session_id: session.getSessionId(),
      participant_count: session.getParticipantCount(),
      session_name: session.getSessionName(),
      host_name: session.owner_guild_info.guild_name,
    };
        
    lobby_session_list.push(simple_session_info);
  }

  return lobby_session_list;
}

function handleCreateLobby(signal) 
{
  const guild_id = signal.guild_id;
  const guild_name = signal.guild_name;

  if(guild_id === undefined)
  {
    logger.error("Create Lobby Signal. But does not have guild_id");
    return { state: false, reason: `서버 ID가 존재하지 않습니다.` };
  }

  const quiz_info = signal.quiz_info;
  if(quiz_info === undefined)
  {
    logger.error("Create Lobby Signal. But does not have quiz info");
    return { state: false, reason: `퀴즈 정보가 존재하지 않습니다.` };
  }

  const new_multiplayer_session = new MultiplayerSession(guild_id, guild_name, quiz_info);
  new_multiplayer_session.owner_guild_info.loadStat()
    .then((result) => 
    {
      if(result)
      {
        new_multiplayer_session.sendStatLoaded();
      }
    });

  multiplayer_sessions[new_multiplayer_session.getSessionId()] = new_multiplayer_session;
  logger.info(`New multiplayer lobby has been registered ${guild_id} = ${quiz_info.title}`);

  return { state: true,  lobby_info: new_multiplayer_session.getLobbyInfo(), session_id: new_multiplayer_session.getSessionId() };
}

function handleJoinLobby(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  logger.info(`${guild_id} trying to join ${session_id}`);

  if(session === undefined)
  {
    return { state: false, reason: '더 이상 존재하지 않는 로비 세션입니다.' };
  }

  if(session.getState() !== SESSION_STATE.LOBBY)
  {
    return { state: false, reason: '대기 중인 로비가 아닙니다.' };
  }

  if(session.checkBanned(guild_id))
  {
    return { state: false, reason: '추방당한 로비엔 재입장이 불가능합니다.' };
  }

  const quiz_info = session.getQuizInfo();

  if(quiz_info === undefined)
  {
    logger.error(`${session.getSessionId} has not quiz info! cannot join this lobby`);
    return { state: false, reason: 'Unexpected Error!' };
  }

  const guild_name = signal.guild_name;

  const result = session.acceptJoinRequest(guild_id, guild_name);  
  return { state: result, lobby_info: session.getLobbyInfo(), session_id: session.getSessionId()};
}

function handleLeaveLobby(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} requests to leave ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 로비 세션입니다.` };
  }

  const result = session.acceptLeaveLobby(guild_id);
  return { state: result };
}

function handleEditLobby(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} requests to edit ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 로비 세션입니다.`};
  }

  if(signal.quiz_info === undefined)
  {
    logger.error(`${guild_id} requests to edit ${session_id}. but this signal does not have quiz info!`);
    return { state: false, reason: `퀴즈 정보가 없습니다.` };
  }

  if(session.getSessionHostId() !== guild_id)
  {
    logger.error(`${guild_id} request to edit lobby info. but session owner id is ${this.session_owner_guild_id}!`);
    return { state: false, reason: `요청 서버가 해당 로비의 호스트 서버가 아닙니다.`};
  }

  const result = session.acceptEditRequest(guild_id, signal.quiz_info);
  return { state: result };
}

function handleRequestKick(signal)
{
  const guild_id = signal.guild_id;
  const target_guild_id = signal.target_guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} requests to edit ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 로비 세션입니다.`};
  }

  if(signal.target_guild_id === undefined)
  {
    logger.error(`${guild_id} requests to edit ${session_id}. but this signal does not have quiz info!`);
    return { state: false, reason: `추방할 대상 서버의 ID값이 없습니다.` };
  }
    
  if(session.getSessionHostId() !== guild_id)
  {
    logger.error(`${guild_id} request to kick ${target_guild_id}. but that guild is not host!`);
    return { state: false, reason: `요청 서버가 해당 로비의 호스트 서버가 아닙니다.`};
  }

  if(session.getSessionHostId() === target_guild_id)
  {
    logger.debug(`${guild_id} request to kick ${target_guild_id}. but target guild is host! ignore this`);
    return { state: false, reason: `호스트 서버를 추방할 수 없습니다.`};
  }

  if(session.getParticipant(target_guild_id) === undefined)
  {
    logger.error(`${guild_id} request to kick ${target_guild_id}. but target guild id is not participant of ${session.getSessionId()}`);
    return { state: false, reason: `대상 서버가 해당 로비의 참여 중이지 않습니다.`};
  }

  const result = session.acceptKickRequest(guild_id, target_guild_id);
  return { state: result };
}

function handleStartLobby(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} requests to start ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 로비 세션입니다.`};
  }

  if(session.getSessionHostId() !== guild_id)
  {
    logger.error(`${guild_id} request to start lobby. but session owner id is ${this.session_owner_guild_id}!`);
    return { state: false, reason: `요청 서버가 해당 로비의 호스트 서버가 아닙니다.`};
  }

  if(session.getQuizInfo() === undefined)
  {
    logger.error(`${guild_id} requests to start ${session_id}. but this session's quiz info is undefined!`);
    return { state: false, reason: `해당 세션에는 퀴즈 정보가 없습니다.` };
  }

  if(session.getState() !== SESSION_STATE.LOBBY)
  {
    logger.error(`${guild_id} requests to start ${session_id}. but this session's state is ${session.getState()}!`);
    return { state: false, reason: `대기 중인 로비가 아닙니다.` };
  }

  const result = session.acceptStartRequest(guild_id);
  return { state: result };
}

function handleQuestionListGenerated(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} generated question list for ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 멀티플레이 세션입니다.`};
  }

  if(signal.question_list === undefined)
  {
    logger.error(`${guild_id} generated question list for ${session_id}. but this question list is undefined`);
    return { state: false, reason: `문제가 정상적으로 초기화되지 않았습니다.`};
  }

  if(guild_id !== session.getSessionHostId())
  {
    logger.warn(`${guild_id} generated question list for ${session_id}. but session owner id is ${this.session_owner_guild_id}!`);
  }

  const result =  session.shareQuestionList(signal.question_list, signal.quiz_size);
  return { state: result };
}

function handleSyncWait(signal)
{
  const guild_id = signal.guild_id;
  
  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} generated question list for ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 멀티플레이 세션입니다.`};
  }

  const guild_info = session.getParticipant(guild_id);
  if(guild_info === undefined)
  {
    logger.error(`${guild_id} request sync wait for ${session_id}. but this session does not include this guild`);
    return { state: false, reason: `해당 세션에 속하지 않습니다.`}; 
  }

  if(guild_info.isSyncing())
  {
    logger.error(`${guild_id} request sync wait for ${session_id}. but this guild is already syncing`);
  }

  const result =  session.acceptSyncRequest(guild_id, signal.guild_state);
  return { state: result };
}

function handleSyncFailed(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} send sync failed ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 퀴즈 세션입니다.` };
  }

  const result = session.syncFailedDetected(guild_id);
  return { state: result };
}

function handleNextQuestionGenerated(signal)
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} generated next question for ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 멀티플레이 세션입니다.`};
  }

  if(signal.question === undefined)
  {
    logger.error(`${guild_id} generated next question for ${session_id}. but this next question is undefined`);
    return { state: false, reason: `문제가 정상적으로 생성되지 않았습니다.`};
  }

  if(guild_id !== session.getSessionHostId())
  {
    logger.warn(`${guild_id} generated prepared question for ${session_id}. but session owner id is ${this.session_owner_guild_id}!`);
  }

  const result =  session.sharePreparedQuestion(signal.question, signal.question_num);
  return { state: result };
}

function handleRequestHint(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} request hint for ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 멀티플레이 세션입니다.`};
  }

  const guild_info = session.getParticipant(guild_id);
  if(guild_info === undefined)
  {
    logger.error(`${guild_id} request hint for ${session_id}. but this session does not include this guild`);
    return { state: false, reason: `해당 세션에 속하지 않습니다.`}; 
  }

  const result =  session.acceptHintRequest(guild_id);
  return { state: result };
}

function handleRequestSkip(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} request skip for ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 멀티플레이 세션입니다.`};
  }

  const guild_info = session.getParticipant(guild_id);
  if(guild_info === undefined)
  {
    logger.error(`${guild_id} request skip for ${session_id}. but this session does not include this guild`);
    return { state: false, reason: `해당 세션에 속하지 않습니다.`}; 
  }

  const result =  session.acceptSkipRequest(guild_id);
  return { state: result };
}

function handleRequestAnswerHit(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} request answer hit for ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 멀티플레이 세션입니다.`};
  }

  const guild_info = session.getParticipant(guild_id);
  if(guild_info === undefined)
  {
    logger.error(`${guild_id} request answer hit for ${session_id}. but this session does not include this guild`);
    return { state: false, reason: `해당 세션에 속하지 않습니다.`}; 
  }

  if(signal.answerer_info === undefined
      || signal.answerer_info.answerer_id === undefined
      || signal.answerer_info.answerer_name === undefined
      || signal.answerer_info.score === undefined
  )
  {
    logger.error(`${guild_id} request answer hit for ${session_id}. but this answerer info is undefined`);
    return { state: false, reason: `정답자 정보가 없거나 일부 누락되어 있습니다.`}; 
  }

  const result =  session.acceptAnswerHitRequest(guild_id, signal.answerer_info);
  return { state: result };
}

function handleLeaveGame(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} leaves game ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 퀴즈 세션입니다.` };
  }

  const result = session.acceptLeaveGame(guild_id);
  return { state: result };
}

function handleFinishUp(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} finish up ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 퀴즈 세션입니다.` };
  }

  if(session.getSessionHostId() !== guild_id)
  {
    logger.error(`${guild_id} finish up ${session.getSessionHostId()}. but ${guild_id} is not host!`);
    return { state: false, reason: `요청 서버가 해당 세션의 호스트 서버가 아닙니다.`}; 
  }

  const result = session.finishUp(guild_id);
  return { state: result };
}

function handleFinished(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} finish ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 퀴즈 세션입니다.` };
  }

  if(session.getSessionHostId() !== guild_id)
  {
    logger.error(`${guild_id} finish ${session.getSessionHostId()}. but ${guild_id} is not host!`);
    return { state: false, reason: `요청 서버가 해당 세션의 호스트 서버가 아닙니다.`}; 
  }

  const result = session.finish(guild_id);
  return { state: result };
}

function handleRequestChat(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} request chat ${session_id}. but this session is not exists`);
    return { state: true, reason: `더 이상 존재하지 않는 퀴즈 세션입니다.` }; //채팅 땜에 강종은 좀...
  }

  if(signal.user_id === undefined)
  {
    logger.error(`${guild_id} request chat ${session_id}. but user_id is undefined`);
    return { state: true, reason: `USER_ID가 없습니다.` }; //채팅 땜에 강종은 좀...
  }


  const result = session.acceptChatRequest(signal.user_id, signal.chat_message);
  return { state: result };
}



const broadcast = (signal) => 
{
  if(cluster_manager === undefined)
  {
    logger.error(`Cluster Manager has not been assigned!`);
    return;
  }

  cluster_manager.broadcast(
    {
      ipc_message_type: IPC_MESSAGE_TYPE.MULTIPLAYER_SIGNAL,
      signal: signal
    });
};

const SESSION_STATE = 
{
  PREPARE: 0,
  LOBBY: 1,
  INGAME: 2,
};

class MultiplayerGuildInfo
{
  constructor(guild_id, guild_name)
  {
    this.guild_id = guild_id;
    this.guild_name = guild_name;

    this.syncing = false;

    this.hint = false;
    this.skip = false;

    this.stat = {
      win: 0,
      lose: 0,
    };

    this.member_count = 0;
  }

  toJsonObject()
  {
    return {
      guild_id: this.guild_id,
      guild_name: this.guild_name,
      member_count: this.member_count,
      stat: this.stat,
    };
  }

  isSyncing()
  {
    return this.syncing;
  }

  setSyncState(value)
  {
    this.syncing = value;
  }

  isHintRequested()
  {
    return this.hint;
  }

  requestHint()
  {
    if(this.hint === true)
    {
      return false;
    }

    this.hint = true;
    return true;
  }

  isSkipRequested()
  {
    return this.skip;
  }

  requestSkip()
  {
    if(this.skip === true)
    {
      return false;
    }

    this.skip = true;
    return true;
  }

  resetRequestState()
  {
    this.hint = false;
    this.skip = false;
  }

  setGuildState(guild_state)
  {
    if(guild_state === undefined)
    {
      return;
    }

    this.member_count = guild_state.member_count ?? 0;
  }

  getMemberCount()
  {
    return this.member_count;
  }

  async loadStat()
  {
    try
    {
      const scoreboard_info_result = await db_manager.selectGlobalScoreboard(this.guild_id);
      
      if(scoreboard_info_result === undefined || scoreboard_info_result.rowCount === 0)
      {
        return;
      }

      const scoreboard_info = scoreboard_info_result.rows[0];

      this.stat = {
        win: scoreboard_info.win,
        lose: scoreboard_info.lose,
        mmr: scoreboard_info.mmr,
      };

      logger.info(`Load Stat. guild_id: ${this.guild_id}. win: ${this.stat.win} / lose: ${this.stat.lose} / mmr: ${this.stat.mmr}`);
    }
    catch(err)
    {
      logger.info(`Failed to load Stat. guild_id: ${this.guild_id}. err: ${err}`);
      return false;
    }

    return true;
    
  }
}

class MultiplayerSession
{
  constructor(guild_id, guild_name, quiz_info)
  {
    // this.uuid = utility.generateUUID(); //ID. 중복검사는 하지 않겠다. 설마 겹치겠어? -> 필요 없을 듯

    const owner_guild_info  = new MultiplayerGuildInfo(guild_id, guild_name);

    this.session_owner_guild_id = guild_id;
    this.owner_guild_info = owner_guild_info; //방장 길드
    this.quiz_info = quiz_info;
    this.participant_guilds = [ owner_guild_info ]; //참여 중인 길드들

    this.banned_guilds = []; //해당 세션에서 추방된 길드들

    this.state = SESSION_STATE.PREPARE;

    this.question_list = [];
    this.quiz_size = 0;
    this.prepared_question = undefined;

    this.first_sync_received_time = undefined;
    this.max_sync_wait = 40000; //최대 40초 간격까지 sync 대기
    this.sync_done_sequence_num = 0;

    this.current_answerer_info = undefined;

    this.scoreboard = new Map(); //scoreboard 
    this.mvp_scoreboard = new Map(); //vip 맴버 scoreboard 용

    this.sync_failed_list = []; //sync 실패한 목록들

    setTimeout(() => // return true;대충 1.5초 정도는 기다리도록(별 의미는 없고 ui띄워지는 시간도 있으니)
    {
      this.state = SESSION_STATE.LOBBY;
    }, 1500);
  }

  free()
  {
    this.session_owner_guild_id = null;
    this.owner_guild_info = null;
    this.quiz_info = null;
    this.participant_guilds = null;

    this.banned_guilds = null;

    this.state = null;

    this.question_list = null;
    this.quiz_size = null;
    this.prepared_question = null;

    this.first_sync_received_time = null;
    this.max_sync_wait = null;
    this.sync_done_sequence_num = null;

    this.current_answerer_info = null;

    this.scoreboard = null;
    this.mvp_scoreboard = null;

    this.sync_failed_list = null;
  }

  getState()
  {
    return this.state;
  }

  getQuizInfo()
  {
    return this.quiz_info;
  }

  getLobbyInfo()
  {
    const guilds_info_list = [];
    this.participant_guilds.forEach(g => 
    {
      guilds_info_list.push(g.toJsonObject());
    });

    return {
      quiz_info: this.quiz_info,
      participant_guilds_info: guilds_info_list,
    };
  }

  getParticipantCount()
  {
    return this.participant_guilds.length;
  }

  getSessionId()
  {
    return this.owner_guild_info.guild_id; //세션 id는 주인장이다.
  }

  getSessionHostId()
  {
    return this.session_owner_guild_id;
  }

  getSessionName()
  {
    return this.quiz_info.title;
  }

  getParticipant(target_guild_id)
  {
    for(const guild_info of this.participant_guilds)   
    {
      if(guild_info.guild_id === target_guild_id)
      {
        return guild_info;
      }
    }

    return undefined;
  }

  getOwnerGuildInfo()
  {
    return this.owner_guild_info;
  }

  checkBanned(guild_id)
  {
    if(this.banned_guilds.includes(guild_id))
    {
      return true;
    }

    return false;
  }

  removeParticipant(target_guild_id)
  {
    let target_guild_info = undefined;
    //target guild id 빼고 다시 array 생성
    this.participant_guilds = this.participant_guilds.filter((guild_info) => 
    {
      if(guild_info.guild_id === target_guild_id)
      {
        target_guild_info = guild_info;
        return false;
      }

      return true;
    });

    return target_guild_info;
  }

  delete()
  {
    delete multiplayer_sessions[this.getSessionId()];

    this.free();
  }

  changeHost(guild_info)
  {
    const previous_session_id = this.getSessionId();
    this.session_owner_guild_id = guild_info.guild_id;
    this.owner_guild_info = guild_info; 

    const signal = {
      signal_type: SERVER_SIGNAL.HOST_CHANGED,
      new_host_guild_info: guild_info.toJsonObject(),
    };
    this.sendSignal(signal);

    delete multiplayer_sessions[previous_session_id];
    multiplayer_sessions[this.getSessionId()];

    logger.info(`The host changed to ${previous_session_id} -> ${this.getSessionId()}`);
  }

  checkSyncDone()
  {
    for(const guild_info of this.participant_guilds)
    {
      if(guild_info.isSyncing() === false)
      {
        return false;
      }
    }

    return true;
  }

  resetSyncState()
  {
    this.first_sync_received_time = undefined;

    for(const guild_info of this.participant_guilds)
    {
      guild_info.setSyncState(false);
    }
  }

  resetRequestState()
  {
    this.current_answerer_info = undefined;

    for(const guild_info of this.participant_guilds)
    {
      guild_info.resetRequestState(false);
    }
  }

  firstSyncReceived()
  {
    this.first_sync_received_time = new Date();
    const current_sync_done_sequence_num = this.sync_done_sequence_num;

    setTimeout(() => 
    {
      if(current_sync_done_sequence_num != this.sync_done_sequence_num)
      {
        return;
      }

      this.sendSyncFailed(); //일정시간 지나면 sync failed 보내주고
      this.sendSyncDone(); //어쩔 수 없이 강제 싱크

    }, this.max_sync_wait);
  }

  sendSyncFailed()
  {
    const failed_guild_list = [];

    for(const guild_info of this.participant_guilds)
    {
      if(guild_info.isSyncing()) //동기화 중이면 대상 아님
      {
        continue; 
      }

      //범인들임
      failed_guild_list.push(guild_info);
    }

    logger.warn(`Sync failed detected from server side. session_id: ${this.getSessionId()}), failed_guild_size: ${failed_guild_list.length} / ${this.getParticipantCount()}`);
    for(const guild_info of failed_guild_list)
    {
      this.syncFailedDetected(guild_info.guild_id);  
    }
  }

  syncFailedDetected(guild_id)
  {
    logger.warn(`Sync failed detected. guild_id: ${guild_id}).`);

    this.sync_failed_list.push(guild_id);

    const failed_guild_info = this.getParticipant(guild_id);
    if(failed_guild_info === undefined)
    {
      logger.warn(`but ${guild_id} is not participant of ${this.getSessionId()}`);
      return true;
    }

    const signal = {
      signal_type: SERVER_SIGNAL.SYNC_FAILED_DETECTED,
      failed_guild_info: failed_guild_info,
    };
    this.sendSignal(signal); 
    
    this.processLeaveGame(guild_id); //동기 실패 신호 보내주고 퇴장 처리
  }

  sendSyncDone()
  {
    this.resetSyncState();
    this.resetRequestState();

    this.sync_done_sequence_num += 1;

    const guilds_info_list = [];
    this.participant_guilds.forEach(g => 
    {
      guilds_info_list.push(g.toJsonObject());
    });
    
    const signal = {
      signal_type: SERVER_SIGNAL.SYNC_DONE,
      sequence_num: this.sync_done_sequence_num,
      participant_guilds_info: guilds_info_list,
      
    };
    this.sendSignal(signal);


    logger.debug(`${this.getSessionId()} session sync done`);
  }

  getRequestConfirmCriteria()
  {
    return Math.ceil((this.participant_guilds.length + 1) / 2);
  }

  processLeaveGame(guild_id)
  {
    const leaved_guild_info = this.getParticipant(guild_id);
    if(leaved_guild_info === undefined)
    {
      logger.warn(`but ${guild_id} is not participant of ${this.getSessionId()}`);
      return true;
    }

    this.removeParticipant(guild_id);

    const signal = {
      signal_type: SERVER_SIGNAL.LEAVED_GAME,
      lobby_info: this.getLobbyInfo(),
      leaved_guild_info: leaved_guild_info.toJsonObject(),
    };
    this.sendSignal(signal);

    const guild_answerer_info = this.scoreboard.get(guild_id);
    if(guild_answerer_info !== undefined)
    {
      guild_answerer_info.score = 0;
    }

    //어라? 나간게... 호스트?
    //호스트도 변경!
    let new_host_guild_info = undefined;
    if(this.session_owner_guild_id === guild_id && this.getParticipantCount() > 0)
    {
      new_host_guild_info = this.participant_guilds[0];
      this.changeHost(new_host_guild_info);
    }
    
    if(this.getParticipantCount() <= 1) //1명 이하 남앗다면
    {
      const signal = { //세션 펑
        signal_type: SERVER_SIGNAL.EXPIRED_SESSION,
      };

      this.sendSignal(signal);
      logger.info(`The host of ${guild_id} has been leaved from ingame. and only one guilds left. expiring this session`);

      const new_host_guild_id = new_host_guild_info?.guild_id;
      this.finishUp(new_host_guild_id);
      this.finish(new_host_guild_id);
    }
  }

  processWinner(guild_id)
  {
    logger.info(`Processing winner ${guild_id}`);

    db_manager.updateGlobalScoreboard(guild_id, 1, 0, 1, 0);
  }

  processLoser(guild_id)
  {
    logger.info(`Processing loser ${guild_id}`);

    db_manager.updateGlobalScoreboard(guild_id, 0, 1, 1, 0);
  }
  
  finishUp(guild_id)
  {
    logger.info(`${this.getSessionId()} finished up game. by ${guild_id}`);

    //mvp 부터 구해보자
    const sorted_mvp_scoreboard = utility.sortMapByProperty(this.mvp_scoreboard, 'score');
    if(sorted_mvp_scoreboard.size !== 0)
    {
      const [user_id, mvp_info] = sorted_mvp_scoreboard.entries().next().value;

      const signal = {
        signal_type: SERVER_SIGNAL.CONFIRM_MVP,
        mvp_info: mvp_info,
      };
      this.sendSignal(signal); 

      logger.debug(`${this.getSessionId()}'s mvp is ${mvp_info.name}/${mvp_info.score}`);
    }

    //이제 승리자 구해보자. 이긴 사람만이 점수를 받는거다.
    const sorted_scoreboard = utility.sortMapByProperty(this.scoreboard, 'score');
    for(let i = 0; i < sorted_scoreboard.size; ++i)
    {
      const [guild_id, winner_info] = sorted_scoreboard.entries().next().value;

      if(i === 0)
      {
        this.processWinner(guild_id);
        logger.debug(`${this.getSessionId()}'s winner is ${guild_id}/${winner_info.score}`);
      }
      else
      {
        if(this.sync_failed_list.includes(guild_id))
        {
          logger.debug(`${this.getSessionId()}'s loser is ${guild_id}. but this guild is sync failed`);
          continue;
        }

        this.processLoser(guild_id);
      }
      
    }
  }

  finish(guild_id)
  {
    logger.info(`${this.getSessionId()} finished game. by ${guild_id}`);

    this.delete();
  }

  convertToTimeString(time)
  {
    if(time ===- undefined)
    {
      return '';
    }

    const hours = String(time.getHours()).padStart(2, '0');
    const minutes = String(time.getMinutes()).padStart(2, '0');
    const seconds = String(time.getSeconds()).padStart(2, '0');

    return ` ${hours}:${minutes}:${seconds}`;
  }

  sendSignal(signal)
  {
    let guild_ids = [];
    for(const guild_info of this.participant_guilds)
    {
      guild_ids.push(guild_info.guild_id);
    }

    signal.guild_ids = guild_ids;
    signal.session_id = this.getSessionId();

    broadcast(signal);
  }


  acceptJoinRequest(guild_id, guild_name)
  {
    const new_guild_info = new MultiplayerGuildInfo(guild_id, guild_name);

    new_guild_info.loadStat()
      .then((result) => 
      {
        if(result)
        {
          this.sendStatLoaded();
        }
      });

    this.participant_guilds.push(new_guild_info);

    const signal = {
      signal_type: SERVER_SIGNAL.JOINED_LOBBY,
      lobby_info: this.getLobbyInfo(),
      joined_guild_info: new_guild_info.toJsonObject(),
    };
    this.sendSignal(signal); //정작 join 요청한 길드는 해당 signal 핸들링을 못한다.(아직 퀴즈 세션 생성이 안돼서)

    logger.info(`${guild_id} has been joined to ${this.getSessionId()}(${this.getSessionName()})`);

    return true;
  }

  acceptLeaveLobby(guild_id)
  {
    logger.info(`${guild_id} has been leaved lobby from ${this.getSessionId()}(${this.getSessionName()})`);

    if(this.getState !== SESSION_STATE.PREPARE && this.getState() !== SESSION_STATE.LOBBY)
    {
      logger.warn(`but ${this.getSessionId()} is not lobby`);
      return true;
    }
  
    const leaved_guild_info = this.removeParticipant(guild_id);
    if(leaved_guild_info === undefined && this.checkBanned(guild_id) === false)
    {
      logger.warn(`but ${guild_id} is not participant of ${this.getSessionId()}`);
      return true;
    }

    const signal = {
      signal_type: SERVER_SIGNAL.LEAVED_LOBBY,
      lobby_info: this.getLobbyInfo(),
      leaved_guild_info: leaved_guild_info.toJsonObject(),
    };
    this.sendSignal(signal);

    if(this.session_owner_guild_id === guild_id) //어라? 나간게... 호스트?
    {
      const signal = { //세션 펑
        signal_type: SERVER_SIGNAL.EXPIRED_SESSION,
      };
      this.sendSignal(signal);
      
      logger.info(`The host of ${this.getSessionId()} has been leaved from lobby. expiring this session`);

      this.finish(guild_id);
    }

    return true;
  }

  acceptEditRequest(guild_id, quiz_info)
  {
    this.quiz_info = quiz_info;

    const signal = {
      signal_type: SERVER_SIGNAL.EDITED_LOBBY,
      lobby_info: this.getLobbyInfo(),
    };
    this.sendSignal(signal);

    logger.debug(`session ${this.getSessionId()}'s quiz info edited by ${guild_id}`);

    return true;
  }

  acceptKickRequest(guild_id, target_guild_id)
  {
    let target_guild_info = this.getParticipant(target_guild_id);

    const kicked_signal = {
      signal_type: SERVER_SIGNAL.KICKED_PARTICIPANT,
      kicked_guild_info: target_guild_info.toJsonObject(),
    };
    this.sendSignal(kicked_signal);

    this.removeParticipant(target_guild_id);
    this.banned_guilds.push(target_guild_id);

    const edited_signal = {
      signal_type: SERVER_SIGNAL.EDITED_LOBBY,
      lobby_info: this.getLobbyInfo(),
    };
    this.sendSignal(edited_signal);

    logger.info(`${guild_id} kicked ${target_guild_id} from multiplayer lobby session`);

    return true;
  }

  acceptStartRequest(guild_id)
  {
    const signal = {
      signal_type: SERVER_SIGNAL.STARTED_LOBBY,
      lobby_info: this.getLobbyInfo(),
      owner_name: this.getOwnerGuildInfo().guild_name,
    };
    this.sendSignal(signal);

    this.state = SESSION_STATE.INGAME;

    logger.info(`Multiplayer session ${this.getSessionId()}/${this.getSessionName()} started by ${guild_id}`);

    return true;
  }

  shareQuestionList(question_list, quiz_size)
  {
    if(this.question_list.length !== 0)
    {
      logger.warn(`Receive generated question list. but question list is already assigned`);
      return;
    }

    this.question_list = question_list;
    this.quiz_size = quiz_size;

    const signal = {
      signal_type: SERVER_SIGNAL.APPLY_QUESTION_LIST,
      question_list: this.question_list,
      quiz_size: this.quiz_size,
    };
    this.sendSignal(signal);

    logger.info(`${this.getSessionId()} is Sharing question list. size: ${this.quiz_size}/${this.question_list.length}`);

    return true;
  }

  sharePreparedQuestion(prepared_question, question_num)
  {
    this.prepared_question = prepared_question;
    this.question_num = question_num;

    const signal = {
      signal_type: SERVER_SIGNAL.APPLY_NEXT_QUESTION,
      prepared_question: this.prepared_question,
      question_num: this.question_num,
    };
    this.sendSignal(signal);

    logger.debug(`${this.getSessionId()} is Sharing prepared question ${this.question_num}`);

    return true;
  }

  acceptSyncRequest(guild_id, guild_state)
  {
    const guild_info = this.getParticipant(guild_id);

    guild_info.setSyncState(true);

    if(guild_state !== undefined)
    {
      guild_info.setGuildState(guild_state);
    }

    if(this.first_sync_received_time === undefined)
    {
      this.firstSyncReceived();
    }

    logger.debug(`Accept Sync Request from ${guild_id} first: ${this.convertToTimeString(this.first_sync_received_time)} current: ${this.convertToTimeString(new Date())}`);

    if(this.checkSyncDone())
    {
      this.sendSyncDone();
    }
  }

  acceptHintRequest(guild_id)
  {
    const guild_info = this.getParticipant(guild_id);

    if(guild_info.isHintRequested())
    {
      return true;
    }

    guild_info.requestHint();

    let hint_requested_count = 0;
    for(const guild_info of this.participant_guilds)
    {
      if(guild_info.isHintRequested() === false)
      {
        continue;
      }

      ++hint_requested_count;
    }

    const confirm_criteria = this.getRequestConfirmCriteria();

    const signal = {
      signal_type: SERVER_SIGNAL.NOTICE_MESSAGE,
      notice: `\`\`\`🗳 ${guild_info.guild_name} 서버가 힌트 요청에 투표했습니다. ( ${hint_requested_count} / ${confirm_criteria} )\`\`\``
    };
    this.sendSignal(signal);

    if(hint_requested_count >= confirm_criteria)
    {
      const signal = {
        signal_type: SERVER_SIGNAL.CONFIRM_HINT,
      };
      this.sendSignal(signal);
    }

    logger.debug(`Accept Hint Request from ${guild_id} ${hint_requested_count}/${confirm_criteria}`);
  }

  acceptSkipRequest(guild_id)
  {
    const guild_info = this.getParticipant(guild_id);

    if(guild_info.isSkipRequested())
    {
      return true;
    }

    guild_info.requestSkip();

    let skip_requested_count = 0;
    for(const guild_info of this.participant_guilds)
    {
      if(guild_info.isSkipRequested() === false)
      {
        continue;
      }

      ++skip_requested_count;
    }

    const confirm_criteria = this.getRequestConfirmCriteria();

    const signal = {
      signal_type: SERVER_SIGNAL.NOTICE_MESSAGE,
      notice: `\`\`\`🗳 ${guild_info.guild_name} 서버가 스킵 요청에 투표했습니다. ( ${skip_requested_count} / ${confirm_criteria} )\`\`\``
    };
    this.sendSignal(signal);

    if(skip_requested_count >= confirm_criteria)
    {
      const signal = {
        signal_type: SERVER_SIGNAL.CONFIRM_SKIP,
      };
      this.sendSignal(signal);
    }

    logger.debug(`Accept Skip Request from ${guild_id} ${skip_requested_count}/${confirm_criteria}`);
  }

  acceptAnswerHitRequest(guild_id, answerer_info)
  {
    //사실 먼저 온 사람이 임자다 ㅋㅅㅋ
    if(this.current_answerer_info !== undefined)
    {
      return true;
    }

    this.current_answerer_info = answerer_info;

    const answerer_id = this.current_answerer_info.answerer_id;
    const answerer_name = this.current_answerer_info.answerer_name;
    const score = this.current_answerer_info.score;

    const guild_info = this.getParticipant(guild_id);

    const signal = {
      signal_type: SERVER_SIGNAL.CONFIRM_ANSWER_HIT,
      answerer_info: {
        answerer_id: guild_id,
        answerer_name: `${answerer_name} (${guild_info.guild_name})`,
        score: score,
      }
    };
    this.sendSignal(signal); //우선 신호부터 보내준다.

    logger.debug(`Accept Request Answer hit from ${guild_id} by ${answerer_id}/${answerer_name}/${score}`);

    //vip 계산용 scoreboard에 반영
    let member_answerer_info = this.mvp_scoreboard.get(answerer_id);
    if(member_answerer_info === undefined)
    {
      member_answerer_info = {
        name: answerer_name,
        score: score  
      };

      this.mvp_scoreboard.set(answerer_id, member_answerer_info);
    }
    else
    {
      member_answerer_info.name = answerer_name;
      member_answerer_info.score += score;
    }

    //scoreboard 에 반영
    let guild_answerer_info = this.scoreboard.get(guild_id);
    if(guild_answerer_info === undefined)
    {
      guild_answerer_info = {
        name: answerer_name,
        score: score
      };

      this.scoreboard.set(guild_id, guild_answerer_info);
    }
    else
    {
      guild_answerer_info.name = answerer_name;
      guild_answerer_info.score += score;
    }
  }

  acceptLeaveGame(guild_id)
  {
    logger.info(`${guild_id} has been leaved game from ${this.getSessionId()}(${this.getSessionName()})`);

    if(this.getState() !== SESSION_STATE.INGAME) //게임 중 아니면 패스임
    {
      logger.warn(`but ${this.getSessionId()} is not INGAME`);
      return true;
    }

    this.processLeaveGame(guild_id);

    return true;
  }

  acceptChatRequest(user_id, chat_message)
  {
    const signal = { //세션 펑
      signal_type: SERVER_SIGNAL.CONFIRM_CHAT,
      user_id: user_id,
      timestamp: Date.now(),
      chat_message: chat_message
    };
    this.sendSignal(signal);
    logger.debug(`Broadcasting Chat Message ${user_id}: ${chat_message}`);
  }

  sendStatLoaded()
  {
    const guilds_info_list = [];
    this.participant_guilds.forEach(g => 
    {
      guilds_info_list.push(g.toJsonObject());
    });

    const signal = {
      signal_type: SERVER_SIGNAL.PARTICIPANT_INFO_UPDATE,
      participant_guilds_info: guilds_info_list,
    };
    this.sendSignal(signal);
  }
}

