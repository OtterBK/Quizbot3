'use strict';

exports.SYSTEM_CONFIG = {
    language: 'kor', //사용 언어

    develop_mode: true, //개발자 모드 활성화, console 로깅 등

    use_inline_volume: true, //성능 많이 잡아먹음, 렉 많으면 끌 것, false 설정 시, fade in,out 효과 없음 
    fade_interval: 500, //fade in,out 시 사용할 interval(ms), 값이 낮을수록 부드러운 fade 효과를 얻을 수 있으나 리소스를 많이 잡아먹음
    fade_in_duration: 5000, //fade in 시간(ms)
    fade_out_duration: 5000, //fade out 시간(ms)
    fade_in_volume_initialize_term: 500, //fade in은 초기 볼륨을 설정하고 시작한다. 이때 볼륨 설정하고 일정한 텀을 줘야 제대로 적용된다.

    max_check_prepared_queue: 300, //prepared queue 최대 확인 횟수
    prepared_queue_check_interval: 100, //prepared queue 체크 간격

    ui_holder_aging_manager_criteria: 600, //얼마나 오래된 holder를 삭제할 지(s)
    ui_holder_aging_manager_interval: 600, //체크 주기(s)

    guilds_count_manager_interval: 5, //참여 중인 guild 수 체크 주기(s)

    correct_answer_cycle_wait: 6500, //정답 맞췄을 시, 얼마나 대기할 지
    timeover_cycle_wait: 6500, //타임오버 시, 얼마나 대기할 지
    graceful_timeover_max_try: 5, //타임오버 시, 부드러운 타임 오버를 위한 최대 시도 수
    graceful_timeover_interval: 500, //부드러운 타임 오버 체크 간격 (ms)

    explain_wait: 3500, //퀴즈 설명 단계에서 각 설명 텀
    ending_wait: 3500, //순위 발표 단계에서 각 순위 표시 텀

    explicit_close_audio_stream: false, //audio stream을 명시적으로 닫을 지, 대부분의 상황에서는 false로 하면됨

    bgm_path: `${__dirname}/resources/bgm`, //BGM 파일 위치
    dev_quiz_path: `${__dirname}/resources/quizdata`, //Dev퀴즈 파일 위치
    log_path: `${__dirname}/log`, //LOG 저장할 위치
    notices_path: `${__dirname}/resources/notices`, //공지사항 파일 위치
    patch_notes_path: `${__dirname}/resources/patch_notes`, //공지사항 파일 위치

    hint_percentage: 2, //4로 설정하면 정답 전체의 1/4만 보여주겠다는 거임
    hint_max_try: 1000, //힌트 만들 때 최대 시도 횟수

    pg_max_pool_size: 5, //Postgresql max pool 개수

    log_max_files: 10, //log로 남길 파일 최대 수
    log_max_size: '100m' //각 log 파일 최대 크기
}

exports.CUSTOM_EVENT_TYPE = {
    interactionCreate: "interactionCreate",
    messageCreate: "messageCreate"
}

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
}

exports.EXPLAIN_TYPE = {
    ShortAnswerType: "short_answer",
}

exports.BGM_TYPE = {
    BELL: "bell.mp3",
    COUNTDOWN_10: "countdown10.wav",
    COUNTDOWN_LONG: "longTimer",
    ENDING: "ENDING.mp3",
    FAIL: "FAIL.mp3",
    MATCH_FIND: "MATCH_FIND.mp3",
    MATCHING: "MATCHING.mp3",
    PLING: "pling.mp3",
    ROUND_ALARM: "ROUND_ALARM.mp3",
    SCORE_ALARM: "SCORE_ALARM.mp3",
    SUCCESS: "SUCCESS.mp3",
}

exports.QUIZ_MAKER_TYPE = {
    BY_DEVELOPER: '개발자 제작 퀴즈',
    CUSTOM: '유저 제작 퀴즈',
    UNKNOWN: '알 수 없음',
}

