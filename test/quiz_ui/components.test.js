'use strict';

//quiz_ui/components.js에서 도메인별로 분리된 quiz_ui/components/*.js(REFACTOR_PLAN.md Phase 4)에
//대한 회귀 방지 테스트. UI 컴포넌트 정의 자체는 정적 데이터라 "로직" 검증보다는
//분리 과정에서 이름이 빠지거나 구조가 깨지지 않았는지 확인하는 데 집중한다.
//특히 modal_quiz_setting/modal_omakase_quiz_setting/modal_multiplayer_quiz_setting이
//일부러 같은 customId를 공유하는 부분(components.js 원본 주석 참고, applyQuizSetting
//핸들러가 이 customId로 라우팅됨)은 실수로 깨지기 쉬워 명시적으로 검증한다.

const test = require('node:test');
const assert = require('node:assert/strict');

const components = require('../../quizbot/quiz_ui/components');
const base_components = require('../../quizbot/quiz_ui/components/base_components');
const custom_quiz_components = require('../../quizbot/quiz_ui/components/custom_quiz_components');
const omakase_components = require('../../quizbot/quiz_ui/components/omakase_components');
const multiplayer_components = require('../../quizbot/quiz_ui/components/multiplayer_components.js');
const report_components = require('../../quizbot/quiz_ui/components/report_components');
const web_handoff_components = require('../../quizbot/quiz_ui/components/web_handoff_components');

test('components.js: 6개 도메인 파일의 export를 빠짐없이 재수출한다 (총 80개)', () =>
{
  // 죽은 export였던 note_ui_component는 Phase 6에서 삭제됨 (DEPRECATED_CODE_REMOVED.md 참고)
  // quiz_delete_confirm_admin_comp/admin_panel_comp는 관리자 기능 추가로 신설됨
  // select_quiz_type_btn_component는 SelectQuizTypeUI 전용 3버튼(죽은 버튼 정리)으로 신설됨
  // multiplayer_leave_confirm_comp/multiplayer_kick_confirm_comp는 파괴적 동작 확인 절차 추가로 신설됨
  // admin_ban_unban_confirm_comp는 밴 해제 확인 절차 추가로 신설됨
  // question_preview_comp는 B-2(문제 미리듣기) 구현으로 신설됨(이미지 재로드 버튼도 question_edit_comp에서 이쪽으로 이동)
  // force_take_comp(2026-08-13 이전 이름: web_handoff_force_take_comp)는 하이재킹 방어(Phase 1)로 신설됨
  // select_ui_mode_btn_component는 퀴즈 선택 웹 연동 투트랙 진입(SelectUIModeUI) 신설로 추가됨
  // admin_notice_create_btn_comp/admin_notice_manage_comp/admin_notice_delete_confirm_comp/
  // modal_notice_create/modal_notice_edit는 quizmgr 공지 관리 기능(2026-08-15) 신설로 추가됨
  // admin_panel_row2_comp/admin_maintenance_enable_btn_comp/admin_maintenance_manage_comp/
  // admin_maintenance_disable_confirm_comp/modal_maintenance_notice/modal_current_notice_edit는
  // quizmgr 점검 모드+실시간 공지 수정 기능(2026-08-15) 신설로 추가됨
  // admin_season_end_btn_comp/admin_season_end_confirm_comp/modal_new_season_name은
  // 스코어보드 시즌 아카이브(docs/plans/SCOREBOARD_SEASON_PLAN.md, 2026-08-15) 구현 중
  // quizmgr 시즌 관리(AdminSeasonUI) 기능으로 신설됨
  // omakase_basket_manage_open_comp/modal_basket_preset_save는 퀴즈함 관리+프리셋 UI
  // (docs/plans/QUIZ_BASKET_PRESET_UI_PLAN.md, 2026-08-18) 구현 중 신설됨 - 당시엔 request_basket_reopen_comp를
  // 멀티플레이 로비가 계속 쓰고 있어서 그대로 두고 오마카세 전용으로 별도 컴포넌트를 새로 만들었으나,
  // 2026-08-19 멀티플레이 로비까지 이식되며 request_basket_reopen_comp/omakase_basket_readonly_select_menu/
  // omakase_basket_select_menu/omakase_basket_select_row 4개가 완전히 죽은 코드가 돼 삭제됨(원문은
  // docs/archive/DEPRECATED_CODE_REMOVED.md 보존), 대신 multiplayer_basket_manage_open_comp(호스트
  // 길드용)/multiplayer_basket_view_comp(참가 길드용) 2개가 멀티플레이 전용으로 신설됨(80 - 4 + 2 = 78)
  // admin_lobby_delete_request_comp/admin_lobby_delete_confirm_comp는 멀티플레이 로비 관리자 강제삭제/
  // 영구밴 기능(2026-08-29) 신설로 추가됨(78 + 2 = 80)
  const expected_names = [
    ...Object.keys(base_components),
    ...Object.keys(custom_quiz_components),
    ...Object.keys(omakase_components),
    ...Object.keys(multiplayer_components),
    ...Object.keys(report_components),
    ...Object.keys(web_handoff_components),
  ].sort();

  const actual_names = Object.keys(components).sort();

  assert.equal(actual_names.length, 80);
  assert.deepEqual(actual_names, expected_names);
});

test('components.js: 도메인 파일 사이에 이름이 겹치지 않는다', () =>
{
  const all_names = [
    ...Object.keys(base_components),
    ...Object.keys(custom_quiz_components),
    ...Object.keys(omakase_components),
    ...Object.keys(multiplayer_components),
    ...Object.keys(report_components),
    ...Object.keys(web_handoff_components),
  ];

  assert.equal(new Set(all_names).size, all_names.length);
});

test('modal_quiz_setting/modal_omakase_quiz_setting/modal_multiplayer_quiz_setting은 일부러 같은 customId를 공유한다', () =>
{
  // components.js 원본 주석: "modal_quiz_setting으로 해둬야. applyQuizSetting이 호출됨"
  assert.equal(components.modal_quiz_setting.data.custom_id, 'modal_quiz_setting');
  assert.equal(components.modal_omakase_quiz_setting.data.custom_id, 'modal_quiz_setting');
  assert.equal(components.modal_multiplayer_quiz_setting.data.custom_id, 'modal_quiz_setting');
});

test('createOptionValueComponents: 옵션 이름에 따라 서로 다른 선택지를 만든다', () =>
{
  const audio_row = base_components.createOptionValueComponents('audio_play_time');
  const hint_row = base_components.createOptionValueComponents('hint_type');

  // customId는 'option_value_select'로 공통이지만, 옵션 목록은 option_name별로 달라야 한다
  assert.equal(audio_row.components[0].data.custom_id, 'option_value_select');
  assert.notDeepEqual(audio_row.components[0].options, hint_row.components[0].options);
});

test('option_value_components: 9개 옵션 키 전부에 대해 select row를 만든다', () =>
{
  assert.equal(Object.keys(base_components.option_value_components).length, 9);
});

test('quiz_tags_select_menu/quiz_search_tags_select_menu: QUIZ_TAG 태그 수만큼 옵션이 생긴다', () =>
{
  const { QUIZ_TAG } = require('../../config/system_setting.js');
  const expected_count = Object.keys(QUIZ_TAG).length;

  assert.equal(custom_quiz_components.quiz_tags_select_menu.components[0].options.length, expected_count);
  assert.equal(custom_quiz_components.quiz_search_tags_select_menu.components[0].options.length, expected_count);
});

test('omakase_custom_quiz_type_tags_select_menu/omakase_custom_quiz_tags_select_menu: tag_value 0은 두 목록에 모두 포함되고, 나머지는 정확히 한쪽에만 포함된다', () =>
{
  const { QUIZ_TAG } = require('../../config/system_setting.js');
  const total_tag_count = Object.keys(QUIZ_TAG).length;

  const type_tags_count = omakase_components.omakase_custom_quiz_type_tags_select_menu.components[0].options.length;
  const genre_tags_count = omakase_components.omakase_custom_quiz_tags_select_menu.components[0].options.length;

  // tag_value === 0인 태그 하나가 두 select menu 모두에 중복으로 들어가는 게 원본 로직의 의도된 동작
  assert.equal(type_tags_count + genre_tags_count, total_tag_count + 1);
});

test('select_btn_component/select_btn_component2: 각각 5개씩 버튼을 만든다 (1~5, 6~10)', () =>
{
  assert.equal(base_components.select_btn_component.components.length, 5);
  assert.equal(base_components.select_btn_component2.components.length, 5);
  assert.equal(base_components.select_btn_component.components[0].data.custom_id, '1');
  assert.equal(base_components.select_btn_component2.components[0].data.custom_id, '6');
});
