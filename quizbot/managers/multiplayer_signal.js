const SERVER_SIGNAL = 
{
  JOINED_LOBBY: 0x80,            // 10000000 - 길드가 로비 참가.
  LEAVED_LOBBY: 0x81,            // 10000001 - 길드가 로비 떠남.
  EXPIRED_SESSION: 0x82,         // 10000010 - 로비 삭제됨(호스트 길드 떠남).
  EDITED_LOBBY: 0x83,            // 10000011 - 로비 수정됨.
  KICKED_PARTICIPANT: 0x84,      // 10000100 - 참여자 추방됨. 
  STARTED_LOBBY: 0x85,           // 10000101 - 로비 시작됨. 
  APPLY_QUESTION_LIST: 0x86,     // 10000110 - 생성된 문제 목록 적용. 
  APPLY_NEXT_QUESTION: 0x87,     // 10000111 - 현재 제출할 문제 적용. 
  SYNC_DONE: 0x88,               // 10001000 - 모든 세션 동기화 후 계속 진행. 
  CONFIRM_ANSWER_HIT: 0x89,      // 10001001 - 정답 승인. 
  CONFIRM_HINT: 0x8A,            // 10001010 - 힌트 요청 승인. 
  CONFIRM_SKIP: 0x8B,            // 10001011 - 스킵 승인 요청. 
  SYNC_FAILED_DETECTED: 0x8C,    // 10001100 - 세션 동기화 실패(서버).
  LEAVED_GAME: 0x8D,             // 10001101 - 게임 진행 중 길드 떠남. 
  CONFIRM_MVP: 0x8E,             // 10001110 - MVP 선정 완료. 
  CONFIRM_CHAT: 0x8F,            // 10001111 - 채팅 승인 후 표시. 
  HOST_CHANGED: 0x90,            // 10010000 - 호스트 변경됨. 
  NOTICE_MESSAGE: 0x91,          // 10010001 - 전체 메시지. 
};

const CLIENT_SIGNAL = 
{
  REQUEST_LOBBY_LIST: 0x00,         // 00000000 - 로비 목록 요청. (완료)
  CREATE_LOBBY: 0x01,               // 00000001 - 로비 생성. (완료)
  JOIN_LOBBY: 0x02,                 // 00000010 - 로비 참가. 
  LEAVE_LOBBY: 0x03,                // 00000011 - 로비 떠남.
  EDIT_LOBBY: 0x04,                 // 00000100 - 로비 수정. 
  REQUEST_KICK_PARTICIPANT: 0x05,   // 00000101 - 강제퇴장 요청. 
  START_LOBBY: 0x06,                // 00000110 - 로비 시작. 
  QUESTION_LIST_GENERATED: 0x07,    // 00000111 - 문제 목록 생성됨. 
  SYNC_WAIT: 0x08,                  // 00001000 - 세션 동기화 대기 중. 
  SYNC_FAILED: 0x09,                // 00001001 - 세션 동기화 실패(클라). 
  NEXT_QUESTION_GENERATED: 0x0A,    // 00001010 - 현재 문제 생성됨. 
  REQUEST_HINT: 0x0B,               // 00001011 - 힌트 요청. 
  REQUEST_SKIP: 0x0C,               // 00001100 - 스킵 요청. 
  REQUEST_ANSWER_HIT: 0x0D,         // 00001101 - 정답 맞추고 승인 요청. 
  LEAVE_GAME: 0x0E,                 // 00001110 - 게임 진행 중 떠남. 
  FINISH_UP: 0x0F,                  // 00001111 - 게임 마무리 알림. 
  FINISHED: 0x10,                   // 00010000 - 게임 종료 알림. 
  REQUEST_CHAT: 0x11,               // 00010001 - 채팅 요청. 
};



exports.CLIENT_SIGNAL = CLIENT_SIGNAL;
exports.SERVER_SIGNAL = SERVER_SIGNAL;