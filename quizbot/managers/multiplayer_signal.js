const SERVER_SIGNAL = 
{
  JOINED_LOBBY: 0x80,          // 10000000 - 길드가 로비 참가.
  LEAVED_LOBBY: 0x81,          // 10000001 - 길드가 로비 떠남.
  EXPIRED_LOBBY: 0x82,         // 10000010 - 로비 삭제됨(호스트 길드 떠남).
  EDITED_LOBBY: 0x83,          // 10000011 - 로비 수정됨.
  STARTED_LOBBY: 0x84,         // 10000100 - 로비 시작됨
  APPLY_QUESTION_LIST: 0x85,   // 10000101 - 생성된 문제 목록 적용
  CONTINUE: 0x86,              // 10000110 - 모든 세션 동기화 후 계속 진행
  CONFIRM_ANSWER_HIT: 0x87,    // 10000111 - 정답 승인 요청된 세션
  CONFIRM_HINT: 0x88,          // 10001000 - 힌트 요청 승인
  CONFIRM_SKIP: 0x89,          // 10001001 - 스킵 승인 요청
  LEAVED_GAME: 0x8A,           // 10001010 - 게임 진행 중 길드 떠남
  SYNC_FAILED: 0x8B,           // 10001011 - 세션 동기화 실패
  CONFIRM_CHAT: 0x8C,          // 10001100 - 채팅 승인 후 표시
  KICKED_PARTICIPANT: 0x8d,    // 10001101 - 참여자 추방됨.
};

// Client Signals (최상위 비트를 0으로 설정하여 클라이언트 신호를 구분)
const CLIENT_SIGNAL = 
{
  REQUEST_LOBBY_LIST: 0x00,       // 00000000 - 로비 목록 요청.
  CREATE_LOBBY: 0x01,             // 00000001 - 로비 생성.
  JOIN_LOBBY: 0x02,               // 00000010 - 로비 참가.
  LEAVE_LOBBY: 0x03,              // 00000011 - 로비 떠남.
  EDIT_LOBBY: 0x04,               // 00000100 - 로비 수정.
  START_LOBBY: 0x05,              // 00000101 - 로비 시작.
  QUESTION_LIST_GENERATED: 0x06,  // 00000110 - 문제 목록 생성됨
  SYNC_WAIT: 0x07,                // 00000111 - 세션 동기화 대기 중
  REQUEST_ANSWER_HIT: 0x08,       // 00001000 - 정답 맞추고 승인 요청
  REQUEST_HINT: 0x09,             // 00001001 - 힌트 요청
  REQUEST_SKIP: 0x0A,             // 00001010 - 스킵 요청
  LEAVE_GAME: 0x0B,               // 00001011 - 게임 진행 중 떠남
  REQUEST_CHAT: 0x0C,             // 00001100 - 채팅 요청
  REQUEST_KICK_PARTICIPANT: 0x0D, // 00001101 - 강제퇴장 요청.
};

exports.CLIENT_SIGNAL = CLIENT_SIGNAL;
exports.SERVER_SIGNAL = SERVER_SIGNAL;