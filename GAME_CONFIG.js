'use strict';

exports.config = {
    language: 'kor', //사용 언어

    use_inline_volume: true, //성능 많이 잡아먹음, 렉 많으면 끌 것, false 설정 시, fade in,out 효과 없음
    fade_interval: 500, //fade in,out 시 사용할 interval(ms), 값이 낮을수록 부드러운 fade 효과를 얻을 수 있으나 리소스를 많이 잡아먹음
    fade_in_duration: 5000, //fade in 시간(ms)
    fade_out_duration: 5000, //fade out 시간(ms)

    max_check_prepared_queue: 300, //prepared queue 최대 확인 횟수
    prepared_queue_check_interval: 100 //prepared queue 체크 간격
}