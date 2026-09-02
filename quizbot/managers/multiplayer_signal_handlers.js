'use strict';

//multiplayer_manager.js에서 분리 (REFACTOR_PLAN.md Phase 3)
//클라이언트(각 클러스터)에서 들어오는 CLIENT_SIGNAL을 받아 처리/응답하는 부분.
//IPC 신호 검증/디스패치(onSignalReceived, isClientSignal)와
//신호별 처리(handle*)를 모아둔다. multiplayer_manager.js는 이 모듈을 통해
//얇은 facade 역할만 한다.
//로직/주석은 원본과 동일 (동작 변경 없음).

const logger = require('../../utility/logger.js')('MultiplayerManager');
const { CLIENT_SIGNAL, SERVER_SIGNAL } = require('./multiplayer_signal.js');

const session_registry = require('./multiplayer_session_registry.js');
const { MultiplayerSession, SESSION_STATE } = require('./multiplayer_session.js');

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
  [CLIENT_SIGNAL.REQUEST_READY]: handleRequestReady,
  [CLIENT_SIGNAL.ADMIN_FORCE_DELETE_LOBBY]: handleAdminForceDeleteLobby,
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

function isClientSignal(signal)
{
  return (signal & 0x80) === 0;  // 최상위 비트가 0이면 클라이언트 시그널
}

function handleRequestLobbyList(signal) 
{
  const guild_id = signal.guild_id;
    
  //TODO 사실 캐싱해두는게 성능상 제일 좋긴할텐데... 내가 귀찮다. 나중에 바꿔두자
  //세션이 많아봤자 얼마나 많겠는가?
  //세션 객체 자체를 넘기려고 했는데 솔직히 말이 안된다. hybrid 라이브러리가 IPC에서 객체 자체를 넘길 수 있게 해두진 않았을 것 같다. -> 실험해보니 discord hybrid 라이브러리에서 Object 변환 에러남
  //통신은 무조건 json으로 하도록 하자

  let lobby_session_list = [];
  for(const session of Object.values(session_registry.multiplayer_sessions))
  {
    if(session.getState() === SESSION_STATE.PREPARE)
    {
      continue;
    }

    let simple_session_info = 
    {
      session_id: session.getSessionId(),
      participant_count: session.getParticipantCount(),
      session_name: session.getSessionName(),
      host_name: session.getHostGuildName(),
      is_ingame: session.isIngame(),
      mmr_avg: session.getAverageMMR(),
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
    .then((updated_guild_info) => 
    {
      if(updated_guild_info)
      {
        new_multiplayer_session.sendStatLoaded(updated_guild_info);
      }
    });

  session_registry.multiplayer_sessions[new_multiplayer_session.getSessionId()] = new_multiplayer_session;
  logger.info(`New multiplayer lobby has been registered ${guild_id} = ${quiz_info.title}`);

  session_registry.sendMultiplayerLobbyCount(); //캐싱용 대기 중인 로비 수 전송

  return { state: true,  lobby_info: new_multiplayer_session.getLobbyInfo(), session_id: new_multiplayer_session.getSessionId() };
}

function handleJoinLobby(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = session_registry.multiplayer_sessions[session_id];

  logger.info(`${guild_id} trying to join ${session_id}`);

  if(session === undefined)
  {
    return { state: false, reason: '더 이상 존재하지 않는 로비 세션입니다.' };
  }

  if(session.getState() === SESSION_STATE.INGAME)
  {
    return { state: false, reason: '이미 퀴즈가 시작된 세션입니다.' };
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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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

  if(session.checkAllReady() === false)
  {
    logger.info(`${guild_id} requests to start ${session_id}. but this session is not all ready`);
    return { state: false, reason: `모든 참여자가 준비 완료 상태여야합니다.` };
  }

  const result = session.acceptStartRequest(guild_id);
  return { state: result };
}

function handleQuestionListGenerated(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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
  const session = session_registry.multiplayer_sessions[session_id];

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


  const result = session.acceptChatRequest(signal.guild_id, signal.user_id, signal.chat_message);
  return { state: result };
}

function handleRequestReady(signal)
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = session_registry.multiplayer_sessions[session_id];

  if(session === undefined)
  {
    logger.error(`${guild_id} request ready ${session_id}. but this session is not exists`);
    return { state: true, reason: `더 이상 존재하지 않는 퀴즈 세션입니다.` };
  }

  const guild_info = session.getParticipant(guild_id);
  if(guild_info === undefined)
  {
    logger.error(`${guild_id} request ready ${session_id}. but this session does not include this guild`);
    return { state: false, reason: `해당 세션에 속하지 않습니다.`};
  }

  if(guild_info.isReady())
  {
    return { state: false, reason: `이미 준비하셨습니다.` };
  }

  const result = session.acceptReady(guild_id);
  return { state: result };
}

//관리자 전용: 대기 중인(LOBBY 상태) 로비 강제 삭제. quizmgr의 "로비 관리" 화면(admin-lobby-detail-ui.ts)에서만 호출됨
function handleAdminForceDeleteLobby(signal)
{
  const session_id = signal.session_id;
  const session = session_registry.multiplayer_sessions[session_id];

  if(session === undefined)
  {
    return { state: false, reason: `더 이상 존재하지 않는 로비 세션입니다.` };
  }

  if(session.getState() !== SESSION_STATE.LOBBY)
  {
    return { state: false, reason: `대기 중인 로비만 강제 삭제할 수 있습니다.` };
  }

  const session_name = session.getSessionName(); //finish()가 free()로 필드를 null시키기 전에 미리 확보

  session.sendSignal({ signal_type: SERVER_SIGNAL.EXPIRED_SESSION }); //acceptLeaveLobby 호스트 이탈 경로와 동일 패턴

  logger.warn(`Admin force deleted lobby ${session_id}(${session_name}) by ${signal.actor}`);

  session.finish(signal.actor ?? 'admin');

  return { state: true, session_name: session_name };
}
