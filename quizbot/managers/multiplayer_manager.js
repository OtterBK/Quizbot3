'use strict';

//외부 모듈
const { messageType } = require('discord-hybrid-sharding');

//로컬 모듈
const logger = require('../../utility/logger.js')('MultiplayerManager');
const { IPC_MESSAGE_TYPE } = require('./ipc_manager.js');
const { CLIENT_SIGNAL, SERVER_SIGNAL } = require('./multiplayer_signal.js');

const quiz_system = require('../quiz_system/quiz_system.js');
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
};

const signalHandlers = 
{
  [CLIENT_SIGNAL.REQUEST_LOBBY_LIST]: handleRequestLobbyList,
  [CLIENT_SIGNAL.CREATE_LOBBY]: handleCreateLobby,
  [CLIENT_SIGNAL.JOIN_LOBBY]: handleJoinLobby,
  [CLIENT_SIGNAL.LEAVE_LOBBY]: handleLeaveLobby,
  [CLIENT_SIGNAL.EDIT_LOBBY]: handleEditLobby,
  [CLIENT_SIGNAL.START_LOBBY]: handleStartLobby,
  [CLIENT_SIGNAL.QUESTION_LIST_GENERATED]: handleQuestionListGenerated,
  [CLIENT_SIGNAL.REQUEST_ANSWER_HIT]: handleRequestAnswerHit,
  [CLIENT_SIGNAL.REQUEST_HINT]: handleRequestHint,
  [CLIENT_SIGNAL.REQUEST_SKIP]: handleRequestSkip,
  [CLIENT_SIGNAL.LEAVE_GAME]: handleLeaveGame,
  [CLIENT_SIGNAL.REQUEST_CHAT]: handleRequestChat,
  [CLIENT_SIGNAL.REQUEST_KICK_PARTICIPANT]: handleRequestKick,
};

exports.onSignalReceived = (signal) => 
{
  if(isClientSignal(signal) == false)
  {
    logger.error(`Multiplayer Manager Received ${signal.signal_type} signal! this is not client signal`);
    return undefined;
  }

  if(signal.guild_id == undefined)
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
    if(session.getState() != SESSION_STATE.LOBBY)
    {
      continue;
    }

    let simple_session_info = 
    {
      session_id: session.getSessionId(),
      participant_count: session.getParticipantCount(),
      session_name: session.getSessionName(),
    };
        
    lobby_session_list.push(simple_session_info);
  }

  return lobby_session_list;
}

function handleCreateLobby(signal) 
{
  const guild_id = signal.guild_id;
  const guild_name = signal.guild_name;

  if(guild_id == undefined)
  {
    logger.error("Create Lobby Signal. But does not have guild_id");
    return { state: false, reason: `서버 ID가 존재하지 않습니다.` };
  }

  const quiz_info = signal.quiz_info;
  if(quiz_info == undefined)
  {
    logger.error("Create Lobby Signal. But does not have quiz info");
    return { state: false, reason: `퀴즈 정보가 존재하지 않습니다.` };
  }

  const new_multiplayer_session = new MultiplayerSession(guild_id, guild_name, quiz_info);

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

  if(session == undefined)
  {
    return { state: false, reason: '더 이상 존재하지 않는 로비 세션입니다.' };
  }

  if(session.getState() != SESSION_STATE.LOBBY)
  {
    return { state: false, reason: '대기 중인 로비가 아닙니다.' };
  }

  if(session.checkBanned(guild_id))
  {
    return { state: false, reason: '추방당한 로비엔 재입장이 불가능합니다.' };
  }

  const quiz_info = session.getQuizInfo();

  if(quiz_info == undefined)
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

  if(session == undefined)
  {
    logger.error(`${guild_id} requests to leave ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 로비 세션입니다.` };
  }

  const result = session.acceptLeaveRequest(guild_id);
  return { state: result };
}

function handleEditLobby(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session == undefined)
  {
    logger.error(`${guild_id} requests to edit ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 로비 세션입니다.`};
  }

  if(signal.quiz_info == undefined)
  {
    logger.error(`${guild_id} requests to edit ${session_id}. but this signal does not have quiz info!`);
    return { state: false, reason: `퀴즈 정보가 없습니다.` };
  }

  if(session.getSessionHostId() != guild_id)
  {
    logger.error(`${guild_id} request to edit lobby info. but session owner id is ${this.session_owner_guild_id}!`);
    return { state: false, reason: `요청 서버가 해당 로비의 호스트 서버가 아닙니다.`};
  }

  const result = session.acceptEditRequest(guild_id, signal.quiz_info);
  return { state: result };
}

function handleStartLobby(signal) 
{
  const guild_id = signal.guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session == undefined)
  {
    logger.error(`${guild_id} requests to start ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 로비 세션입니다.`};
  }

  if(session.getSessionHostId() != guild_id)
  {
    logger.error(`${guild_id} request to start lobby. but session owner id is ${this.session_owner_guild_id}!`);
    return { state: false, reason: `요청 서버가 해당 로비의 호스트 서버가 아닙니다.`};
  }

  if(session.getQuizInfo() == undefined)
  {
    logger.error(`${guild_id} requests to start ${session_id}. but this session's quiz info is undefined!`);
    return { state: false, reason: `해당 세션에는 퀴즈 정보가 없습니다.` };
  }

  if(session.getState() != SESSION_STATE.LOBBY)
  {
    logger.error(`${guild_id} requests to start ${session_id}. but this session's state is ${session.getState()}!`);
    return { state: false, reason: `대기 중인 로비가 아닙니다.` };
  }

  const result = session.acceptStartRequest(guild_id);
  return { state: result };
}

function handleQuestionListGenerated(signal) 
{
  // 기능 구현
}

function handleRequestAnswerHit(signal) 
{
  // 기능 구현
}

function handleRequestHint(signal) 
{
  // 기능 구현
}

function handleRequestSkip(signal) 
{
  // 기능 구현
}

function handleLeaveGame(signal) 
{
  // 기능 구현
}

function handleRequestChat(signal) 
{
  // 기능 구현
}

function handleRequestKick(signal)
{
  const guild_id = signal.guild_id;
  const target_guild_id = signal.target_guild_id;

  const session_id = signal.session_id;
  const session = multiplayer_sessions[session_id];

  if(session == undefined)
  {
    logger.error(`${guild_id} requests to edit ${session_id}. but this session is not exists`);
    return { state: false, reason: `더 이상 존재하지 않는 로비 세션입니다.`};
  }

  if(signal.target_guild_id == undefined)
  {
    logger.error(`${guild_id} requests to edit ${session_id}. but this signal does not have quiz info!`);
    return { state: false, reason: `추방할 대상 서버의 ID값이 없습니다.` };
  }
    
  if(session.getSessionHostId() != guild_id)
  {
    logger.error(`${guild_id} request to kick ${target_guild_id}. but that guild is not host!`);
    return { state: false, reason: `요청 서버가 해당 로비의 호스트 서버가 아닙니다.`};
  }

  if(session.getSessionHostId() == target_guild_id)
  {
    logger.info(`${guild_id} request to kick ${target_guild_id}. but target guild is host! ignore this`);
    return { state: false, reason: `호스트 서버를 추방할 수 없습니다.`};
  }

  if(session.getParticipant(target_guild_id) == undefined)
  {
    logger.error(`${guild_id} request to kick ${target_guild_id}. but target guild id is not participant of ${session.getSessionId()}`);
    return { state: false, reason: `대상 서버가 해당 로비의 참여 중이지 않습니다.`};
  }

  const result = session.acceptKickRequest(guild_id, target_guild_id);
  return { state: result };
}


const broadcast = (signal) => 
{
  if(cluster_manager == undefined)
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
  START: 2,
};

class MultiplayerGuildInfo
{
  constructor(guild_id, guild_name)
  {
    this.guild_id = guild_id;
    this.guild_name = guild_name;
  }

  toJsonObject()
  {
    return {
      guild_id: this.guild_id,
      guild_name: this.guild_name,
    };
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

    setTimeout(() => //대충 3초 정도는 기다리도록(별 의미는 없고 ui띄워지는 시간도 있으니)
    {
      this.state = SESSION_STATE.LOBBY;
    }, 3000);
  }

  free()
  {
    this.session_owner_guild_id = null;
    this.owner_guild_info = null;
    this.quiz_info = null;
    this.participant_guilds = null;

    this.banned_guilds = null;

    this.state = null;
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
      if(guild_info.guild_id == target_guild_id)
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
      if(guild_info.guild_id == target_guild_id)
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

  acceptLeaveRequest(guild_id)
  {
    logger.info(`${guild_id} has been leaved from ${this.getSessionId()}(${this.getSessionName()})`);

    const leaved_guild_info = this.removeParticipant(guild_id);

    if(leaved_guild_info == undefined)
    {
      logger.warn(`but ${guild_id} is not participant of ${this.getSessionId()}`);
      return;
    }

    if(this.session_owner_guild_id == guild_id) //어라? 나간게... 호스트?
    {
      const signal = {
        signal_type: SERVER_SIGNAL.EXPIRED_LOBBY,
      };

      this.sendSignal(signal);
      logger.info(`The host of ${this.getSessionId()} has been leaved. expiring this lobby`);

      this.delete();
    }
    else
    {
      const signal = {
        signal_type: SERVER_SIGNAL.LEAVED_LOBBY,
        lobby_info: this.getLobbyInfo(),
        leaved_guild_info: leaved_guild_info.toJsonObject(),
      };
      this.sendSignal(signal);
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

    logger.info(`session ${this.getSessionId()}'s quiz info edited by ${guild_id}`);

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

    logger.info(`Multiplayer session ${this.getSessionId()}/${this.getSessionName()} started by ${guild_id}`);

    return true;
  }
}

