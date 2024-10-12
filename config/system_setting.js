'use strict';

exports.SYSTEM_CONFIG = {
  language: 'kor', //사용 언어

  develop_mode: true, //개발자 모드 활성화, console 로깅 등
  maintenance_mode: false, //점검 모드, 어드민만 봇 사용 가능
  maintenance_alert: '현재 퀴즈봇을 점검하고 있습니다.', //점검 모드 시, 안내 문구

  use_inline_volume: false, //성능 많이 잡아먹음, 렉 많으면 끌 것, false 설정 시, fade in,out 효과 없음 
  fade_interval: 500, //fade in,out 시 사용할 interval(ms), 값이 낮을수록 부드러운 fade 효과를 얻을 수 있으나 리소스를 많이 잡아먹음
  fade_in_duration: 5000, //fade in 시간(ms)
  fade_out_duration: 5000, //fade out 시간(ms)
  fade_in_volume_initialize_term: 500, //fade in은 초기 볼륨을 설정하고 시작한다. 이때 볼륨 설정하고 일정한 텀을 줘야 제대로 적용된다.

  max_question_audio_play_time: 60, //문제용 오디오 최대 허용 길이(s)
  max_answer_audio_play_time: 13, //정답용 오디오 최대 허용 길이(s)

  max_check_prepared_queue: 120, //prepared queue 최대 확인 횟수
  prepared_queue_check_interval: 250, //prepared queue 체크 간격

  ui_holder_aging_manager_criteria: 900, //얼마나 오래된 holder를 삭제할 지(s)
  ui_holder_aging_manager_interval: 600, //체크 주기(s)

  guilds_count_manager_interval: 10, //참여 중인 guild 수 체크 주기(s)

  correct_answer_cycle_wait: 6500, //정답 맞췄을 시, 얼마나 대기할 지
  timeover_cycle_wait: 6500, //타임오버 시, 얼마나 대기할 지
  graceful_timeover_max_try: 0, //타임오버 시, 부드러운 타임 오버를 위한 최대 시도 수
  graceful_timeover_interval: 500, //부드러운 타임 오버 체크 간격 (ms)

  explain_wait: 3000, //퀴즈 설명 단계에서 각 설명 텀
  ending_wait: 3500, //순위 발표 단계에서 각 순위 표시 텀

  bgm_path: `${__dirname}/../resources/bgm`, //BGM 파일 위치
  dev_quiz_path: `${__dirname}/../resources/quizdata`, //Dev퀴즈 파일 위치
  log_path: `${__dirname}/../log`, //LOG 저장할 위치
  notices_path: `${__dirname}/../resources/notices`, //공지사항 파일 위치
  current_notice_path: `${__dirname}/../resources/current_notice.txt`, //실시간 공지
  version_info_path: `${__dirname}/../resources/version_info.txt`, //실시간 버전
  banned_user_path: `${__dirname}/../resources/banned_user.txt`, //퀴즈만들기 밴
  tagged_dev_quiz_info: `${__dirname}/../resources/tagged_dev_quiz_info.json`, //공식 퀴즈 태그 설정값

  hint_percentage: 2, //4로 설정하면 정답 전체의 1/4만 보여주겠다는 거임
  hint_max_try: 1000, //힌트 만들 때 최대 시도 횟수

  pg_max_pool_size: 5, //Postgresql max pool 개수

  log_max_files: 10, //log로 남길 파일 최대 수
  log_max_size: '100m', //각 log 파일 최대 크기
    
  ffmpeg_kill_timeout: 70000, //ffmpeg에서 에러 발생 시나, start 안했을 시 안꺼지는 버그 있음. 최대 timeout 설정해서 시간 지나면 강종
  ffmpeg_aging_manager_criteria: 300, //5분 지나도 안꺼지면 ffmpeg는 강종
  ffmpeg_aging_manager_interval: 300, //체크 주기(s)

  custom_audio_max_throttle: 500 * 1024,
    
  custom_audio_max_file_size: '10M', //문제용 오디오 파일 최대 용량
  custom_audio_ytdl_max_length: 1200, //문제용 오디오로 사용가능한 오디오 최대 길이(s)
  // custom_audio_cache_path: `${__dirname}/../resources/cache`,
  custom_audio_cache_path: `G:/quizdata/cache`,

  ytdl_cookie_path: `${__dirname}/../resources/ytdl_cookie.json`,
  ytdl_ipv6_USE: true, //IPv6도 함께 사용할지 여부

  certify_like_criteria: 10, //인증된 퀴즈 전환을 위한 추천 수 기준
  certify_played_count_criteria: 50, //인증된 퀴즈 전환을 위한 플레이 수 기준
};

exports.CUSTOM_EVENT_TYPE = {
  interactionCreate: "interactionCreate",
  messageCreate: "messageCreate",
  receivedMultiplayerSignal: "receivedMultiplayerSignal"
};

exports.QUIZ_TYPE = {
  SONG: "노래 퀴즈",
  SCRIPT: "대사 퀴즈",
  // SELECT: "객관식", //안씀
  // TTS: "TTS 사용방식", //안씀
  GLOWLING: "포켓몬 울음소리",
  IMAGE: "그림 퀴즈",
  OX: "OX 퀴즈",
  OX_LONG: "타이머 긴 OX 퀴즈",
  TEXT: "텍스트 퀴즈",
  TEXT_LONG: "타이머 긴 텍스트 퀴즈",
  // FAST_QNA: "텍스트 기반 qna, 타이머 짧음", //안씀
  INTRO: "인트로 맞추기",
  MULTIPLAY: "멀티플레이",
  IMAGE_LONG: "타이머 긴 그림 퀴즈",
  CUSTOM: "커스텀 퀴즈",
  OMAKASE: "오마카세 퀴즈",
};

exports.EXPLAIN_TYPE = {
  SHORT_ANSWER_TYPE: "short_answer",
  CUSTOM_ANSWER_TYPE: "custom_answer",
  OMAKASE_ANSWER_TYPE: "omakase_answer",
  MULTIPLAYER_ANSWER_TYPE: "multiplayer_answer",
};

exports.BGM_TYPE = {
  BELL: "bell.webm",
  COUNTDOWN_10: "countdown10.webm",
  COUNTDOWN_LONG: "longTimer",
  ENDING: "ENDING.webm",
  FAIL: "FAIL.webm",
  MATCH_FIND: "MATCH_FIND.webm",
  MATCHING: "MATCHING.webm",
  PLING: "pling.webm",
  ROUND_ALARM: "ROUND_ALARM.webm",
  SCORE_ALARM: "SCORE_ALARM.webm",
  SUCCESS: "SUCCESS.webm",
  FAILOVER: "FAILOVER.webm",
};

exports.QUIZ_MAKER_TYPE = {
  BY_DEVELOPER: '개발자 제작 퀴즈',
  CUSTOM: '유저 제작 퀴즈',
  OMAKASE: '오마카세 퀴즈',
  UNKNOWN: '알 수 없음',
};

exports.ANSWER_TYPE = {
  SHORT_ANSWER: 1,
  OX: 2,
  MULTIPLE_CHOICE: 3,
};

exports.QUIZ_TAG = { // 태그는 32비트로 확장
  '선택 안함':     0b00000000000000000000000000000000,  // 0
  '음악 퀴즈':     0b00000000000000000000000000000001,  // 1
  '그림 퀴즈':     0b00000000000000000000000000000010,  // 2
  '텍스트 퀴즈':   0b00000000000000000000000000000100,  // 4

  '가요':          0b00000000000000000000000000001000,  // 8
  '애니':          0b00000000000000000000000000010000,  // 16
  '게임':          0b00000000000000000000000000100000,  // 32
  '방송':          0b00000000000000000001000000000000,  // 4096
  '드라마':        0b00000000000000000000000001000000,  // 64
  '영화':          0b00000000000000000000000010000000,  // 128
  '스포츠':        0b00000000000000000010000000000000,  // 8192
    
  '팝송':          0b00000000000000000000000100000000,  // 256
  'K팝':           0b00000000000000000000001000000000,  // 512
  'J팝':           0b00000000000000000000010000000000,  // 1024

  '기타':          0b00000000000000000000100000000000,  // 2048
	
  // 남은 비트: 0b11000000000000000000000000000000  // 3221225472
};

exports.DEV_QUIZ_TAG = { // 공식 퀴즈용 태그, 32비트로 확장
  "선택 안함":     0b00000000000000000000000000000000,  // 0
  // "음악 퀴즈":  0b00000000000000000000000000000001,  // 1
  // "그림 퀴즈":  0b00000000000000000000000000000010,  // 2
  // "텍스트 퀴즈":0b00000000000000000000000000000100,  // 4

  // "가요":       0b00000000000000000000000000001000,  // 8
  "애니":          0b00000000000000000000000000010000,  // 16
  "게임":          0b00000000000000000000000000100000,  // 32
  // "방송":       0b00000000000000000001000000000000,  // 4096
  "드라마":        0b00000000000000000000000001000000,  // 64
  "영화":          0b00000000000000000000000010000000,  // 128
  // "스포츠":     0b00000000000000000010000000000000,  // 8192
    
  "팝송":          0b00000000000000000000000100000000,  // 256
  "K팝":           0b00000000000000000000001000000000,  // 512
  // "J팝":        0b00000000000000000000010000000000,  // 1024

  // "기타":       0b00000000000000000000100000000000,  // 2048
  "고전가요":      0b00000000000000000100000000000000,  // 16384
};

