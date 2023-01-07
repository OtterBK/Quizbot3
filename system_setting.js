'use strict';

exports.SYSTEM_CONFIG = {
    language: 'kor', //사용 언어

    use_inline_volume: true, //성능 많이 잡아먹음, 렉 많으면 끌 것, false 설정 시, fade in,out 효과 없음
    fade_interval: 500, //fade in,out 시 사용할 interval(ms), 값이 낮을수록 부드러운 fade 효과를 얻을 수 있으나 리소스를 많이 잡아먹음
    fade_in_duration: 5000, //fade in 시간(ms)
    fade_out_duration: 5000, //fade out 시간(ms)

    max_check_prepared_queue: 300, //prepared queue 최대 확인 횟수
    prepared_queue_check_interval: 100, //prepared queue 체크 간격

    ui_holder_aging_manager_criteria: 600, //얼마나 오래된 holder를 삭제할 지(s)
    ui_holder_aging_manager_interval: 60, //체크 주기(s)
}

exports.CUSTOM_EVENT_TYPE = {
    interactionCreate: "interactionCreate",
    message: "message"
}

exports.QUIZ_TYPE = {
    SONG: "노래",
    SCRIPT: "대사",
    SELECT: "객관식",
    TTS: "TTS 사용방식",
    GLOWLING: "포켓몬 울음소리",
    PICTURE: "사진",
    OX: "OX퀴즈",
    QNA: "텍스트 기반 qna",
    FAST_QNA: "텍스트 기반 qna, 타이머 짧음",
    INTRO: "인트로 맞추기",
    MULTIPLAY: "멀티플레이",
    PICTURE_LONG: "타이머 긴 사진 퀴즈"
}
