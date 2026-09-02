# 완료 작업 로그 (2026-08-07 최초 작성, 이후 날짜순 추가)

> 여러 계획 문서에 흩어진 "이미 끝난 것"을 날짜순으로 짧게(3~5줄) 요약한 진입점 문서. 상세 내역/코드
> 위치/왜 그렇게 했는지는 각 항목이 가리키는 원본 문서 또는 `git log`에 있음 — 이 문서는 "뭐가 끝났는지
> 빠르게 훑어보는 용도"만. 아직 안 끝난 건 `docs/ACTIVE_PLAN.md` 참고.

---

## 2026-08-03 ~ 08-04 — 전체 구조 리팩터 (Phase 0~6)

5,959줄 `quiz_system.js`를 포함해 여러 대형 파일을 도메인/클래스 경계로 분리(facade 패턴 반복 적용:
`db_manager.js`, `utility.js`, `quiz_ui/components.js`, `report_manager.js`). `node:test` 스캐폴딩,
`eslint.config.js` 도입도 이 기간에 완료. 상세: `docs/plans/REFACTOR_PLAN.md`(전체 계획), `docs/archive/BUGS_FOUND.md`
(발견 버그), `docs/archive/DEPRECATED_CODE_REMOVED.md`/`docs/archive/RELOCATED_COMMENTS.md`(삭제 코드/주석 보존),
`docs/archive/DUPLICATE_UI_PATTERNS.md`(중복 패턴, 통합은 보류 결정).

## 2026-08-04 — 성능 관찰 로그 정리

리팩터 중 발견한 성능/메모리 포인트 기록만 해두고 수정은 보류(사용자 확인). `main-ui.js`의 죽은
`loadVersionInfo()`, `banned_user.txt` 반복 동기 읽기(`multiplayer_ban_manager.js`로 통합)는 이후
수정 완료. 상세: `docs/archive/PERFORMANCE_NOTES.md`.

## 2026-08-05 — UI 개선 1라운드 (`docs/plans/UI_IMPROVEMENT_PROPOSAL.md`)

퀴즈만들기 중심 UX 검토. 오타 3건, 파괴적 동작 안전장치 불균형(문제 삭제 2클릭 확인 추가), 임베드 구조화
(fields 분리), 주간 1위 데이터 오류(`played_count` vs `played_count_of_week` 혼용 버그) 등 0~5번 항목
대부분 완료. 잔여 2건은 `docs/ACTIVE_PLAN.md` B-3 참고.

## 2026-08-06 — UI 개선 2라운드 (`docs/plans/UI_IMPROVEMENT_PLAN_ROUND2.md`)

봇 전역으로 조사 범위 확대. **A번(실제 버그 7건) 전부 수정**(스코어보드 무한 로딩, 새로고침 순서 버그,
좋아요 실패 시 무응답, 전역 `unhandledRejection` 핸들러 부재, 죽은 버튼 3종 등). B번(UX 개선 후보)은
[P1] 다수 + B-2/B-4/B-10 일부 완료, 나머지는 `docs/ACTIVE_PLAN.md` B-4에 잔여 목록.

## 2026-08-07 — TS 전환 A-1~A-5 완료 (`docs/plans/TS_MIGRATION_AND_CONVENIENCE_PLAN.md`)

CommonJS 유지 + TypeScript 점진 도입(`allowJs`로 `.js`/`.ts` 공존). 빌드 파이프라인 구축(자원 경로,
`'use strict'` 자동삽입, `.ts`/`.js` 완전 분리 빌드 등 실제 구현하며 발견한 이슈 다수 해결) 후,
멀티플레이 제외 전체(`utility/`, `db/`, `managers/`, `quiz_ui/`, `quiz_system/`)를 `.ts`로 전환. 남은
건 A-3 6단계(멀티플레이)뿐 — 실전 대결 테스트 후 착수 예정.

## 2026-08-07 — 편의 기능 B-2/B-3'/B-4 구현

- **B-3' 문제(단일) 복제**: `question_edit_comp2`에 버튼 추가, 원본 데이터 복사해 바로 다음 위치에 삽입.
- **B-4 채팅 정지/취소 알림**: `notifyBannedUser()` 신설, 정지 사유/횟수/만료일을 밴 당사자에게 DM.
  후속 조치 시점엔 신고 로그가 이미 삭제돼 있어 `selectChatInfoById()`(신규 DB 쿼리)로 원문 재조회.
- **B-2 문제 미리듣기**: `generatePreviewClipStream()`(ffmpeg `-c copy`, 재인코딩 없음, 스트림 직접
  첨부) 신설. 당초 계획했던 `updatePrivateUI()` 프레임워크 확장은 `interaction.reply({files, flags:
  Ephemeral})` 방식으로 대체하며 불필요해짐(DM 컴포넌트+ephemeral+파일첨부 동작을 임시 테스트 버튼으로
  직접 검증 후 확정). 화면 레이아웃도 재배치(이미지 재로드+미리듣기 2개를 한 행에, 문제유형 선택은 맨
  아래로).

전수 테스트(멀티플레이 포함) 진행, 발견된 피드백 12건은 미착수 상태로 `docs/plans/POST_B_ROUND_TEST_FEEDBACK_TODO.md`에
정리(`docs/ACTIVE_PLAN.md` B-2 참고).

## 2026-08-08 — B-2 전수테스트 피드백 12건 중 실동작 버그 3건 수정 (1/4/5번)

- **5번**: `duplicateQuestion()`에서 `interaction.explicit_replied = true`를 성공 경로에서만 await 이후에
  설정하던 걸 함수 맨 첫 줄로 이동 — 그 사이 틈을 타 `bot.js` 전역 fallback이 먼저 `deferUpdate()`를
  호출해 `Interaction has already been acknowledged` 에러가 나던 문제 해결(1줄 수정, 원인 특정은 이미 돼있었음).
- **4번**: `audio_cache_manager.ts`에 `downloading_promises`(video_id → Promise) 가드 추가. 같은 오디오를
  미리듣기 연타 시 yt-dlp 프로세스를 중복 스폰하지 않고 진행 중인 다운로드의 Promise를 재사용하도록 함.
  미리듣기(`sendAudioPreview`)/실제 게임 재생(`prepare.ts`) 두 호출부 모두 자동 적용.
- **1번**: `interaction.user.send()`에 `flags: Ephemeral`을 줘도 효과가 없는(인터랙션 응답 전용 옵션이라)
  버그를 `user-quiz-info.ui.ts`(태그 미선택 안내, 퀴즈 삭제 확인 다이얼로그 3곳)와 `user-quiz-list-ui.ts`
  (퀴즈 생성 실패 안내)에서 발견돼 `interaction.reply()`/`followUp()`으로 전환(이미 초기 reply를 소비한
  경우는 `followUp()` 사용). 감사 중 `user-quiz-select-ui.ts`의 "장바구니에 담았습니다" 응답이 애초에
  `flags` 자체가 누락돼 길드 채널에 공개로 남던 별개의 버그도 함께 발견해 수정. 전수 조사로 요청됐던
  "퀴즈만들기 전체 화면 ephemeral 통일" 중 발견된 실제 버그 케이스는 이걸로 마무리, 나머지(단순 누락 없는
  화면)는 별도 조치 불필요로 판단.

남은 9건(2/3/6/7/8/9/10/11/12번, UX 개선 후보 + 조사 필요 TODO)은 `docs/plans/POST_B_ROUND_TEST_FEEDBACK_TODO.md`에
계속 남아있음 — 다음 세션에서 우선순위 논의 후 진행.

## 2026-08-08 — B-2 전수테스트 피드백 UX/텍스트 5건 수정 (2/3/6/9/10번)

- **2번**: `custom_quiz_components.ts`의 `question_preview_comp` — "이미지 재로드" 버튼 스타일을 옆 미리듣기
  버튼들과 맞춰 `ButtonStyle.Secondary`로 통일.
- **3번**: `sendAudioPreview()` — 오디오 구간 미지정(`custom_audio_start === undefined`)이라 랜덤 구간이
  재생되는 경우, `convertAudioRangeToString()`의 "[랜덤 구간 재생]" 톤에 맞춘 안내 문구를 미리듣기
  응답에 추가.
- **9번**: 멀티플레이 로비 문제 수 모달 라벨 "최대 50" → 실제 상한(60)에 맞춰 수정
  (`multiplayer_components.js`, 생성/설정 모달 둘 다). `docs/plans/UI_IMPROVEMENT_PLAN_ROUND2.md` B-6의
  [P3] 동일 건도 같이 완료 표시.
- **10번**: 멀티플레이 로비 설명 문구에 "채팅이 밀려 화면이 안 보이면 '/퀴즈'를 다시 입력해 UI를 새로 받을
  수 있다"는 안내 추가(`multiplayer-quiz-lobby-ui.js`). `createMainUIHolder()`가 멀티플레이 로비
  참가 중이면 새 UI 대신 기존 로비 UI를 재전송하는 기존 로직(`ui-system-core.ts`)과 맞아떨어짐을 확인 후 반영.
- **6번**: 유저 퀴즈 목록 정렬 드롭다운(`base_components.ts`의 `sort_by_select_menu`) 위치 특정.
  사용자 피드백(수식어 방식이 항목마다 제각각) 확인 후 "전체 추천순"→"추천순", "최신 퀴즈순"→"최신순",
  "오래된 퀴즈순"→"오래된순"으로 정리(주간/전체 구분이 실제로 필요한 인기순만 수식어 유지).

남은 4건(7/8/11/12번, 전부 조사·논의 필요 TODO)만 `docs/plans/POST_B_ROUND_TEST_FEEDBACK_TODO.md`에 남음.

## 2026-08-08 — B-2 피드백 7번(webm seek 부정확) 원인 규명 + 수정, 8번 원인도 상당 부분 규명

- **발견**: `utility/SeekStream/WebmSeeker.js`의 `seek(content_length)`(71-93번 줄) — webm 파일 내장
  Cues 테이블(실제 timestamp→byte position 매핑)로 정확한 클러스터 offset을 계산하고 클러스터 내부
  로컬 비트레이트로 보간하는, 이미 완성된 정확한 seek 로직이 **코드베이스 어디서도 호출되지 않는 죽은
  코드**였음. 실제 `SeekStream`의 seek 흐름(`SeekStream.js`의 `loop()`)은 이걸 무시하고 전체 파일
  평균 비트레이트 추정(`per_sec_bytes * sec`)만 써서, VBR 인코딩에서 ±3초 오차가 났던 것(7번 재현 조건).
- **검증**: 실제 캐시 파일(`resources/cache/`) 5개를 직접 바이트 단위로 파싱해서 Cues가 정확히 10초
  간격으로 존재함(코드의 가정과 일치)과, `seek()`가 계산한 byte offset 바로 뒤(12바이트 이내)에
  `Cluster` 엘리먼트와 실제 오디오 블록이 정확히 위치함을 확인. `SeekStream`을 실제로 생성해 스트림이
  에러 없이 정상적으로 오디오 데이터를 흘려보내는 것까지 end-to-end로 확인.
- **수정**: `SeekStream.seek()`가 헤더 파싱 후 `WebmSeeker.seek()`를 먼저 시도하고(`this.accurate_start_point`),
  실패/범위초과 시(Cues 없음, 또는 seek 대상이 Cues 범위 밖이라 `0`을 반환하는 엣지케이스) 기존 추정
  방식으로 자동 폴백하도록 연결(`SeekStream.js` 2곳 수정).
- **8번**: 재현 사례(100~140초 요청 시 미리듣기 90~137초, 실제 97~137초)를 재분석 — 끝점(137초)이
  같은 건 두 경로가 같은 `audio_duration_sec` 클램프를 써서 정상이었고(원본 길이가 137초), 진짜 차이는
  시작점뿐. 실제 재생(-3초)은 7번과 같은 원인, 미리듣기(-10초)는 ffmpeg `-c copy`의 클러스터 경계 스냅
  때문으로 — 8번은 별개 버그가 아니라 7번과 같은 "seek 부정확" 문제가 서로 다른 두 메커니즘에서 다르게
  나타난 것으로 결론.
- **주의**: 정적 분석(바이트 검증)과 스트림 에러 유무까지만 확인했고, **실제 Discord 음성 재생으로 들어보는
  검증은 못 함**(도구로 라이브 재생 불가) — `docs/TEST_CHECKLIST.md` I번 섹션에 검증 항목 추가, 문제
  있으면 `this.accurate_start_point` 관련 코드만 되돌리면 기존 동작으로 즉시 롤백 가능.

남은 2건(11/12번, MMR·추첨 알고리즘 — 둘 다 논의부터 필요)만 `docs/plans/POST_B_ROUND_TEST_FEEDBACK_TODO.md`에 남음.

## 2026-08-08 — B-2 피드백 7번 실사용자 검증 완료 + 8번(미리듣기 구간 불일치) 수정 완료

- **7번 실사용자 검증**: 사용자가 실제 봇으로 재생 테스트 → 처음엔 여전히 부정확(80~90초 요청이 70초부터
  재생). 원인은 코드 버그가 아니라 **`dist/`(빌드 산출물)가 재빌드 안 돼서 옛날 코드 그대로 실행되고
  있었던 것**(`dist/utility/SeekStream/SeekStream.js`를 소스와 diff해서 확인). `npm run build`로 재빌드
  후 정상 동작 확인받음. (부수적으로 `Set-ExecutionPolicy` 미설정 환경에서 `npm run build`가 PowerShell
  보안 정책에 막히는 것도 확인 — `npm.cmd run build`로 우회 가능.)
- **8번 원인 규명 + 수정**: `generatePreviewClipStream()`의 `.setStartTime()`(fluent-ffmpeg, `-ss`를
  `-i` 앞에 붙이는 input seek)이 `-c copy`와 만나 요청 시각보다 최대 10초 이른 클러스터 경계로 스냅백하는
  게 원인(`ffmpeg ... -f null -` 드라이런으로 타임스탬프만 실측, 오디오 파일 생성 없이 확인:
  input seek `time=-00:00:09.97` vs output seek `time=00:00:00.00`). fluent-ffmpeg의 output seek
  메서드 `seekOutput()`으로 교체해 해결 — 컨테이너 seek 속도는 그대로, 정확도만 개선.
- **2026-08-08 사용자 실제 검증 완료**: 7번(재생 시작 지점), 8번(미리듣기 구간) 둘 다 사용자가 실제
  봇으로 재생해서 정상 동작 확인함. `docs/TEST_CHECKLIST.md` I번 섹션 체크 완료로 갱신.

이걸로 B-2 피드백 12건 중 10건 완료 + 실제 검증까지 끝남. 남은 건 11/12번(MMR·추첨 알고리즘 개선,
둘 다 논의부터 필요한 TODO)뿐.

## 2026-08-08 — 퀴즈 선택 웹 연동 설계 + UI 목업

사용자가 제시한 원 설계서(단일 프로세스+인메모리 Map+임시 토큰)를 이 프로젝트의 실제 구조(멀티 클러스터
`discord-hybrid-sharding`)에 맞게 보정 — 마스터 프로세스에 세션 상태를 두고 기존 멀티플레이 IPC
브로드캐스트+로컬필터링 패턴을 재사용하는 방향으로 확정. 오마카세 퀴즈의 실제 코드 구조(공식 퀴즈
장르선택 + 유저 퀴즈 장르모드/바구니모드 이원 구조, `DEV_QUIZ_TAG`/`QUIZ_TAG` 비트플래그 태그 체계)를
조사해 반영. 사용자 피드백을 여러 차례 받아가며 UI 목업(`docs/mockups/WEB_UI_MOCKUP.html`, 자체완결 HTML, 다크모드
지원)까지 완성해 최종 승인받음. 코드 구현은 착수 전(다음 세션부터) — 상세 설계/파일 목록/단계별 순서는
`docs/plans/WEB_INTEGRATION_PLAN.md`, 미착수 상태 요약은 `docs/ACTIVE_PLAN.md` B-0.

## 2026-08-08 — 퀴즈 선택 웹 연동 네이밍 변경 + Phase 0(인프라 스켈레톤) 착수

- **네이밍 변경**: "장바구니"→"퀴즈함", "오마카세 퀴즈"→"랜덤 퀴즈" 둘 다 디스코드 쪽 사용자 노출
  문구(버튼 라벨/embed/모달/interaction.reply)까지 변경, 내부 변수·함수·클래스명(`basket_items`,
  `OmakaseQuizRoomUI`, `QUIZ_TYPE.OMAKASE` 등)은 유지(사용자 결정). `quiz-info-ui.ts`,
  `omakase-quiz-room-ui.ts`, `multiplayer-quiz-lobby-ui.js`, `user-quiz-select-ui.ts`,
  `components/omakase_components.ts`, `components/multiplayer_components.js`,
  `config/text_contents.json`, `config/system_setting.js`(`QUIZ_TYPE`/`QUIZ_MAKER_TYPE` 값 문자열),
  `lifecycle/ending.ts`/`lifecycle/question/question_custom.ts` 수정.
- **Phase 0**: `ipc_manager.ts`에 `WEB_SESSION_REQUEST`(클러스터→마스터)/`WEB_SESSION_SIGNAL`(마스터→전체
  클러스터)를 `MULTIPLAYER_SIGNAL`과 대칭 구조로 추가. 마스터 전용 `quizbot/managers/web/web_session_manager.ts`
  신설(토큰 발급/force_take/close/heartbeat/GC, `crypto.randomBytes` 기반 `web_token_utility.ts` 사용) +
  `web_express_app.ts`(Express 골격, `/health` + 정적 서빙). `index.js`에 초기화/IPC 분기 추가,
  `bot.js`엔 수신 로그만 남기는 placeholder relay 등록(실제 UI 라우팅은 Phase 1의 `WebHandoffUI`부터).
  단위테스트 10건(`test/managers/web/web_session_manager.test.js`) + `utility.js` export 개수 회귀
  테스트 갱신(25→26개, `web_token_utility` 추가분). UI 변경 없음 — Phase 1(공식 퀴즈 웹 선택)부터 이어감.

## 2026-08-08 — 퀴즈 선택 웹 연동 Phase 1(공식 퀴즈) 완료, 체크포인트 방식으로 전환

Phase 0 스켈레톤 위에 실제 기능을 얹음 - 계획했던 "Phase 1~3 한 번에"는 도중 리스크 발견(시그널
핸들러가 동기 계약이라 async UI 전환에 우회 필요, 하이재킹 버튼이 기존 소유자 라우팅과 충돌, 프론트엔드
Tailwind 재작성이 승인된 CSS 대비 드리프트 위험)으로 사용자와 협의 후 **체크포인트 3개(Phase별)**로
전환하기로 함.

- **백엔드**: `web_session_manager.ts`에 `mode`/`updateSelection`(select 액션) 추가 - 세션은 여전히
  스테이트리스, 실제 quiz_info 조립은 신호를 받는 클러스터 쪽이 담당하는 구조로 확정. `web_express_app.ts`에
  세션 인증 미들웨어 + `/api/session`, `/api/dev-quizzes`, `/api/session/select`, `/api/session/confirm`
  구현(문제 수는 마스터가 dev 트리의 `quiz_size`로 서버 사이드 클램프).
- **디스코드 UI**: `WebHandoffUI`(신규) - 잠금 화면 + `WEB_SESSION_SIGNAL` 3종(`updated`/`unlocked`/
  `expired`) 처리. `dev-quiz-select-ui.ts`의 `generateDevQuizInfo`를 static으로 승격 + `findContentByPath`
  신설(웹이 넘긴 `content_path`로 이미 로드된 트리에서 원본 재조회). `select-quiz-type-ui.ts`의 `'1'`
  분기가 `WebHandoffUI('dev', ...)`로 교체됨.
- **하이재킹 방어**: 다른 유저가 `/퀴즈`를 누르면 ephemeral "권한 가져오기" 버튼 안내 → 버튼 클릭은
  uiHolder 소유자 체크보다 먼저 가로채서 처리(`bot.js`) → `force_take` IPC → 홀더를 새 소유자로 교체
  (`createWebHandoffUIHolder`, `UIHolder`가 소유자 재할당을 지원하지 않아 free 후 재생성 + 이미
  `deferUpdate()`된 interaction 대응으로 `public_message_mode` 스위치 재사용).
- **프론트엔드**: `web-frontend/`(React+Vite) 신설. 원래 계획은 Tailwind였지만 승인된 목업이 순수 CSS라
  `styles.css`로 그대로 이식하기로 사용자와 합의 변경. 공식 퀴즈 탭(폴더 트리+상세+문제수 스테퍼+확정)
  완전 동작, 유저/랜덤 탭은 자기 모드가 아니면 비활성화(Phase 2/3에서 활성화 예정).
- **검증**: 신규 테스트 19건(`web_session_manager` 12건, `web_express_app` 실제 Express 서버+fetch
  통합테스트 7건). `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(241 pass)/`npm run build`
  (백엔드+프론트엔드) 전부 통과 + Express가 빌드된 프론트엔드를 실제로 서빙하며 `/api/dev-quizzes`가
  진짜 `resources/quizdata` 트리를 반환하는 것까지 fetch로 실측. **실제 Discord 클라이언트 검증은 아직
  안 함** - 다음 세션에서 봇 재시작 후 우선 확인.

상세: `docs/plans/WEB_INTEGRATION_PLAN.md`(신규/변경 파일 전체 목록, Phase 2/3 착수 시 필요한 아키텍처 메모).

## 2026-08-08 — 웹 연동 Phase 1 1차 실사용 테스트 버그 3건 수정

사용자가 실제 봇으로 기본 흐름(잠금→선택→확정→`DevQuizInfoUI` 전환)까지는 정상 확인, 이어서 "확정 후
문제 수 재변경 안 됨" / "확정 후 다른 퀴즈로 안 바뀜" / "웹에서 `invalid_or_expired_token` 에러" 3건
보고. 원인은 하나 — "선택 완료"가 서버 쪽에서 웹 세션 토큰을 즉시 파기하는 일방향 동작인데(디스코드
화면이 `WebHandoffUI`에서 `DevQuizInfoUI`로 완전히 교체돼 더 이상 웹의 갱신을 받을 곳이 없음) 웹
페이지가 이걸 반영 안 하고 계속 조작 가능한 척 보여줬던 것. `web-frontend/src/DevQuizTab.jsx`(확정 후
명확한 종료 화면, 더 이상 트리/스테퍼 조작 불가)와 `App.jsx`(모든 401을 공통 "세션 만료" 화면으로
통일 + 하트비트가 무효화 감지 시 자동 정지)로 수정. 확정 후 재선택 자체가 불가능한 건 의도된 제약으로
남겨둠(문제 수만 바꾸려면 디스코드의 기존 "퀴즈 설정" 버튼 사용, 다른 퀴즈는 `[/퀴즈]` 재입력) —
`docs/plans/WEB_INTEGRATION_PLAN.md` Phase 1 항목에 상세 기록. `docs/TEST_CHECKLIST.md` O 섹션에 재검증
목록 갱신(기본 흐름은 실사용 확인 완료로 체크됨, 이번 수정분은 미검증 상태로 추가).

## 2026-08-08 — 웹 연동 Phase 1 토큰 생명주기 재설계 (응급 수정 대신 근본 원인 해결)

바로 위 항목("확정 후 재선택 자체가 불가능한 건 의도된 제약으로 남겨둠")을 사용자와 다시 논의한 결과,
근본 원인을 고치기로 결정. 세 가지 질문에서 출발:
1. "GC가 15분 뒤에 정리해주는데 왜 고아 토큰이 문제냐" → 하트비트가 살아있는 한 GC는 절대 못 잡는다는
   게 핵심(고아가 된 뒤에도 브라우저 탭이 계속 하트비트를 보내면 `expires_at`이 매번 갱신되어 무한정
   버팀 — 15분은 "하트비트가 아예 안 오는 경우"에만 적용되는 상한).
2. 하트비트 vs GC가 실제로 어떻게 다른지(하트비트=탭 하나의 만료시각 갱신, GC=전체 순회+정리, 서로
   완전히 독립).
3. "UI는 다 같은 최상위 클래스를 상속하니 신호 응답도 범용 아니냐" → 라우팅(`relayWebSessionSignal`)은
   이미 범용이지만 응답 로직은 화면마다 opt-in 구현이 필요하다는 걸 확인.

최종 설계: `web_session_manager.ts`의 `closeSession`(브로드캐스트+파기 묶음)을 `applySelection`(브로드캐스트만,
토큰 유지)과 `releaseSession`(조용히 파기, 브로드캐스트 없음)으로 분리. 토큰 파기 지점을 "선택 완료"에서
떼어내 (1) `quiz-info-ui.ts`의 `handleStartQuiz`(퀴즈 실제 시작) (2) `ui-system-core.ts`의
`UIHolder.free()`(홀더가 어떤 이유로든 사라질 때 — 하이재킹이 아닌 정상적인 새 명령어 진입까지 포함해
고아 토큰을 원천 차단)로 이동. `dev-quiz-select-ui.ts`에 `buildDevQuizInfoFromWebPayload` 공용 헬퍼를
추출해서 `web-handoff-ui.ts`(최초 적용)와 신규 구현한 `dev-quiz-info-ui.ts`의 `onReceivedWebSessionSignal`
(확정 후 재적용, 새 UI 인스턴스 대신 `this`를 반환해 `prev_ui_stack`이 안 쌓이게 함)이 공유. 이벤트명도
`unlocked`→`applied`로 개명(더 이상 "잠금 해제=세션 종료"를 의미하지 않아서). `web-frontend/src/DevQuizTab.jsx`는
직전 커밋의 "종료 화면"을 되돌리고, 원래 승인된 목업의 `flashConfirm`처럼 확정 시 1.5초짜리 토스트만
보여주는 방식으로 교체 — 확정 후에도 계속 조작 가능.

신규/갱신 테스트: `web_session_manager.test.js`(closeSession 테스트를 applySelection/releaseSession
테스트로 교체 + release no-op 테스트 추가, 14건), `web_express_app.test.js`(confirm 후 토큰 유지 확인 +
confirm 연속 2회 재선택 테스트 추가, 8건) — 백엔드 전체 244 pass, `tsc --noEmit`/`lint` 0 error 유지,
백엔드+프론트엔드 둘 다 빌드 확인. **아직 실제 Discord로 검증 안 함** — 특히 "확정 후 재선택"과
"UIHolder.free() 훅으로 고아 토큰 방지"가 다음 세션 최우선 확인 대상.

## 2026-08-08 — 실사용 테스트 중 발견: 확정 후 재선택 시 순환 require로 크래시

바로 위 재설계를 실제 봇으로 테스트하자마자(퀴즈1 확정 → 퀴즈2로 재선택) 서버 로그에
`Cannot read properties of undefined (reading 'buildDevQuizInfoFromWebPayload')` 발생. 원인:
`dev-quiz-select-ui.ts`가 이미 `dev-quiz-info-ui.ts`를 require하고 있는데(퀴즈 선택 시 `DevQuizInfoUI`
생성용), 재설계하면서 `dev-quiz-info-ui.ts`에도 `dev-quiz-select-ui.ts`를 top-level로 require하는 코드를
추가해 순환 require가 됨 — CommonJS 순환 require에서는 나중에 로드되는 쪽이 상대방의 텅 빈(아직 완성
안 된) `module.exports`를 캡처해버려서 `DevQuizSelectUI`가 `undefined`로 잡혔음. `dev-quiz-info-ui.ts`의
`require('./dev-quiz-select-ui')`를 `onReceivedWebSessionSignal` 함수 안으로 미뤄서(이벤트 발생 시점엔
모든 모듈 로드가 끝난 뒤라 순환이 있어도 안전) 수정. `test/quiz_ui/dev_quiz_web_reapply.test.js`(신규,
3건) 추가 — fix를 일부러 되돌려서 실제로 같은 에러가 재현되는 것까지 확인한 뒤 커밋. 이 테스트 파일은
`ui-system-core.ts`를 거치지 않고 `dev-quiz-select-ui.ts`/`dev-quiz-info-ui.ts` 둘만 직접 require함 —
`select-quiz-type-ui.ts`가 `require("./user-quiz-select-ui.js")`처럼 dist/ 빌드를 전제로 한 `.js`
확장자를 하드코딩해둔 곳이 있어서, `ui-system-core.ts`를 통해 로드하면 ts-node 기반 `node:test`에서
`MODULE_NOT_FOUND`로 죽는다(quiz_ui 트리를 평소 유닛테스트 안 하는 관례의 실제 이유였음 — 이번에 처음
확인). 전체 247 pass, `tsc`/`lint` 0 error 유지.

## 2026-08-08 — 웹 연동 Phase 1 실사용 재검증 완료, 세션 마무리

순환 require 수정 후 사용자가 실제 봇으로 다시 테스트 — 기본 흐름(잠금→웹 선택→확정→`DevQuizInfoUI`
전환) + 확정 후 다른 퀴즈로 재선택까지 정상 동작 확인. `docs/TEST_CHECKLIST.md` O 섹션에 확인된 항목
체크 완료, 남은 미확인 항목(문제 수만 재변경/뒤로가기 스택/퀴즈 시작 후 세션 종료/하이재킹/GC 만료/
고아 토큰 방지/다크모드)은 급하지 않은 걸로 분류해서 다음 세션으로 이월. Phase 1은 핵심 흐름 기준으로
안정화된 것으로 판단, 다음 세션은 Phase 2(유저 퀴즈 웹 선택)부터 — `docs/ACTIVE_PLAN.md` B-0,
`docs/plans/WEB_INTEGRATION_PLAN.md` "단계별 구현 순서" 3번 참고.

## 2026-08-10 — 퀴즈 선택 웹 연동 Phase 4(멀티플레이 퀴즈) 설계+구현 완료, 같은 세션

전 세션에서 설계만 끝내고 미룬 "착수 전 확인 체크리스트" 4개를 먼저 확인: (1) `ban_manager.initialize()`가
`bot.js`(클러스터)에서만 호출되고 있었음 - 파일 기반 싱글턴이라 `index.js`(마스터)에도 안전하게 추가.
(2) 대기실 목록 - `index.js`가 `MULTIPLAYER_SIGNAL`을 `multiplayer_manager.onSignalReceived`로 이미
인프로세스(마스터) 처리하고 있어서, `REQUEST_LOBBY_LIST` 핸들러도 이미 마스터에서 실행 중이었음(IPC
왕복 불필요, 예상보다 좋은 상황). (3) `createLobby`/`tryJoinLobby`/`applyQuizSettings`의 interaction
의존 - 모달 필드 읽기뿐 아니라 `interaction.reply()`(성공/실패 피드백)까지 의존한다는 걸 발견해 사용자에게
대응 방식을 확인받음("페이로드 직접 대입 + 신규 메서드" 선택). (4) 조사 결과를 반영해 설계 재확인 후
곧장 구현 착수.

**구현**: `index.js`(마스터 `ban_manager.initialize()` 추가), `web_express_app.ts`(`GET
/api/multiplayer-lobbies` - 마스터가 `multiplayer_manager.onSignalReceived`를 인프로세스 직접 호출,
`/api/session/confirm`에 `mode:'multiplayer'` 분기 - 밴 체크만 마스터에서 선제 처리하고 나머지는
브로드캐스트), `web-handoff-ui.ts`(`buildMultiplayerUI` 신규 - `MultiplayerQuizSelectUI.createLobby`/
`tryJoinLobby`와 동일한 밴/음성채널 체크를 직접 재현한 뒤 `{guild, member, channel, web_mode:true}`
어댑터로 `MultiplayerQuizLobbyUI`를 곧장 생성, 음성채널 체크는 진짜 `GuildMember`가 필요해
`guild.members.fetch`로 실제 조회), `multiplayer-quiz-lobby-ui.js`(`static applyWebPayloadToQuizInfo`/
`buildMultiplayerQuizInfoFromWebPayload` - quiz_info shape이 랜덤 퀴즈와 같아서
`OmakaseQuizRoomUI.applyWebPayloadToQuizInfo`를 그대로 재사용 + 방 제목만 추가, `is_web_origin`
플래그로 모달 읽기/`interaction.reply()` 의존 경로 분기, `onReceivedWebSessionSignal` 신규),
`web-frontend/src/MultiplayerTab.jsx`(신규 - 대기실 목록→"새 로비 만들기" 폼(`OmakaseTab.jsx`와 동일
셰이프, 문제 수 상한만 60)→완료 안내 3단계, `OmakaseTab.jsx`의 `ChipRow`/`BasketQuizCard`를 export해서
재사용).

**구현 중 발견한 회귀**: `multiplayer-quiz-lobby-ui.js`가 `require("./user-quiz-select-ui.js")`처럼
dist 빌드를 전제로 한 확장자를 하드코딩해둔 기존 코드가 있었는데, `web-handoff-ui.ts`가 이 파일을
top-level에서 require하게 되면서 `web-handoff-ui.ts`를 직접 require하는 기존 테스트
(`omakase_web_apply.test.js`/`user_quiz_web_apply.test.js`, multiplayer와 무관한 mode)까지 ts-node
모듈 해석에서 `MODULE_NOT_FOUND`로 깨짐 - `npm test`로 실제 발견. `MultiplayerQuizLobbyUI` require를
`buildMultiplayerUI` 함수 안으로 미뤄서(2026-08-08 순환 require 수정과 동일한 종류의 우회) 해결,
회귀 없이 267 pass 복구.

**검증**: `npx tsc --noEmit`(0 error)/`npm run lint`(0 error, 58 warning 기존 수준 유지)/`npm test`
(267 pass)/`npm run build`(백엔드+프론트엔드) 전부 통과. **미검증**: 실제 Discord+브라우저 테스트
전무(참가/생성/음성채널 체크/재확정/2클러스터 이상 IPC 왕복) - 다음 세션 최우선. 알려진 설계상 한계
2가지(확정 응답이 항상 성공으로 보임 - 실제 실패는 디스코드 채널에서만 안내됨, 생성 폼에 실시간
미리보기 없음)는 `docs/plans/WEB_INTEGRATION_PLAN.md` Phase 4 "알려진 한계" 참고.

## 2026-08-10 — 퀴즈 선택 웹 연동 Phase 4 실사용 피드백 6건 수정 (같은 세션)

Phase 4 최초 구현 직후 사용자가 실제 브라우저로 테스트해 발견한 문제 6건 처리.

- **1/2번(스타일)**: "새로고침" 버튼과 방 제목 입력칸이 브라우저 기본 스타일 그대로라 눈에 띄게
  촌스러웠던 문제 — `styles.css`에 `.btn-secondary`(보조 버튼)/`.text-field`(텍스트 입력)/`.error-banner`
  (오류 배너) 3개 클래스 신설, 앱 전체 디자인 시스템(gold/violet 팔레트, 기존 `.cta-primary`/
  `.search-field`와 통일된 radius/padding)에 맞춤.
- **3/6번(진짜 원인)**: 음성채널 미접속 상태로 로비 생성 시도 → 에러 없이 조용히 실패(3번) → 음성채널에
  들어간 뒤 재시도해도 여전히 로비가 안 생김(6번). 원인은 하나 — `WebHandoffUI.buildMultiplayerUI`가
  밴/음성채널 체크 실패 시 `this.goToBack()`을 불렀는데, 이게 `WebHandoffUI` 자신을 `prev_ui_stack`의
  이전 화면(`SelectUIModeUI`)으로 교체해버림. 그래서 최초 실패(음성채널 미접속) 직후 `WebHandoffUI`가
  이미 사라진 상태가 됐고, 그 뒤 웹에서 아무리 재시도해도(음성채널에 들어간 뒤라도) 신호를 받을 화면
  자체가 없어 완전히 먹통이었던 것. `goToBack()`을 제거하고 실패 시 `this.last_error`를 채워
  `refreshLockedEmbed()`로 잠금 화면에 실패 사유만 얹어 보여주면서 `WebHandoffUI`를 유지하도록 수정 —
  재시도가 정상 동작하게 됨. 추가로 웹에도 실제 에러가 뜨도록 `web_session_manager.ts`에
  `reportMultiplayerResult`/`consumeMultiplayerResult`(세션에 1회성 `multiplayer_result` 필드), 마스터
  IPC에 `report_multiplayer_result` 액션, Express에 `GET /api/multiplayer-result` 신설 — 클러스터가
  밴/음성채널 체크 결과를 마스터에 보고하면, 프론트엔드가 confirm 직후 짧게 폴링(`pollMultiplayerResult`,
  최대 8회×400ms)해서 실패 시 오류 배너로 표시.
- **4/5번(생성 후에도 계속 편집)**: `MultiplayerQuizLobbyUI.onReceivedWebSessionSignal`은 이미 로비
  생성 후 재확정을 지원하고 있었지만(Omakase와 동일 패턴, Phase 4 최초 구현에 포함돼 있었음),
  `MultiplayerTab.jsx`가 생성 성공 시 곧장 종료 화면("done")으로 보내버려서 실제로는 활용이 안 되고
  있었던 게 진짜 문제. 생성 후에도 같은 설정 화면에 머물며 계속 태그/퀴즈함/문제 수/방 제목을 바꿔
  재확정할 수 있도록 수정("🌐 변경사항 반영" 버튼으로 라벨 전환), "대기실 목록으로" 버튼은 로비 운영
  중엔 숨김(실수로 두 번째 로비를 만드는 것 방지) — 이 수정으로 5번이 물었던 "생성→목록→재생성 시
  이전 설정이 남는" 시나리오 자체가 더 이상 발생하지 않게 됨(생성 전 초안 상태에서 목록으로 나갔다가
  다시 여는 경우는 여전히 초안이 남는데, 사용자 확인 후 의도적으로 그대로 둠).

검증: `npx tsc --noEmit`(0 error)/`npm run lint`(0 error, 58 warning 기존 수준 유지)/`npm test`(267
pass)/`npm run build`(백엔드+프론트엔드) 전부 통과. **아직 실제 Discord+브라우저 재검증 전** — 특히
"실패 후 재시도" 케이스가 이번 수정의 핵심이라 다음 세션 최우선 확인 대상(`docs/TEST_CHECKLIST.md` R
섹션 갱신됨).

## 2026-08-10 — Phase 4 추가 피드백 4건 + 웹 세션 만료 점검 + 퀴즈 만들기 웹 UI 인수인계 문서

바로 위 "Phase 4 실사용 피드백 6건 수정" 이후 사용자가 이어서 준 피드백 4건 처리.

- **참가 후 "대기실 목록으로" 제거**: 참가(join) 완료 화면에서 목록으로 돌아가는 버튼을 없앰 —
  참가 이후엔 디스코드 UI로만 조작하는 게 맞다는 사용자 방침(새 로비 만들기는 예외 - 로비를 계속
  운영하며 웹에서 설정을 바꿀 수 있어야 하니 그대로 둠). 이제 `view:'done'`은 join 전용이라 더 이상
  안 쓰는 `doneAction` state도 같이 정리.
- **버튼 스타일 재작업**: 실제 원인은 `.cta-primary`가 `width:100%` 고정이라 `.toolbar`(가로 flex)
  안에 넣으면 레이아웃이 깨지고 있었던 것 — `.toolbar-cta`(내용 너비만 차지하는 골드 버튼)/
  `.icon-btn`(새로고침 같은 아이콘 전용 정사각형 버튼)/`.link-btn`(뒤로가기용 텍스트 링크 스타일)
  3개로 재설계, 기존 `.btn-secondary`는 제거.
- **웹 세션 15분 만료 점검(코드 트레이스로 확인, 실제 장시간 방치 테스트는 아직 안 함)**: 로비를
  만들고 오래 방치해도 웹을 열어둔 채면 토큰이 안 끊기는지 확인 요청 → 두 개의 독립된 자동 갱신
  메커니즘이 이미 있어서 정상 동작할 것으로 결론남. (1) 웹 쪽: `App.jsx`가 60초마다
  `heartbeat()`를 보내 토큰의 `expires_at`을 15분(`WEB_SESSION_EXPIRE_SEC=900`)씩 계속 연장 -
  탭이 바뀌어도 `App` 컴포넌트 자체는 안 없어지므로 계속 동작. (2) 디스코드 쪽: `UIHolder`도
  자체적인 idle 정리 로직(`uiHolderAgingManager`, `UI_HOLDER_AGING_MANAGER_CRITERIA=900`)이 있어서
  `last_update_time`이 15분 넘게 안 갱신되면 홀더 자체가 `free()`되고(웹 세션도 함께 해제됨) -
  `MultiplayerQuizLobbyUI`는 이미 `checkNeedToRefresh`(1분마다 체크, 메시지가 10분 넘게 오래됐으면
  재전송)가 있어서 로비 생성 후엔 이게 자동으로 `last_update_time`을 계속 갱신해준다는 걸 코드로
  확인 - 두 메커니즘 다 살아있으니 안 끊길 것. **단, 로비를 만들기 전(잠금 화면에서 대기 중)엔 이
  자동 갱신이 없어서, 15분 넘게 아무 조작 없이 방치하면 `UIHolder`가 정리되며 웹 세션도 같이
  끊긴다** - Phase 4 신규 이슈가 아니라 Dev/User/Omakase 포함 웹 연동 전체에 공통된 기존 동작.
- **퀴즈 만들기 웹 UI 제공 - 인수인계 문서만 작성**: 상세 설계는 사용자가 다음 세션에서 진행하기로
  해서, 이번엔 설계 없이 `docs/plans/WEB_QUIZ_CREATION_HANDOFF.md` 신설 — 재사용 가능한 기존 인프라(토큰
  락/하트비트/GC, 하이재킹 방어, "payload 직접 대입" 어댑터 패턴, 결과 폴링 채널), 근본적으로 다른 점
  (자유 텍스트/이미지/오디오 대량 입력, 문제 CRUD API 부재, `user-question-info-ui.ts`의 자체 경고
  주석), 착수 전 결정해야 할 질문 6개(진입점/락 UX 적합성/CRUD API 설계/미디어 입력 방식/B-1과의
  관계/리팩터 여부) 정리. `docs/ACTIVE_PLAN.md` A절에 포인터 추가.

검증(코드 변경분만): `web-frontend`에서 `npm run build` 통과(백엔드 코드는 이번 라운드에서 변경 없음).

## 2026-08-10 — Phase 4 추가 피드백 4건 + 전역 강조색 gold→blue 변경

바로 위 항목 이후 사용자가 이어서 준 피드백 4건 처리.

- **퀴즈함(FAB) 버튼 누락 수정**: `MultiplayerTab.jsx` 최초 구현 시 OmakaseTab.jsx를 참고해 만들면서
  "직접 골라 담기" 모드의 🍱 FAB+드로워(담긴 퀴즈 목록 확인/제거)를 통째로 빠뜨렸음 - 포팅 누락.
  `drawerOpen` state, `removeFromBasket`/`handleBasketDrawerItemClick` 헬퍼, FAB+드로워 JSX를
  OmakaseTab.jsx와 동일하게 추가.
- **문제 수 20개 미만 확정 가능하던 버그 수정**: `min_quiz_size=20`이 `MultiplayerQuizLobbyUI.
  createDefaultMultiplayerQuizInfo`에 있었지만, 웹 경로는 `OmakaseQuizRoomUI.
  applyWebPayloadToQuizInfo`(오마카세 공용 헬퍼, `min_quiz_size` 개념 자체가 없음 - 오마카세는
  하한이 1)를 그대로 재사용하고 있어서 하한 체크가 통째로 빠져있었음(디스코드 모달 경로인
  `quiz-info-ui.ts`의 `applySelectedQuestionCount`에만 있던 로직이라, 웹 경로가 그 함수를 우회하면서
  같이 빠짐). `MultiplayerQuizLobbyUI.applyWebPayloadToQuizInfo`에서 공용 헬퍼 호출 후
  `min_quiz_size` 이상으로 다시 한번 올리는 방어 추가(이게 최종 authoritative 지점), 프론트엔드
  스테퍼 하한도 1→20으로 수정, `web_express_app.ts`의 confirm 클램프도 20~60으로 맞춤(이중 방어).
- **참가 완료 화면 "대기실 목록으로" 제거**: 참가(join) 이후엔 디스코드 UI로만 조작하는 게 맞다는
  방침 확인 - 버튼 제거, 이제 `view:'done'`은 join 전용이라 안 쓰던 `doneAction` state도 정리(새
  로비 만들기는 예외 - 로비 운영 중엔 계속 웹에서 설정 변경 가능하게 이미 남겨둠).
- **버튼 스타일 재작업**: 실제 원인은 `.cta-primary`가 `width:100%` 고정이라 `.toolbar`(가로 flex)
  안에 넣으면 레이아웃이 깨지고 있었던 것 - `.toolbar-cta`/`.icon-btn`/`.link-btn` 3개 신설.

이어서 "버튼 배경이 gold라 촌스럽다, 다른 색 없냐"는 피드백 - 앱 전체(4개 탭 공통) 디자인 토큰이라
색 선택을 먼저 확인(`AskUserQuestion` - 블루/에메랄드/violet 재활용/직접 지정 중 사용자가 "블루 계열"
선택). `styles.css`의 `--gold`/`--gold-ink`/`--gold-bg`를 `--primary`/`--primary-ink`/`--primary-bg`로
리네임 + 라이트(`#3B82F6`/`#1D4ED8`/`#DBEAFE`)·다크(`#5B9BFF`/`#EAF2FF`/`#1E3A5F`) 값 교체, 버튼 위
하드코딩된 텍스트색(`#2a2000`, 골드 배경 대비용 어두운 갈색) 7곳을 `#FFFFFF`로, 브랜드 아이콘 그라디언트
끝단 색(`#8f6a06`)을 `#1E40AF`로 교체. violet/green/red 등 나머지 팔레트와 레이아웃은 안 건드림 -
Dev/User/Omakase/Multiplayer 4개 탭 전부에 영향.

검증: `npx tsc --noEmit`(0 error)/`npm run lint`(0 error, 58 warning 기존 수준 유지)/`npm test`(267
pass)/`npm run build`(백엔드+프론트엔드) 전부 통과. `docs/TEST_CHECKLIST.md` R 섹션에 항목 추가 +
신규 S 섹션(전역 강조색 변경 검증) 신설. **아직 실제 Discord+브라우저 재검증 전** - 특히 문제 수
하한/FAB/색상 대비는 다음 세션 최우선.

## 2026-08-07 — 문서 구조 정리

루트에 흩어져 있던 계획서/로그 문서 13개를 `docs/`로 이동(`git mv`), 루트 및 하위 5개 `CLAUDE.md`의
참조 경로 갱신. `docs/ACTIVE_PLAN.md`(이 문서의 짝)와 `docs/COMPLETED_WORK_LOG.md`(이 문서)를 신설해
여러 계획서에 흩어진 완료/미완료 상태를 한 곳에서 훑어볼 수 있게 함.

## 2026-08-11 — 퀴즈 만들기 웹 UI 설계 확정 + Phase 0(UI 목업) 완료

`docs/plans/WEB_QUIZ_CREATION_HANDOFF.md`(2026-08-10 작성)의 후속 세션. 인수인계 문서에 정리해둔 질문
6가지를 사용자와 논의해 전부 확정(진입점 투트랙 분리, 유저 스코프 세션 일반화, `user-question-info-ui.ts`
실제 리팩터, URL 입력만, 유튜브 타임스탬프 링크로 미리듣기 대체, `/api/my-quizzes` 신규 네임스페이스 등)
— Phase 0~5 전체 계획이 나옴. 플랜모드로 재확인 후 승인받고 Phase 0(UI 목업)만 이번 세션 범위로 진행.

**Phase 0 목업** (`docs/mockups/WEB_QUIZ_CREATION_UI_MOCKUP.html`, `docs/mockups/WEB_UI_MOCKUP.html`과 대칭 신규 파일):
퀴즈 목록/상세/문제편집 3화면 + "실제 디스코드에선 이렇게 보여요" 미리보기. 사용자 피드백을 3라운드
받으며 반복:

1. **1차**: 목록 화면을 퀴즈 선택 웹 UI(`docs/mockups/WEB_UI_MOCKUP.html`)의 그리드 카드 언어로 통일 + 새
   퀴즈 추가/선택→편집 플로우 연결. 상세 화면에 썸네일 미리보기 필드 추가, 태그 선택 UI가 비어 보이던
   실제 버그(화면 전환 시 `renderDetail()` 미호출) 발견해 수정, 공개 토글 스위치 레이아웃 어긋남도
   `<button>` 기본 스타일 리셋 누락 버그로 확인 후 수정. 문제 편집 화면을 디스코드 3-모달
   (`modal_question_info`/`modal_question_additional_info`/`modal_question_answering_info`) 구조
   그대로 3탭으로 재구성.
2. **2차**: 디스코드 미리보기에 힌트 화면 상태 추가(문제 출제 중/힌트 화면/정답 공개 3단계), 탭
   전환이 곧 미리보기 상태 전환이 되도록 연동. 정답 유형 선택을 별도 박스에서 "기본 정보 설정" 탭
   안으로 이동, 탭 버튼 스타일을 텍스트 밑줄에서 채워진 세그먼트 버튼으로 바꿔 가시성 개선. 오디오
   미리듣기를 "재생 중" 텍스트에서 실제 유튜브 타임스탬프 링크(`?t=<초>s`)로 교체. 문제 목록의
   이미지/오디오 구분 배지를 없애고 문제(보라)/힌트(황토)/정답(초록) 3색 content-tag로 교체, 우측
   디스코드 미리보기를 퀴즈 상세 화면에서 제거하고 대신 `WEB_UI_MOCKUP.html`의 "유저 퀴즈 선택" 상세
   카드와 동일한 구조의 "다른 사람들에게 이렇게 보여요" 카드로 교체.
3. **3차**: `initialize.ts`의 `buildCustomQuestion()`/`generateHint()`를 다시 읽고 "힌트를 안 정하면
   정답 기반 기본 힌트가 자동 생성된다"(`HINT_PERCENTAGE=2`, 정답 절반가량을 `◼`로 가림)는 실제 동작을
   확인 — 이전에 "힌트 없으면 아무 메시지도 안 감"으로 잘못 구현했던 걸 자동생성 근사 로직으로 교체.
   오디오 반복재생 필드를 기본 정보 설정으로 이동(웹 UI 한정 조정, 디스코드는 추가 정보 쪽), 반복 포함
   총합 재생시간 코드 재확인 후 정확한 값(최대 70초, 사용자가 말한 60초가 아니라
   `MAX_QUESTION_TOTAL_AUDIO_PLAY_TIME` 상수 그대로) 반영. WebP 미지원/오디오 최대 재생시간(문제용
   60초/정답공개용 13초)/원본 영상 20분 제한을 placeholder가 아니라 필드 라벨에 명시. "추가 정보 설정"
   탭을 웹 UI 한정으로 "힌트 설정"으로 개명. 필수값(퀴즈 제목, 정답 유형별 정답값) 미입력 시 인라인
   에러 표시 + 저장/이동 차단 추가.

사용자 최종 승인("UI 설계는 이정도로 끝내고"). **코드/DB/세션 인프라는 전혀 안 건드림** — Phase 1부터는
다음 세션에서 진행하기로 함. 검증은 육안 확인만(코드 변경 없어 자동 테스트 대상 없음). 상세 설계는
`C:\Users\wjswo\.claude\plans\gleaming-foraging-planet.md`(전체 Phase 0~5)와
`elegant-plotting-crystal.md`(이번 세션 실행판) — Phase 1 착수 시 `docs/plans/WEB_QUIZ_CREATION_PLAN.md`로
옮겨적을 것. `docs/ACTIVE_PLAN.md` B-5 신설.

## 2026-08-11 — 퀴즈 만들기 웹 UI Phase 1(세션 스코프 일반화 + 진입점 스켈레톤)

신규 `docs/plans/WEB_QUIZ_CREATION_PLAN.md`로 설계 원본 이관. `web_session_manager.ts`를 guild/owner
두 스코프로 일반화(`scope`/`scope_id` 필드, `broadcast(guild_id,...)`→`broadcast(scope_id,...)`
리네임, `owner_token_map`+`createOwnerScopedSession`/`releaseOwnerScopedSession` — DM은 1:1이라
하이재킹 개념 없이 무조건 교체). `web_express_app.ts`의 `GET /api/session`이 `scope`/`scope_id`/
`owner_name`도 반환(기존 `guild_id` 필드 하위 호환 유지). `ui-system-core.ts`: `UIHolder.free()`가
PRIVATE 홀더면 `release_owner_session`도 전송, `relayWebSessionSignal`이 `.scope_id`로 라우팅,
신규 `createQuizEditWebHandoffUIHolder`, `createQuizToolUIHolder`의 최초 화면을
`QuizEditSelectUIModeUI`로 교체(`/퀴즈만들기`도 `SelectUIModeUI`와 동일한 디스코드/웹 투트랙 진입).
신규 `quiz-edit-select-ui-mode-ui.ts`/`quiz-edit-web-handoff-ui.ts`(하이재킹 방어 없음). `config/
system_setting.js`에 `MAX_QUESTIONS_PER_QUIZ: 50` 추가(교체는 Phase 2). 프론트엔드:
`web-frontend/editor.html`+`editor-main.jsx`(Vite 멀티페이지), `QuizEditorApp.jsx`(세션 부트스트랩
플레이스홀더, 기존 `api.js` 재사용), `vite.config.js`에 `build.rollupOptions.input` 추가,
`react-router-dom` 설치(실사용은 Phase 3부터). 검증: `npx tsc --noEmit`/`npm run lint`(0 error)/
`npm test`(274 pass, 기존 `signal.guild_id` assert 갱신 + owner-scope 신규 테스트 7건)/`npm run build`
(백엔드+프론트엔드 index.html·editor.html 둘 다) 전부 통과. **미검증** — 실제 Discord+브라우저 테스트
전무, 다음 세션 최우선(`docs/TEST_CHECKLIST.md` 신설 섹션). `docs/ACTIVE_PLAN.md` B-5 갱신.

**✅ 2026-08-11 실사용 검증 + `/editor.html` URL 정리, 같은 세션**: 사용자가 실제 봇으로 DM
`/퀴즈만들기` 투트랙 진입 확인(디스코드 UI/웹 UI 분기, `editor.html` 세션 인증까지 정상 동작). 이어서
편집 링크가 `.html` 확장자로 뜨는 게 촌스럽다는 피드백을 받아 `web_express_app.ts`에 `/editor`,
`/editor/*`(Phase 3~4에서 react-router-dom 클라이언트 라우팅이 붙었을 때 새로고침/딥링크 대비 와일드카드
까지 미리 처리) 라우트를 추가해 `editor.html`을 서빙하도록 하고, `quiz-edit-web-handoff-ui.ts`의 링크도
`/editor?token=...`로 변경. 격리된 포트로 직접 서버를 띄워 `/editor`/`/editor/quiz/123` 둘 다 200을
반환하는지 수동 확인. 검증: `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(274 pass) 전부 통과.

## 2026-08-11 — 퀴즈 만들기 웹 UI Phase 2(공유 검증 모듈 추출 + 디스코드 쪽 리팩터)

신규 `quizbot/managers/quiz_editor_validation.ts` — `user-question-info-ui.ts`/`user-quiz-info.ui.ts`에
흩어져 있던 인터랙션-비의존 검증/파싱 로직을 순수 함수 7개(`parseAudioRangePoints`/
`redefineRepeatCount`/`parseUseAnswerTimer`/`isValidAudioUrl`/`isValidImageUrl`/`isDiscordCdnLink`/
`canGoPublic`)로 추출(`multiplayer_mmr.js`와 동일 관례). `user-question-info-ui.ts`(호출부 8곳 교체,
원본 메서드 2개 삭제, 매직넘버 50→`SYSTEM_CONFIG.MAX_QUESTIONS_PER_QUIZ` 3곳)/`user-quiz-info.ui.ts`
(`quiz_toggle_public` 1곳)가 이 모듈을 호출하도록 전면 교체 — **동작 변경 없는 순수 이관**,
`sendDelayedUI`/`sendAudioPreview`/`duplicateQuestion`의 디스코드 전용 우회는 100% 유지. 신규
`test/managers/quiz_editor_validation.test.js`(21건, 경계값 전부). 검증: `npx tsc --noEmit`/
`npm run lint`(0 error)/`npm test`(295 pass)/`npm run build` 전부 통과. 웹 기능(REST 등)은 이 phase에
전혀 없음. `docs/plans/WEB_QUIZ_CREATION_PLAN.md`/`docs/ACTIVE_PLAN.md` B-5 갱신, 다음은 Phase 3(퀴즈 메타데이터
REST CRUD)부터.

## 2026-08-11 — 퀴즈 만들기 웹 UI Phase 3(퀴즈 메타데이터 REST CRUD), 같은 세션

`db_quiz.ts`에 `selectOwnedQuizInfoById(quiz_id, creator_id)`(`is_private` 필터 없이 `creator_id`로
소유권을 DB 레벨에서 강제)/`user_quiz_info_manager.ts`에 `loadOwnedUserQuizInfoById` 신설(기존
`selectQuizInfoById`/`loadUserQuizInfoById`와 동일 패턴). 신규 `quizbot/managers/web/
web_quiz_editor_routes.ts`(Express Router, `web_express_app.ts`에 `requireWebSession`+
`requireOwnerScopedSession`으로 감싸 `/api/my-quizzes`에 마운트) — `requireQuizOwnership` 미들웨어가
`loadOwnedUserQuizInfoById`로 소유권을 확인하고 `req.owned_quiz`에 담아 재조회를 막는다. 라우트 7개:
`GET /`(목록+태그), `POST /`(생성 - `UserQuizListUI.addQuiz`와 동일 기본값), `GET /:quiz_id`(메타데이터+
문제 목록+`quiz_editor_validation`의 검증 플래그), `PUT /:quiz_id`(`editQuizInfo`와 동일 로직, 글자수
서버 검증), `PUT /:quiz_id/tags`(`QUIZ_TAG`에 정의된 비트로만 마스킹), `POST /:quiz_id/toggle-public`
(`canGoPublic` 체크), `DELETE /:quiz_id`(소프트 삭제, 관리자 삭제+밴은 제외 - 확정 사항). 프론트엔드:
`web-frontend/src/editor/EditorApi.js`(신규 클라이언트, `api.js`의 싱글턴 토큰 재사용)/
`QuizListPage.jsx`(목록+생성 폼)/`QuizDetailPage.jsx`(메타데이터 수정+태그+공개토글+삭제, 삭제는
디스코드와 동등한 2클릭 확인), `QuizEditorApp.jsx`에 `react-router-dom` `BrowserRouter basename="/editor"`
배선(`/`→목록, `/quiz/:quizId`→상세) - Phase 1에서 미리 설치해둔 의존성을 이제 실제로 사용. 문제 목록은
이 phase에선 검증 경고(⚠️) 배지만 보여주는 읽기 전용 placeholder(실제 CRUD는 Phase 4). 신규
`test/managers/web/web_quiz_editor_routes.test.js`(14건 - CRUD 왕복, 소유권 403/404, 글자수 400, 태그
마스킹, toggle-public 태그 검증), `db_manager.test.js`/`user_quiz_info_manager.test.js`에 신규 함수
검증 추가. 검증: `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(312 pass)/양쪽
`npm run build` 전부 통과. **미검증** — 실제 Discord+브라우저 테스트 전무, 다음 세션 최우선
(`docs/TEST_CHECKLIST.md` T 섹션에 항목 추가). `docs/plans/WEB_QUIZ_CREATION_PLAN.md`/`docs/ACTIVE_PLAN.md`
B-5 갱신, 다음은 Phase 4(문제 CRUD REST + 프론트 문제 편집기)부터.

**✅ 2026-08-11 Phase 3 UI 피드백 3건 반영, 같은 세션**: 사용자가 코드 리뷰 중 3가지 UI 개선을 요청함.
(1) 퀴즈 상세 화면에 썸네일 URL을 입력해도 미리보기가 안 뜨던 문제 - 우측에 "다른 사람들에게 이렇게
보여요" 카드 추가(`QuizDetailCard.jsx` 재사용, 저장 전 `form` 상태를 실시간으로 반영). (2) 목록으로
돌아가는 길이 breadcrumb 텍스트 클릭뿐이라 발견성이 낮음 - `←` 아이콘 버튼을 breadcrumb 우측에 추가.
(3) 퀴즈 만들기 웹 UI(`editor.html`)에 테마 토글이 아예 없어 다크모드가 강제되던 문제 - `App.jsx`에
있던 `ThemeToggle`을 `ThemeToggle.jsx`로 분리해 두 진입점이 공유하도록 리팩터. 전부 프론트엔드 전용
수정(백엔드 무변경). 검증: 양쪽 `npm run build` 통과.

## 2026-08-11 — 퀴즈 만들기 웹 UI Phase 4(문제 CRUD REST + 프론트 문제 편집기), 같은 세션

`web_quiz_editor_routes.ts`에 문제(question) CRUD REST 4개 추가(전부 `requireQuizOwnership` 경유):
`POST /:quiz_id/questions`(최대 50개 체크→검증→생성), `PUT /:quiz_id/questions/:question_id`(partial
update, `question_id`가 실제 그 퀴즈 소속인지 `loadQuestionListFromDB()` 결과에서 재확인), `DELETE
/:quiz_id/questions/:question_id`(hard delete), `POST /:quiz_id/questions/:question_id/duplicate`
(`cloneDeep(source.data)`로 복제, 최대 50개 체크). 신규 헬퍼 `validateQuestionFields`/
`applyQuestionFields` — 후자는 `UserQuestionInfoUI`의 `applyQuestionInfo`/`applyQuestionAdditionalInfo`/
`applyQuestionAnsweringInfo` 3개를 단일 함수로 합친 버전으로, `is_partial` 플래그로 POST(전체 반영)/
PUT(body에 실린 필드만 반영)을 분기한다. `quiz_editor_validation.ts`(Phase 2)의
`parseAudioRangePoints`/`redefineRepeatCount`를 그대로 재사용 - 디스코드 쪽(`user-question-info-ui.ts`)은
Phase 2에서 이미 이 모듈을 쓰도록 리팩터돼 있어 이번 phase에서 전혀 안 건드림. DB에 문제 단건 조회
함수가 없어(`selectQuestionInfo`는 quiz_id 전체 조회만) 개수 체크/소속 확인 모두
`loadQuestionListFromDB()`로 매번 전체를 로드하는 방식 재사용(GET `/:quiz_id`와 동일 패턴).

프론트엔드: 신규 `web-frontend/src/editor/QuestionEditPage.jsx` — 디스코드 3모달(기본정보/힌트설정/
정답공개)을 탭 3개로 합친 단일 폼(승인된 `WEB_QUIZ_CREATION_UI_MOCKUP.html` 레이아웃 그대로 구현).
정답 유형은 세그먼트 버튼(주관식/OX/객관식) + 유형별 입력(주관식은 자유 텍스트, OX/객관식은 선택
버튼)으로 최종엔 전부 `answers` 문자열로 직렬화. 오디오 재생 시작/끝은 숫자 입력 2개로 받아 제출 시
`"40~80"` 형식 문자열로 합쳐 백엔드 `parseAudioRangePoints`가 그대로 파싱하게 함. 이미지는 `<img src>`
직접 표시(디스코드의 강제 재전송 워크어라운드 불필요 - 설계 결정), 오디오는 유튜브 링크 + `?t=<초>`로
미리듣기 대체(설계 결정, 새 스트리밍 엔드포인트 불필요). `cdn.discordapp.com` 경고는
`quiz_editor_validation.ts`가 CJS 백엔드 전용 모듈이라 이 독립 Vite/ESM 프로젝트에서 직접 import할 수
없어 한 줄 로직을 프론트에 그대로 복제해 타이핑 중 즉시 표시, URL 형식 유효성(`is_valid_*`)은 수정
모드에서 로드된 서버 스냅샷 값만 배지로 보여줌(저장 시점 기준, 실시간 재검증 없음). `EditorApi.js`에
문제 CRUD 클라이언트 4개 추가. `QuizDetailPage.jsx`의 "곧 추가될 예정이에요" placeholder를 실제
목록 패널로 교체 — 각 행에 수정/복제/삭제 버튼, "+ 새 문제 추가"/복제는 50개 도달 시 비활성화(프론트가
이미 글자수 제한처럼 `SYSTEM_CONFIG.MAX_QUESTIONS_PER_QUIZ` 값을 하드코딩 미러링하던 기존 관행 재사용),
삭제는 기존 퀴즈 삭제와 동일한 2클릭 확인. 복제는 정렬 특성(question_id 오름차순이라 새 문제가 항상
맨 뒤)상 낙관적으로 끼워넣지 않고 매번 `getMyQuizDetail`로 전체 재조회. `QuizEditorApp.jsx`에
`/quiz/:quizId/questions/new`, `/quiz/:quizId/questions/:questionId` 라우트 2개 추가. 기존
CSS 클래스(`tabrail`/`mode-switch`/`tag-chip`/`tree-row`/`icon-btn`/`switch-field`)만 재사용해 신규
CSS 추가 없음.

신규 `test/managers/web/web_quiz_editor_routes.test.js` 확장(10건 - 최대 개수 초과 400, 필수값 누락
400, 오디오 구간 파싱+`answer_type` 기본값 확인, partial update 시 미전송 필드 유지 확인, PUT/DELETE/
duplicate 소유권 위반 404, 삭제/복제 데이터 검증). 검증: `npx tsc --noEmit`/`npm run lint`(0 error)/
`npm test`(322 pass)/양쪽 `npm run build`/컴파일된 라우터 require 스모크 테스트 전부 통과. **미검증** —
실제 Discord+브라우저 테스트 전무, 다음 세션 최우선(`docs/TEST_CHECKLIST.md`에 항목 추가).
`docs/plans/WEB_QUIZ_CREATION_PLAN.md`/`docs/ACTIVE_PLAN.md` B-5 갱신, 다음은 Phase 5(폴리시 + 통합 검증)부터.

## 2026-08-12 — 퀴즈 만들기 웹 UI Phase 4 UI 피드백 4건 반영, 같은 세션

사용자가 문제 목록/편집 화면을 직접 보고 승인된 Phase 0 목업(`docs/mockups/WEB_QUIZ_CREATION_UI_MOCKUP.html`)의
설계가 상당수 빠졌다고 지적: (1) 문제 목록 행이 단순 텍스트뿐이라 경계가 애매함, (2) 클릭으로 편집
화면 이동은 되지만 명시적 수정 버튼이 없음, (3) "1번 문제"식 표시만으로는 문제를 구별할 수 없음(목업엔
유형/내용 태그가 있었음 + 사용자 재확인 결과 필수 입력값인 `answers`(주관식 텍스트/OX/객관식 선택값)도
같이 보여줘야 함), (4) 문제 편집 화면에 있었던 "실제 디스코드에선 이렇게 보여요" 미리보기 패널이
통째로 빠짐. 마지막 항목은 Phase 4 계획 수립 당시 이 미리보기를 "Phase 0 데모 전용"으로 잘못
스코프아웃한 게 원인이었음(계획 오류를 사용자가 잡아준 것).

목업의 실제 JS(`renderQuestionEmbed`/`renderHintEmbed`/`renderAnswerEmbed`/`computeContentTags`/
`approximateAutoHint` 등)를 재독하고, 근거로 인용된 실제 코드(`quiz_system/lifecycle/question/
question.ts`의 `createQuestionUI`/`startProgressBar`, `correct_answer.ts`,
`config/text_contents.json`의 `quiz_play_ui`/`correct_answer_ui`/`icon.ICON_PROGRESS_*`/
`icon.ICON_CUSTOM_QUIZ`)까지 대조해 정확한 텍스트/색상/구조로 이식했다(단순 데모 근사치가 아니라
실제 코드 기준). 신규 `web-frontend/src/editor/questionDisplay.jsx` — `ANSWER_TYPE_LABEL`/
`computeContentTags`/`ContentTagChips`(문제별 내용 요약 칩, 목록 행과 편집 화면 상단 양쪽이 공유) +
`DiscordQuestionPreview`/`DiscordHintPreview`/`DiscordAnswerPreview`(탭 전환에 따라 문제 출제 중/힌트
공개/정답 공개 3가지 임베드 상태를 실시간 시뮬레이션, `approximateAutoHint`가 실제 `generateHint()`의
절반 마스킹 로직을 재현). `QuizDetailPage.jsx`의 문제 행을 테두리 있는 카드(`.question-row`)로
교체하고 제목(question_text, 없으면 안내 문구) + 유형 칩 + **"정답: {answers}" 칩**(필수 입력값 그대로
표시 — 사용자가 명확히 확인해준 요구사항) + 내용 칩을 붙였고, 클릭-편집은 유지하면서 ✏️/⧉/🗑
버튼도 명시적으로 추가. `QuestionEditPage.jsx`는 우측에 미리보기 패널(활성 탭 따라 전환)과 상단에
내용 요약 칩을 추가. `styles.css`에 `.question-row`/`.chip`/`.discord-frame`/`.df-*` 신규 - 디스코드
프리뷰는 앱 자체 테마와 무관하게 항상 같은 디스코드 다크 색상을 하드코딩(목업의 의도적 설계 유지).
검증: 양쪽 `npm run build` 통과(백엔드 무변경, 프론트엔드 전용 수정이라 `npm test`/`tsc`/`lint`
재실행 불필요). **미검증** — 실제 브라우저로 미리보기 정확도(특히 힌트 자동생성 마스킹) 확인 안 함.

## 2026-08-12 — 퀴즈 만들기 웹 UI Phase 4 UI 피드백 2차 9건 반영, 같은 세션

위 피드백 1차 반영을 사용자가 직접 화면으로 확인하고 준 9건의 후속 피드백.

1. **오디오 미리듣기 방식** — "유튜브에서 미리듣기" 새 탭 링크가 아니라 지정한 시작 지점부터 바로
   재생 가능한 UI를 요청. `questionDisplay.jsx`에 `extractYoutubeVideoId`(URL에서 11자 video id 추출,
   `youtu.be`/`watch?v=`/`embed`/`shorts` 전부 지원) + `YoutubeEmbed`(그 자리에
   `youtube.com/embed/<id>?start=<초>` iframe을 직접 띄움, autoplay는 안 함) 신설 — 기존 `AudioLink`
   완전 대체. Discord 미리보기 패널 안의 오디오도 동일하게 교체(목업이 "Phase 4 실제 웹에서는 이 자리에
   플레이어가 바로 삽입돼요"라고 예고했던 부분을 실제로 구현).
2. **문제 목록에서 문제 구별** — 답/문제텍스트/이미지/오디오 요약을 보여달라는 요청 + 요약이 생기면
   기존 "정답: 칩"은 중복이니 빼달라는 요청. `q-summary` 한 줄(정답 텍스트 40자 truncate + 이미지
   미니 썸네일 20x20 + 유튜브 썸네일 미니 아이콘)로 재설계, "정답: 칩" 제거(제목은 여전히
   question_text). 유형 칩(주관식/OX/객관식)은 유지 요청대로 그대로 둠.
3. **문제 검증 실패 표시** — URL 오입력 등 서버 검증 실패, *그리고* 새로 정의된 케이스(문제 텍스트/
   이미지/오디오가 전부 비어 문제 자체를 구별할 수 없는 경우 - 저장은 되지만 검증 실패로 취급)를 행
   배경색(`--red-bg`)으로 표시(`.question-row.has-error`).
4. **인증 마크(목록)** — 유저 퀴즈 선택 UI(`UserQuizTab.jsx`/`OmakaseTab.jsx`)와 동일한
   `<span className="thumb-badge verified">✓ 인증</span>`을 `QuizListPage.jsx` 그리드 카드에 추가.
5. **인증 마크(상세)** — `QuizDetailCard.jsx`(선택 플로우 3곳 + 편집 플로우 `QuizDetailPage.jsx`가
   전부 공유하는 컴포넌트)의 인증 표시가 제작자 텍스트 줄에 "· 인증된 퀴즈"로 섞여 있던 걸 목록 카드와
   동일한 썸네일 뱃지로 승격 — 공유 컴포넌트 수정 하나로 선택/편집 양쪽이 동시에 일관되게 맞춰짐(사용자가
   "동일하게 맞췄는지 검증해달라"고 요청한 부분이기도 함).
6. **정답 유형 전환 버그** — 주관식→OX→주관식으로 오가면 주관식 정답이 사라지던 것(의도하지 않은
   버그로 확인). `answerDrafts` state(유형별 마지막 입력값 저장)를 추가해 `selectAnswerType`이 전환
   직전 값을 저장하고 전환 대상 유형의 기존 draft를 복구하도록 수정.
7. **저장 후 화면 유지** — "저장이 습관화된 사람들은 자주 저장할 것"이라는 이유로, 저장해도 퀴즈 상세로
   안 돌아가고 이 화면에 머무르도록 변경("✓ 저장됨" 버튼 텍스트 플래시로 피드백). 새 문제는 저장 성공
   시 URL만 `/questions/:questionId`로 조용히 바뀌어(`navigate(..., {replace:true})`) 이후 저장부터
   PUT으로 전환되고, 매 저장마다 응답의 `data`로 폼을 재동기화(서버 정규화값 반영).
8. **문제 위치 표시** — breadcrumb에 `N/전체`(수정 모드) 또는 `N번째로 추가`(생성 모드) 칩 추가.
9. **이전/다음 문제 이동** — 저장 버튼 옆에 이전/다음 문제 버튼 추가(같은 퀴즈의 `question_id` 순서
   기준, 양 끝에서 자동 비활성화). 버튼이 늘어난 만큼 저장 버튼만 파란 `toolbar-cta`, 나머지는 신규
   `.btn-secondary`(중립색)로 시각 구분 — `.cta-primary`는 `width:100%` 고정이라 가로 버튼 로우에
   넣으면 레이아웃이 깨지는 기존에 이미 알려진 함정이라 안 씀.

전부 `web-frontend/src/editor/questionDisplay.jsx`(신규 헬퍼/컴포넌트 추가)·`QuizDetailPage.jsx`·
`QuestionEditPage.jsx`·`QuizListPage.jsx`·`QuizDetailCard.jsx`·`styles.css` 프론트엔드 전용 수정
(백엔드 무변경). 검증: 양쪽 `npm run build` 통과. **미검증** — 실제 브라우저 테스트 전무, 특히 유튜브
임베드 재생/인증 뱃지/이전·다음 이동은 다음 세션 최우선 확인 대상.

## 2026-08-12 — 퀴즈 만들기 웹 UI Phase 4 UI 피드백 3차 1건 반영, 같은 세션

2차 피드백에서 문제 목록 행의 "문제: 텍스트,이미지" 칩(`computeContentTags`의 `basic` 카테고리)을
q-summary 요약(답/이미지/오디오 미니 썸네일)과 중복이라 판단해 `ContentTagChips`의 `hideBasic` prop으로
숨겼는데, 힌트/정답 칩은 그대로 있으면서 문제 칩만 빠진 게 오히려 비일관적이라는 지적 — 예를 들어
`question_text`+`question_image_url`만 설정한 문제는 "힌트: -"/"정답: -" 칩 없이 "문제: 텍스트,이미지"
칩 하나만 있어야 정상인데 그게 안 보였음. `questionDisplay.jsx`의 `ContentTagChips`에서 `hideBasic`
prop을 완전히 제거(이제 쓰는 곳이 없어짐 - 도입한 지 한 세션 안에 되돌린 셈)하고 항상 세 카테고리
(문제/힌트/정답) 전부 표시하도록 원복. `QuizDetailPage.jsx`의 호출부(`<ContentTagChips tags={tags}
hideBasic />`)에서도 `hideBasic` 제거. 검증: `npm run build`(프론트엔드) 통과.

**세션 마무리 - Phase 5 인수인계 준비**: Phase 4(REST+프론트 구현, UI 피드백 3라운드)까지 이번 세션에서
전부 완료됐지만 실제 Discord 봇 + 브라우저로 단 한 번도 통합 테스트를 안 해봤다 — 다음 세션 최우선
과제. 상세 인수인계 프롬프트는 세션 종료 시 사용자에게 별도 전달.

## 2026-08-12 — 퀴즈 만들기 웹 UI Phase 3/4 실사용 검증 완료 (별도 세션)

바로 위 인수인계를 받아 진행. `npm run build`(백엔드) + `web-frontend`의 `npm run build` 후 실행 중이던
`dist/index.js`/`dist/quizbot/bot.js`를 재시작(taskkill 후 재기동, DB 연결/명령어 등록/admin 인스턴스
동기화까지 정상 확인 — 로그에 KOREANBOTS JWT 토큰 관련 에러가 있었지만 이는 무관한 기존 이슈로 봇
초기화 자체는 정상 완료됨). 이후 `docs/TEST_CHECKLIST.md` U섹션(Phase 3, 목록/생성/메타데이터/태그/
공개토글/삭제/문제목록표시/UI피드백3건)과 V섹션(Phase 4, 문제 추가/수정/삭제/복제/동기화/UI피드백
1·2차 총 13건)을 사용자와 함께 위에서부터 순서대로 실제 클릭해가며 전부 확인 — 전 항목 정상 동작.

**발견한 버그 1건 → 같은 세션에서 수정 완료**: 문제 편집 화면에서 정답 유형이 OX/객관식일 때 정답을
선택하지 않고 저장하면, 주관식(`<input required>`)과 달리 버튼 클릭 UI라 브라우저 필수값 검증이 걸리지
않아 요청이 그대로 서버까지 가고, 서버가 반환한 에러 코드 `invalid_answers`가 화면에 raw 문자열로 그대로
노출됨. `QuestionEditPage.jsx`의 `handleSave`에 제출 직전 `form.answers === ''` 체크를 추가해 "정답을
선택하거나 입력해주세요."라는 한글 안내로 대체(주관식에도 동일 체크가 적용되지만 기존 `required`가 이미
막고 있어 동작 변화 없음). 프론트엔드 전용 수정, 백엔드 무변경. `npm run build`(프론트엔드) 통과 후
사용자가 재검증까지 완료(더 이상 raw 에러 문자열이 안 뜸).

`docs/TEST_CHECKLIST.md` U/V 섹션 전체를 `[x]`로 갱신, `docs/ACTIVE_PLAN.md` B-5/`docs/plans/
WEB_QUIZ_CREATION_PLAN.md` Phase 4 하단에 검증 완료 기록 반영. **다음 세션은 Phase 5(폴리시 + 통합
검증)부터** — 착수 전 플랜모드로 범위 정리 후 사용자 확인 필요.

## 2026-08-12 — 퀴즈 만들기 웹 UI Phase 5(폴리시 + 통합 검증) 완료, "퀴즈 만들기 웹 UI" 전체 마무리

바로 위 인수인계를 받아 플랜모드로 범위 정리(선택 기능 2개는 스킵, 2클러스터 검증은 지금 진행) 후 착수.

- **전체 회귀**: `tsc --noEmit`(0 error)/`lint`(0 error)/`test`(324 pass)/양쪽 `build` 전부 통과.
- **2클러스터 이상 강제 실행 환경 relay 검증**: `index.js`의 `ClusterManager` 설정을 임시로
  `shardsPerClusters:1, totalShards:2`로 바꿔 2클러스터 강제 기동. `web_session_manager.ts`(브로드캐스트
  시점)/`ipc_manager.ts`(클러스터별 수신)/`ui-system-core.ts`의 `relayWebSessionSignal`(로컬
  UIHolder 존재 여부)에 임시 디버그 로그 3곳을 추가해 실제 신호 흐름을 로그로 실측 — 같은 `scope_id`에
  대해 소유 클러스터는 `REACT`, 비소유 클러스터는 `DROP`으로 정확히 갈리는 것을 확인. 검증 후 디버그
  로그 3곳 제거(사용자 결정 - 매 이벤트마다 남는 상시 로그라 용량 부담), `index.js` 원래 설정으로
  원복 + 재시작.
- **GC 세션 만료 시나리오**: 웹 세션 열고 탭 닫아 heartbeat 중단 → 15분(`WEB_SESSION_EXPIRE_SEC=900`)
  이상 대기 → 디스코드 DM 잠금 화면이 자동으로 해제되는 것을 사용자가 직접 확인.
- **선택 기능 2개는 스킵**: `close_owner_session` 액션("웹에서 편집 완료" 버튼), "현재 편집 중" 실시간
  표시 — 둘 다 설계 문서에서도 선택 항목이었고 사용자가 이번엔 제외 결정. 필요해지면 별도 착수.

**Phase 5 검증 도중 사용자가 준 추가 피드백 3건 처리**:
1. **투트랙 선택 버튼 라벨 개선** — `/퀴즈`/`/퀴즈만들기` 최초 화면의 버튼이 숫자 `'1'`/`'2'`뿐이라
   임베드 description의 안내문을 먼저 읽어야 의미가 파악되던 문제. `base_components.ts`의
   `select_ui_mode_btn_component`(두 화면이 공유하는 컴포넌트) 라벨을 `'디스코드 UI'`/`'웹 UI'`로
   변경 — 한 곳 수정으로 양쪽 다 반영. `customId`는 그대로 유지해 `onInteractionCreate` 분기 로직
   무변경. `text_contents.json`의 description 중복 안내("1️⃣)/2️⃣)")도 같이 간소화. 사용자가 직접
   확인("바로보임").
2. **"권한 가져오기"(force_take) 레이스 버그 발견 + 수정** — 조사 결과 "새 토큰 발급" 자체는 이미
   구현돼 있었음(기존 토큰 파기 + 완전히 새 토큰 생성, 테스트로도 고정됨). 그런데 그 직후 예전
   소유자의 `UIHolder.free()`가 보내는 `{action:'release', guild_id}`가 어떤 토큰인지 확인 없이 "그
   길드에 지금 매핑된 토큰"을 지우는 방식이라, force_take가 막 발급한 새 토큰을 곧바로 무효화하는
   레이스가 있었음(코드 조사로 발견, 실제 프로덕션에서 이 경합을 겪었는지는 불명). `web_session_
   manager.ts`의 `releaseSession(guild_id, expected_token?)`에 토큰 일치 검사 추가 —
   `UIHolder.free()`가 `this.ui?.token`을 같이 넘기고, 이미 다른 토큰으로 교체됐으면 조용히 무시.
   `token`을 안 넘기는 기존 호출부(`handleStartQuiz` 등)는 그대로 무조건 파기(하위호환). 레이스를
   재현하는 회귀 테스트 2건 추가(`test/managers/web/web_session_manager.test.js`, 총 22건 pass).
3. **서버 설정 화면 권한 검증 누락 발견** — 조사 중 디스코드 쪽 서버 설정 화면(`server-setting-ui.ts`)에
   권한 체크가 전혀 없어 서버의 아무나 옵션을 바꿀 수 있다는 걸 발견(사용자도 "처음 알았다"). 이건
   범위가 달라(버그 수정이 아니라 이 프로젝트에 없던 "서버 관리 권한" 개념을 처음 도입하는 작업) 이번엔
   고치지 않고 다음 세션으로 이월 — 아래 신규 계획 문서 참고.

**"퀴즈 만들기 웹 UI"(Phase 0~5) 전체 완료.** `docs/ACTIVE_PLAN.md` B-5 항목을 완료 처리하고 B-6(잔여
3건 - 서버 설정 권한 검증 + 나머지 화면 웹 포팅)을 신설, 상세 계획은 `docs/plans/
WEB_UI_REMAINING_SCREENS_PLAN.md`(신규)에 분리.

## 2026-08-12 — 나머지 디스코드 전용 화면(안내/공지사항/서버 설정) 웹 포팅 완료 (B-6, 같은 세션)

`docs/plans/WEB_UI_REMAINING_SCREENS_PLAN.md`가 정리해둔 "착수 전 결정 필요 사항" 5개를 플랜모드로 전부
확정: **권한 체크는 추가하지 않음**(서버 설정을 아무 서버원이나 바꿀 수 있는 건 버그가 아니라 의도된
기존 동작 — 사용자 확인, 디스코드/웹 둘 다 그대로 유지), **패치노트 탭은 스코프 아웃**(더 이상 안
씀, 공지사항만 유지), **DB 쿼리는 웹 전용 함수를 새로 파라미터화**(기존 `db_option.ts`는 무변경),
**진입점은 기존 "퀴즈 선택 웹"(App.jsx)에 네비게이션 추가**(새 URL/탭 없음).

신규 `quizbot/managers/notice_manager.ts`(`loadNoticeList`/`readNoticeFile`, `note-select-ui.ts`/
`note-ui.ts`의 파일 읽기 로직을 순수 함수로 추출 — `quiz_editor_validation.ts`와 동일 관례, 디스코드
UI가 이 함수들을 호출하도록 순수 이관). `db_option.ts`에 `updateOptionParameterized`(서버 설정
웹 API 전용, `$n` 플레이스홀더 — 기존 `selectOption`/`updateOption`은 무변경). `web_express_app.ts`에
신규 라우트 5개(`GET /api/quiz-tool-guide`, `GET /api/notices`, `GET /api/notices/:name`,
`GET`/`PUT /api/server-option`) + `requireGuildScopedSession` 미들웨어(`requireOwnerScopedSession`과
대칭). 서버 설정 PUT은 `text_contents.json`의 `select_menu.option_values`를 화이트리스트로 값을
검증한 뒤 디스코드 UI와 **같은 `OptionStorage` 메모리 캐시**를 직접 갱신 — 웹에서 바꾸면 디스코드
쪽도 즉시 같은 값을 보게 된다. 프론트엔드: `web-frontend/src/GuidePanel.jsx`/`NoticesPanel.jsx`/
`ServerSettingPanel.jsx` 신설, `App.jsx`에 헤더 드롭다운 메뉴(`utilityPanel` state)로 통합(퀴즈 탭
4개와 성격이 달라 `tabrail`엔 안 넣음). 신규 순수 함수(`notice_manager.ts`)/REST 통합 테스트
(`web_express_app.test.js`) 추가, `db_manager.test.js`의 재수출 개수 골든 테스트(35→36) 갱신. 검증:
`tsc --noEmit`(0 error)/`lint`(0 error)/`test`(336 pass)/양쪽 `build` 전부 통과. **미검증** — 실제
Discord+브라우저 테스트 전무(3화면 전부), 다음 세션 최우선.

**같은 세션, 사용자 리뷰로 발견한 버그 수정**: `PUT /api/server-option`이 `db_manager.
updateOptionParameterized(...)`를 그냥 `await`만 하고 결과값을 안 보고 항상 `success:true`를
반환하고 있었음 — `db_core.sendQuery`는 연결 실패/쿼리 에러를 던지지 않고 조용히 `undefined`만
반환하므로(`db_core.ts`), DB 저장이 실제로 실패해도 API는 성공으로 응답하고 있었다. 디스코드 쪽
`server-setting-ui.ts`의 `handleSaveOption`이 이미 쓰던 대로(`result !== undefined`로 성공/실패
판정) 응답의 `success` 필드를 실제 결과 기준으로 고침. 프론트엔드도 저장 버튼 라벨을 1.5초 반짝이는
것만으로 성공 여부를 알리던 걸 `success-banner`/`error-banner`(신규 CSS, `.error-banner`와 대칭)로
명확하게 구분해서 보여주도록 개선. 회귀 테스트 1건 추가(DB 실패 mock 시 `success:false` 확인), 기존
성공 테스트의 mock이 `undefined`를 반환해 새 로직에서 `success:false`로 잘못 걸리던 것도 같이 수정.
검증: `tsc --noEmit`/`lint`(0 error)/`test`(337 pass)/양쪽 `build` 전부 통과.

**같은 세션, 발견성 개선(사용자 피드백)**: "☰" 아이콘 하나뿐이던 헤더 메뉴 버튼이라 서버 설정/공지사항의
존재를 알아채기 힘들다는 지적 — 제시한 개선안 4개 중 "라벨 추가"(저비용)와 "공지사항 안 읽음 배지"
조합을 선택. 버튼을 `.icon-btn`(정사각형 아이콘 전용) 대신 신규 `.menu-trigger`(라벨 포함, "☰ 더보기")로
교체. 공지사항 배지는 `localStorage`(`quizbot_web_last_seen_notice_mtime`)에 마지막으로 확인한 공지의
mtime을 저장해, `GET /api/notices` 응답의 최신 mtime과 비교해 트리거 버튼 + 드롭다운의 "📢 공지사항"
항목 양쪽에 빨간 점을 띄운다. 처음 방문한 브라우저는 저장값이 없어 전부 "안 읽음"으로 취급(흔한 관례).
"📢 공지사항"을 클릭하는 순간 `localStorage`를 갱신하고 배지를 지움 — 신규 서버 API 없이 프론트엔드
로컬 상태만으로 구현. 백엔드 무변경, 검증: `npm run build`(프론트엔드) 통과.

## 2026-08-12 — 문제 미리보기 마크다운 지원 + 웹 API 보안 점검 완료 (B-7, 별도 세션)

인수인계 문서(`docs/plans/QUESTION_PREVIEW_AND_SECURITY_REVIEW_PLAN.md`)의 조사 결과를 재조사 없이 바로
착수. 착수 전 rate limit 스코프(전체 API vs 쓰기 전용, 토큰 vs IP)와 작업 순서만 사용자에게 확인
(계층형 - 조회 느슨/쓰기 빡빡, 토큰 우선+세션 없는 요청은 IP 폴백, 마크다운 먼저).

**작업 1(마크다운 미리보기)**: `web-frontend/src/editor/questionDisplay.jsx`의 `DiscordQuestionPreview`/
`DiscordHintPreview`/`DiscordAnswerPreview` 3곳에 `react-markdown`+`remark-breaks`(신규 의존성 -
단일 개행도 디스코드처럼 줄바꿈되게) 적용. 문제 텍스트는 블록, 힌트/정답은 고정 문구 사이에 인라인으로
섞여야 해서 `<p>`를 Fragment로 치환하는 `INLINE_MARKDOWN_COMPONENTS`로 분리 처리. 힌트는 자동 생성된
경우(`isAuto`) 마크다운 적용 대상에서 제외(◼로 가린 정답이라 서식 대상이 아님). 신규 CSS `.df-markdown`
(`styles.css`)은 기존 `.markdown-desc`와 달리 앱 라이트/다크 테마 변수를 쓰지 않고 `color: inherit`로
디스코드 다크 하드코딩 색을 그대로 물려받음(주변 `.discord-frame` 계열과 동일 원칙).

**작업 2(웹 API 보안 점검)**: 문서의 우선순위 체크리스트를 그대로 진행.
1. **Rate limiting 신규 도입**(`quizbot/managers/web/web_rate_limit.ts`, `express-rate-limit`) -
   `/api/*`+`/health`에 계층형 적용(정적 자산 제외). 처음엔 문서 제안대로 고정 윈도우 250ms/1회(조회),
   1000ms/1회(쓰기)로 구현했다가 기존 통합 테스트 다수(트리 조회 직후 세션 재확인, "확정 후 바로
   재선택" 등 정상적인 순차/버스트 호출)가 깨지는 걸 발견 — 평균 처리량은 유지하되 윈도우를 1초로 넓혀
   짧은 버스트를 허용하도록 조정(조회 1000ms/4회, 쓰기 1000ms/3회). 키는 세션 토큰 우선, 토큰 없는
   요청/무효 토큰은 IP로 폴백(`ipKeyGenerator` 사용, IPv6 정규화). 유닛테스트 4건 신규
   (`test/managers/web/web_rate_limit.test.js`).
2. **IDOR 라이브 검증** - 코드 리뷰로는 이미 안전 확인됨(SQL 레벨 소유권 강제). 기존 회귀 테스트는
   `selectOwnedQuizInfoById`를 무조건 빈 배열로 mock해서 "404가 나온다"만 확인하던 것을, 서로 다른
   두 세션(owner_A/owner_B)을 실제로 만들고 mock이 creator_id를 비교하게 해 교차 접근을 더 사실적으로
   재현하는 테스트 2건(PUT/DELETE) 추가.
3. **백엔드 검증 구멍 2개 수정**(`web_quiz_editor_routes.ts`) - `answer_type` 화이트리스트 체크 추가,
   `validateQuizMetadata`/`validateQuestionFields`가 `typeof === 'string'`일 때만 길이를 검사해
   비문자열(객체/배열/숫자) 입력이 검증을 통째로 건너뛰던 문제 수정(`answers` 필드는 타입 체크 없이
   `.trim()`을 호출해 TypeError로 요청이 죽을 수 있는 경로였음 - 가장 심각했던 구멍).
4. **SQL 하드닝** - `db_quiz.ts`의 `updateQuizInfo`/`updateQuestionInfo`가 `quiz_id`/`question_id`를
   쿼리 문자열에 직접 보간하던 걸 `$n` 플레이스홀더로 교체(실익은 없었지만 방어적 코드로 정리).

검증: `tsc --noEmit`(0 error)/`lint`(0 error)/`test`(343 pass)/양쪽 `build` 전부 통과. 실제
Discord+브라우저 재검증은 안 함(보안 점검이라 코드/테스트 레벨 검증이 핵심, UI 변경은 마크다운 렌더링
뿐이라 낮은 리스크로 판단).

## 2026-08-12 — 웹 API 보안 점검 심화 재조사, 실제 SQL 인젝션 1건 발견+수정 (B-7 추가, 같은 세션)

위 B-7 완료 직후 사용자가 "모든 API CALL이 정말 안전한거 맞지?"라고 재확인 요청 — 원래 조사 스코프
(`/api/my-quizzes`, 퀴즈 편집 API)만 믿지 않고 웹에서 도달 가능한 모든 라우트(`web_express_app.ts`
전체)를 그 데이터가 최종적으로 어디서 쓰이는지까지 따라가며 재검토했다.

**[심각] SQL 인젝션 발견+수정**: `POST /api/session/confirm`(mode:omakase/multiplayer)의
`basket_items`가 서버 검증 없이 그대로 브로드캐스트→`quiz_info`에 저장됐다가, 퀴즈가 실제 시작될 때
(`quiz_system/lifecycle/initialize.ts`의 `OmakaseQuizInitialize`, 장바구니 모드)
`db_quiz.ts`의 `selectRandomQuestionListByBasket`이 각 `basket_item.quiz_id`를 문자열로 이어붙여
`WHERE quiz_id IN ${...}`에 그대로 삽입하는 지점까지 도달할 수 있었음. 디스코드 전용이던 시절엔
이 값이 항상 DB에서 읽은 실제 정수로만 채워져 무해했지만(기존 회귀 테스트도 이 "문자열 그대로 삽입"
동작을 정상으로 간주해 고정하고 있었음), 웹 API가 이 필드를 검증 없이 그대로 받게 되면서 UI를 거치지
않고 직접 API를 호출하면 임의 SQL을 흘려보낼 수 있는 실제 취약점이 됐던 것. 수정: (1)
`selectRandomQuestionListByBasket`을 `quiz_id_list: number[]`를 받아 `WHERE quiz_id =
ANY($1::int[])`로 파라미터화, (2) `user_quiz_info_manager.ts`의 `loadQuestionListByBasket`도 배열을
그대로 전달하도록 시그니처 변경, (3) `initialize.ts`의 `OmakaseQuizInitialize`에서 실제 SQL 호출
직전 `parseInt`+`Number.isInteger`로 정수만 필터링(호출부 방어까지 이중으로). 회귀 테스트: 기존
`db_manager.test.js`의 "문자열 그대로 삽입" 테스트를 파라미터화 검증으로 교체, `user_quiz_info_manager
.test.js`에 빈 배열 short-circuit + 배열 그대로 전달 테스트 2건 신규.

**[경미] 미검증 텍스트가 공유 embed에 반영되던 문제도 같이 수정**: `POST /api/session/select`
(진행 중 선택 미리보기)의 `title`이 길이 검증 없이 `WebHandoffUI.refreshLockedEmbed()`를 통해 그
길드의 공유 잠금 화면 embed에 그대로 꽂히고 있었음 — UI 없이 직접 호출하면 임의 길이 문자열로 embed를
깨뜨리거나 다른 길드원에게 스팸성 텍스트를 노출시킬 수 있었던 지점. 표시 직전 60자로 자르도록 수정
(`quiz_ui/web-handoff-ui.ts`).

**Rate limit 수치도 완화**: 사용자가 처음 도입한 값(조회 1초당 4회/쓰기 1초당 3회)이 실사용 기준
너무 빡빡하다고 판단 — 조회 1초당 10회/쓰기 1초당 8회로 완화(`web_rate_limit.ts`, 유닛테스트
`web_rate_limit.test.js`도 새 수치로 갱신).

검증: `tsc --noEmit`(0 error)/`lint`(0 error)/`test`(345 pass)/양쪽 `build` 전부 통과. **미검증** —
오마카세/멀티플레이 장바구니 모드는 이번에 SQL 호출 방식(문자열 조립 → 파라미터화 배열)이 실제로
바뀌었으니 다음 세션에 실제 Discord에서 한 번 플레이해서 정상 동작하는지 확인 권장
(`docs/TEST_CHECKLIST.md` Y 섹션).

## 2026-08-12 — `basket_items` 소유권/공개여부 검사 추가 (B-7 심화 조사 후속)

같은 날 B-7 심화 조사에서 SQL 인젝션은 막았지만 `is_private`/`is_use` 필터가 빠진 걸 발견했던 항목
(위 항목 참고) — 다음 세션 최우선으로 남겨뒀던 걸 바로 착수. `db_quiz.ts`의
`selectRandomQuestionListByBasket` CTE에 `and is_private = false`, `and is_use = true` 추가(짝
함수 `selectRandomQuestionListByTags`와 동일 패턴). 착수 전 사용자가 "애초에 퀴즈함에 private 퀴즈를
담는게 불가능하지 않냐"고 전제를 확인해왔는데, 맞는 지적이었음 — **정상 프론트엔드 UI 흐름으로는
불가능**하고, 실제 공격 경로는 웹 API를 프론트엔드 없이 직접 호출하는 경우(`POST
/api/session/confirm`의 `basket_items`는 서버가 정수 여부만 검증하고 quiz_id 자체는 검증하지 않음 —
자기 세션 토큰으로 `curl` 등으로 임의 quiz_id를 보내면, 순차 발급이라 열거 가능한 다른 유저의 비공개
퀴즈 ID를 문제 출제에 끼워넣을 수 있었음). 이 전제를 확인받은 뒤 진행. 회귀 테스트:
`db_manager.test.js`에 쿼리 문자열이 두 조건을 포함하는지 확인하는 테스트 1건 신규.

검증: `tsc --noEmit`(0 error)/`lint`(0 error)/`test`(346 pass)/`build` 미실행(백엔드 `.ts` 변경뿐,
런타임 반영 필요 시 `npm run build`부터). **미검증** — 실제 Discord+브라우저로 정상 흐름(공개 퀴즈
장바구니 담기→오마카세/멀티플레이 플레이) 재확인 안 함, B-7의 기존 미검증 항목과 함께 다음 세션에
확인 권장.

## 2026-08-12 — MMR 비대칭 보정 + 랜덤 추첨 셔플 버그 수정 (POST_B_ROUND_TEST_FEEDBACK_TODO 11/12)

같은 세션에서 이어서 진행. 사용자에게 구체적 불만을 먼저 물어봄 — MMR은 "점수 변동폭 부적절/실력차
반영 안 됨", 추첨은 "특정 퀴즈/문제 쏠림".

**MMR(`multiplayer_mmr.ts`)**: 코드 리뷰 결과 `calcWinnerMMR`/`calcLoserMMR` 둘 다 상대 길드의
MMR/전적을 전혀 참조하지 않는 구조(Elo류 상대평가 아님)라 "실력차 미반영"은 설계상 원래 그런 것임을
설명. 사용자가 "구조는 그대로 두고 비대칭만 보정"으로 범위를 좁힘(Elo식 재설계는 안 함) — 구체적으로
`calcLoserMMR`의 `question_ratio`에만 `Math.min(0.5, ...)` 캡이 걸려있어서, 캡 없는 `calcWinnerMMR`과
달리 풀게임(60문제)을 져도 최대 -40점밖에 안 깎이는데 승자는 최대 120점까지 얻는 구조적 비대칭이
있었음 — 이 캡을 제거해 승자와 동일한 비율 공식으로 맞춤(다른 보너스/공식은 그대로 유지, 승률
스노우볼 보너스는 이번엔 안 건드림 — 사용자가 "가장 작은 변경"으로 캡 제거만 선택). 회귀 테스트:
`multiplayer_mmr.test.js`의 옛 "최대 50%로 제한된다" 테스트(캡 자체를 검증하던 테스트라 전제가
사라짐)를 새 값 기준 2개 테스트로 교체.

**랜덤 추첨(`quiz_system/lifecycle/initialize.ts`)**: 원인 후보 2개 발견 — (1) `db_quiz.ts`의
`ORDER BY RANDOM()`이 퀴즈 단위가 아니라 문제 단위로 균등해서 문제 수 많은 퀴즈가 구조적으로 더 자주
나오는 것(쿼리 구조 변경 필요, 범위가 커서 이번엔 미착수), (2) `initialize.ts` 3곳(Dev/Custom/Omakase
퀴즈 초기화)의 `question_list.sort(() => Math.random() - 0.5)`가 균등분포가 안 나오는 것으로 잘 알려진
깨진 셔플 패턴 — 같은 코드베이스의 `tagged_dev_quiz_manager.ts`(`getQuestionListByTags`)엔 이미 올바른
Fisher-Yates가 있어서 방식이 갈려있었음. 사용자가 (2)만 먼저 고치기로 결정 — `initialize.ts`에
Fisher-Yates `shuffleArray` 헬퍼를 추가해 3곳 전부 교체.

검증: `tsc --noEmit`(0 error)/`lint`(0 error)/`test`(347 pass, MMR 회귀 테스트 갱신 포함)/`build`
미실행(백엔드 `.ts` 변경뿐). **미검증** — 셔플 자체는 알고리즘이 잘 알려진 표준 패턴이라 별도 분포
테스트는 추가 안 함(기존 `tagged_dev_quiz_manager.ts`의 Fisher-Yates도 동일하게 분포 테스트 없음).
실제 멀티플레이 대결로 MMR 변동폭이 체감상 나아졌는지는 다음 세션에 실사용으로 확인 필요. "특정 퀴즈
쏠림"의 근본 원인 후보 (1)(퀴즈 단위 계층화 샘플링 검토)은 여전히 미해결 — 이번 셔플 수정 후에도
쏠림이 계속 느껴지면 그때 착수.

## 2026-08-12 — UI 개선 2라운드 마지막 [P1] 항목 완료 (`UI_IMPROVEMENT_PLAN_ROUND2.md` B-5)

같은 세션에서 이어서 진행. `docs/ACTIVE_PLAN.md` B-4에 남아있던 마지막 [P1] 항목 — 멀티플레이 밴
메시지가 "당신 또는 이 서버가 퀴즈봇 운영 정책을 위반하여..."로 시작해 본인이 밴된 건지 서버가
밴된 건지 구분이 안 되고, 다음 행동(이의제기 등) 안내도 없던 문제. `multiplayer-quiz-select-ui.js`의
`checkMultiplayerBan(list)`(길드ID/유저ID를 한 배열로 묶어 한 번에 검사)를
`checkMultiplayerBanMessage(interaction)`으로 교체 — 유저/길드를 따로따로 검사해서 어느 쪽이 밴됐는지
명시하는 메시지를 반환하고, 다른 실패 안내(`user-question-info-ui.ts` 등)와 동일한 문의처
(otter6975@gmail.com) 안내를 추가. `createLobby`/`tryJoinLobby` 두 호출부 모두 교체.

같은 증상이 있는 `web-handoff-ui.ts`의 `buildMultiplayerUI`(웹 경로, `failWithReason('이용 정책
위반으로 멀티플레이를 이용할 수 없어요.')`)는 계획 문서의 스코프(`multiplayer-quiz-select-ui.js`,
디스코드 경로)가 아니라 이번엔 손 안 댐 — 필요하면 다음에 별도로 논의.

검증: `tsc --noEmit`(0 error)/`lint`(0 error)/`test`(347 pass, UI 클래스라 관례상 별도 유닛테스트는
추가 안 함). **미검증** — 실제 Discord에서 밴된 계정/서버로 멀티플레이 시도해서 새 메시지가 정상
노출되는지 확인 안 함, 다음 세션에 확인 권장.

## 2026-08-12 — UI 개선 2라운드 [P2]/[P3] 일부 완료 (사용자가 직접 항목 지정)

같은 세션에서 이어서 진행. 사용자가 `UI_IMPROVEMENT_PLAN_ROUND2.md`에서 구체적으로 지정한 항목만
착수 — B-1 전체 4항목, B-4 2항목, B-7 1항목.

**B-1 (봇 전역 에러/온보딩) 전체 4항목**:
- 도움말/온보딩 신설 — `/도움말` 슬래시커맨드(`command_manager.ts` + `bot.js`의 `help_handler`,
  주요 명령어 사용법 안내. 관리자 전용 명령어(`quizmgr`/`신고처리`)는 루트 CLAUDE.md의 "호기심 유발
  방지" 관례에 따라 의도적으로 제외) + `client.on('guildCreate', ...)` 신설(시스템 채널 우선 시도,
  권한 없으면 메시지를 보낼 수 있는 첫 텍스트 채널로 폴백, 보낼 채널이 아예 없으면 조용히 넘어감).
- 인터랙션 타임아웃 안내 — 만료된 버튼을 눌렀을 때 `deferUpdate()`만 하고 끝나던 것을, 성공 시
  `followUp()`으로 "이 버튼은 만료됐어요" 안내 추가. `deferUpdate()` 자체가 실패하는 경우(인터랙션
  토큰이 완전히 죽은 경우)는 응답할 방법이 없어 로그만 남기도록 변경(기존엔 완전히 침묵).
- `/퀴즈정리` 확인 절차 — 확인/취소 2버튼 프롬프트 추가(다른 화면의 파괴적 동작 확인 패턴과 동일).
  확인 프롬프트는 본인만 보이게(ephemeral), 실제 정리 결과는 기존과 동일하게 채널에 공개로 안내해
  진행 중이던 다른 참가자도 알 수 있게 유지.
- 메시지 심각도 구분 — `bot.js` 안의 모든 메시지가 🔸 하나로 통일돼 있던 것을 🔸(안내)/⚠️(실패·
  제한)/✅(성공) 3단계로 구분(18곳). **`bot.js` 범위로만 한정** — `quiz_ui/*` 등 나머지 파일은 여전히
  전부 🔸(또는 파일마다 제각각)라서, 전체 코드베이스 스윕은 범위가 커서 이번엔 안 함(후속 과제로 문서에
  남김).

**B-4 (서버 설정) 2항목**:
- "기본값으로 초기화" 버튼 신설 — `quiz_option.js`의 `OptionStorage` 생성자 초기값을 모듈 상수
  `DEFAULT_QUIZ_OPTION`으로 추출(동작 변경 없는 순수 추출) + `getDefaultQuizOption()` export.
  `option_control_btn_component`(`base_components.ts`)에 버튼 추가, `server-setting-ui.ts`의
  `handleResetOption`이 이 값으로 `option_data`를 되돌림 — 기존 "[저장]을 눌러야 실제 반영"
  관례 그대로 유지(초기화만으로는 DB에 안 씀). 회귀 테스트 `test/quiz_option/quiz_option.test.js` 신설.
- 문구 개선 — "유사 정답 생성" 설명이 예시 하나(크레이지 아케이드→크아)에만 의존하던 것을 실제 동작
  (여러 단어 정답의 각 단어 앞글자 조합)을 먼저 설명하도록 수정, 예시는 괄호로 보조. "정밀 오디오
  자르기" 설명의 "하이트라이트" 오타를 "하이라이트"로 수정. 둘 다 `text_contents.json`만 수정.

**B-7 (스코어보드) 1항목**:
- "[베타 시즌]" 하드코딩 이동 — 사용자가 지정한 범위(그 문구 하나)만 `text_contents.json`의
  `scoreboard.season_label`로 이동, `scoreboard-ui.ts`의 임베드 제목이 이 값을 보간하도록 수정.
  스코어보드의 나머지 문구(제목 앞부분, "불러오는 중...", "불러오지 못했습니다" 등)는 여전히
  하드코딩 — 전체 마이그레이션은 스코프 밖.

검증: `tsc --noEmit`(0 error)/`lint`(0 error, 기존 warning 수준 유지)/`test`(349 pass, 신규
`quiz_option.test.js` 2건 포함)/`build` 미실행(소스 변경뿐, 실제 봇 재생 확인 시 `npm run build`부터
안내할 것). **미검증** — 전부 코드 리뷰+자동 테스트 레벨. 실제 Discord로 확인 필요: `/도움말` 응답,
`guildCreate` 환영 메시지(새 서버 초대해야 트리거됨 — 로컬 테스트 어려움), 만료된 버튼 클릭 시 안내,
`/퀴즈정리` 확인 플로우, 서버 설정 화면의 "기본값으로 초기화" 버튼, 스코어보드 제목 표시. 다음 세션
`docs/TEST_CHECKLIST.md` AB 섹션 참고.

## 2026-08-12 — `auto_script/` 운영 스크립트 조사 완료 (인수인계용, 코드 미수정)

같은 세션 마지막에 사용자가 "다음 세션에서 봇 자동 설치/실행/중지 스크립트를 개선할 것"이라고
예고, 코드 수정 없이 현재 상태만 조사해서 `docs/plans/SERVER_SCRIPT_IMPROVEMENT_PLAN.md`로 정리해둠.
`auto_script/` 전체 파일 지도, cron 등록 스케줄(봇이 하루 2번 9시/21시에 의도적으로 재시작되는
운영 방식), 발견한 문제 8건(가장 심각한 건 `install_quizbot3.sh`가 클론하는 저장소 주소
`OtterBK/Quizbot3`가 이 저장소의 실제 origin `OtterBK/discord-quizbot-v2`와 다르다는 것 — 새 서버
설치 시 오래된 코드를 받아올 가능성), 착수 전 사용자에게 물어봐야 할 질문 5개(실제 운영 서버가 이
스크립트 그대로 도는지 vs 수동 pm2/systemd/`dist/` 빌드 운영인지가 가장 중요)까지 정리 완료.

## 2026-08-12 — `auto_script/` 운영 스크립트 개선 구현 완료 (같은 날 후속 세션)

위 조사 문서의 질문 5개를 순서대로 확인받은 뒤(가장 심각했던 저장소 주소 문제부터) 착수. 확인 과정에서
**더 심각한 사실 발견**: 지금 운영 중인 서버는 TS 마이그레이션 이전(88개 파일이 아직 `.js`였던 시절) 구코드가
배포된 상태 — 소스 트리의 `index.js`를 그대로(`npm run build` 없이) 실행하면 이미 `.ts`로 전환된 매니저를
require하는 순간 크래시하기 때문(전환된 파일은 원본 `.js`가 삭제돼 있고, `index.js`/`bot.js` 어디에도
`ts-node/register` 같은 런타임 트랜스파일 훅이 없음 — 직접 `node -e "require(...)"`로 재현 확인). 곧 GCP에
새 서버를 만들며 `develop-v3.5`(TS 마이그레이션 반영) 기준으로 재구축할 예정이라는 걸 확인하고 그에 맞춰
스크립트 전체를 재설계.

**변경 내용**:
- `install_quizbot3.sh`: 클론 주소를 `OtterBK/Quizbot3`(옛 이름) → `OtterBK/discord-quizbot-v2`로 수정,
  설치할 브랜치를 고를 수 있는 프롬프트 추가(기본 `master`), `npm install` 뒤 `npm run build` 추가(TS를
  `dist/`로 컴파일 — 이제 필수 단계), 신규 `auto_script/systemd/quizbot3.service.template`을 설치 경로로
  채워 `/etc/systemd/system/quizbot3.service`로 설치 + `systemctl enable`(시작은 안 함, 기존처럼
  `quizbot_start.sh`로 수동 시작).
- `server_script/quizbot_start.sh`/`quizbot_stop.sh`: 포그라운드 `node index.js` 직접 실행 + `pkill -f`
  기반 프로세스 종료를 `systemctl start/stop quizbot3`로 교체 — 경로 하드코딩 문제(설치 경로가 기본값이
  아니면 실행 스크립트가 깨지던 버그) 자체가 사라짐(경로는 유닛 파일에 고정), 로그도 이제 journal로
  자동 수집됨(`journalctl -u quizbot3 -f`), ffmpeg orphan은 systemd가 기본 동작(`KillMode=control-group`)으로
  같은 cgroup의 자식 프로세스까지 정지 시 함께 정리해주므로 `pkill -f ".*ffmpeg.*"`(다른 용도의 ffmpeg까지
  전부 죽이던 과도하게 넓은 패턴)를 제거.
- `quizbot3.service`(신규): `Restart=on-failure` — cron이 하루 2번(9시/21시) 명시적으로 stop/start를
  호출하는 기존 방식과 systemd의 자동재시작이 서로 안 부딪히도록(수동 `stop`은 systemd 시맨틱상 애초에
  auto-restart 대상이 아님, 예기치 않은 크래시만 자동 복구).
- `server_script/update_yt-dlp.sh`: `curl -LO`(cwd에 받고 `mv`) → `curl -Lo "$TARGET_PATH/yt-dlp"`(바로
  받기)로 수정 — cron 실행 시 작업 디렉터리에 따라 파일이 엉뚱한 곳에 남을 수 있던 문제 제거.
- `정석 사용법.txt`: 옛 스크립트 이름(`setup_quizbot3.sh`) 참조를 걷어내고, 구서버 백업 → 신서버에서
  브랜치 선택 설치(빌드 자동 포함) → config 덮어쓰기 → cron 등록 → `quizbot_start.sh` 실행까지 실제
  사용 순서 그대로, `systemctl status/journalctl` 확인 명령과 코드 업데이트 시 `git pull` 뒤 `npm run
  build`를 빼먹으면 안 된다는 안내 추가.
- 재시작 주기(하루 2번 9/21시)와 원격 백업(rsync) 스크립트 정식화는 사용자 확인 후 **이번 스코프에서
  제외**(전자는 기존 install 스크립트 값 그대로 유지, 후자는 다음 기회로 보류 — 실주소가 레포에 안
  들어가게 설계까지는 검토했으나 착수 안 함).
- 루트 `CLAUDE.md` "빌드/배포" 섹션을 위 발견(운영 봇은 이제 `dist/index.js` 실행이 필수) 기준으로
  갱신.

검증: 수정한 셸 스크립트 4개(`install_quizbot3.sh`/`quizbot_start.sh`/`quizbot_stop.sh`/
`update_yt-dlp.sh`) `bash -n` 문법 검사 전부 통과. **미검증** — 실제 GCP 서버에 새로 설치해보는 실사용
테스트는 아직 안 함(다음 서버 생성 시 최우선 확인 대상), `drop_ffmpeg.sh`/`db_script/` 하위는 이번에
검토만 하고 로직 변경은 없음.

## 2026-08-13 — "이 버튼은 만료됐어요" 오탐 버그 + 실시간 공지 UI 이동 + 웹 세션 소유자 복귀 불가 수정

사용자가 `/퀴즈`/`/퀴즈만들기`에서 디스코드 UI/웹 UI 둘 중 뭘 눌러도 "이 버튼은 만료됐어요" 안내가
뜬다고 보고 — 조사 결과 **거의 모든 정상 메뉴 전환에서 발생하는 광범위한 회귀**였음.

- **원인**: `bot.js`의 전역 fallback(위 2026-08-12 "UI 개선 2라운드 B-1 [P2]" 항목에서 신설)이
  `interaction.replied`/`.deferred`/`.explicit_replied`가 전부 false면 무조건 "만료됐어요"를 띄웠는데,
  `SelectUIModeUI`/`MainUI` 등 대부분의 "`return new XXXUI()`" 패턴은 새 UI를 `base_interaction.editReply()`
  (PUBLIC)나 `base_message.edit()`(PRIVATE)로 갱신할 뿐 **정작 지금 클릭된 인터랙션 자체는 한 번도
  reply되지 않는 게 정상 동작**(예전엔 이 경우 조용히 `deferUpdate()`만 하고 끝났음). uiHolder/quiz_session이
  실제로 있었는지와 무관하게 안내가 뜨는 게 버그였음 — `quiz_session`/`uiHolder` 둘 다 못 찾은 "진짜 만료"
  케이스에서만 안내하도록 수정(`quizbot/bot.js`).
- **곁가지로 발견**: `current_notice.txt`(실시간 공지)가 `/퀴즈` 입력 시 `SelectUIModeUI`와 별개로
  `interaction.channel.send()`로 매번 새 메시지를 또 보내고 있었음 — 사용자 요청으로 `SelectUIModeUI`
  (`quizbot/quiz_ui/select-ui-mode-ui.ts`)의 embed 필드로 이동(`bot.js`의 별도 발송 코드 제거). 이 화면은
  트랙 선택 전에만 보이고 웹 UI 선택 후(`WebHandoffUI`)에는 다시 안 뜨므로, 자연스럽게 "웹 UI에서는
  실시간 공지 불필요"도 같이 만족됨.
- **웹 세션 소유자가 디스코드 UI로 못 돌아가는 문제**: `createMainUIHolder`(`ui-system-core.ts`)가
  길드에 웹 세팅 중인 `WebHandoffUI`가 있으면 **요청자가 그 세션의 소유자 본인이어도** 항상 "권한
  가져오기" 하이재킹 방어 안내만 띄웠음 — 본인이 다시 `/퀴즈`를 입력해 디스코드 UI로 돌아가려 해도
  "권한 가져오기"를 눌러봐야 같은 웹 잠금 화면만 재생성돼서 돌아갈 방법이 아예 없었음. 요청자가 소유자
  본인이면 이 가드를 건너뛰고 기존 홀더를 `free()`한 뒤 `SelectUIModeUI`를 새로 띄우도록 수정 — 다른
  유저가 하이재킹 시도할 때의 방어는 그대로 유지.

검증: `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(349 pass)/`npm run build`(백엔드) 전부
통과, `SelectUIModeUI` 인스턴스화해서 공지 필드가 실제로 채워지는지 직접 확인. **미검증** — 세 가지
모두 실제 Discord로는 아직 안 돌려봄, 특히 "웹 세션 소유자 본인 복귀" 시나리오는 다음 세션에서 우선
확인 권장.

## 2026-08-13 — 실시간 공지 구분선 추가 + force_take 이후 투트랙 선택권 제공 (같은 날 후속)

위 항목 검토 중 사용자가 준 추가 피드백 2건.

- **실시간 공지 구분선**: "실시간 공지를 UI에 잘 녹여야했는데 그렇지 않다"는 지적 — 설명 문구 바로
  아래 필드가 붙어있어 시각적으로 구분이 안 됐음. `SelectUIModeUI.buildNoticeFields()`
  (`quizbot/quiz_ui/select-ui-mode-ui.ts`)에 빈 이름(zero-width space) + 가로줄 문자(`━` 반복) 필드를
  공지 필드 바로 앞에 추가해 구분선 역할을 하도록 함.
- **force_take(권한 가져오기) 후 투트랙 선택권 미제공**: 사용자1이 웹 UI로 조작 중일 때 사용자2가
  `/퀴즈` → "권한 가져오기"를 누르면, 예전엔 곧장 `WebHandoffUI`(웹 잠금 화면)로 강제 진입됐음 —
  사용자2가 디스코드 UI로 하고 싶어도 선택권이 없었음. `bot.js`의
  `handle_web_handoff_force_take`가 부르던 `ui-system-core.ts`의 `createWebHandoffUIHolder`를
  `createForceTakeUIHolder`로 교체(기존엔 이 함수가 force_take 전용으로만 쓰이고 있어서 이름과
  동작을 아예 이 용도에 맞게 바꿈) — 이제 곧장 `WebHandoffUI`가 아니라 `SelectUIModeUI`(디스코드
  UI/웹 UI 선택 화면)를 새로 띄운다. `SelectUIModeUI`가 `mode`/`pending_web_session`(force_take로
  이미 발급받은 토큰) 생성자 인자를 받도록 확장 — 웹 UI를 고르면 이 토큰을 그대로 `WebHandoffUI`에
  넘겨 재사용(추가 세션 발급 없음), 디스코드 UI를 고르면 `ipc_manager.sendWebSessionRequest({action:
  'release', ...})`로 안 쓰는 토큰을 조용히 반납한 뒤 `MainUI`로 진입. 이 화면엔 "🔓 권한을
  가져왔어요" 안내 필드도 추가해 왜 이 화면이 떴는지 맥락을 줌.

검증: `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(349 pass)/`npm run build` 전부 통과,
`SelectUIModeUI`를 인자 없이/`pending_web_session`과 함께 각각 인스턴스화해서 구분선+안내 필드가
의도대로 나오는지 직접 확인. **미검증** — 실제 Discord에서 두 유저로 force_take 시나리오를 아직
안 돌려봄, 다음 세션에서 우선 확인 권장.

## 2026-08-13 — 하이재킹 방어가 디스코드 UI 트랙엔 아예 없던 근본 버그 발견 + force_take 전면 재설계 (같은 날 후속)

위 항목의 "미검증" 권고대로 사용자가 직접 시나리오를 재현해보고 "권한 가져오기 기능이 망가졌다"고
보고 — 재현해보니 위 수정은 증상(웹 UI 강제 진입)만 없앴을 뿐, **하이재킹 가드 자체가 여전히
`WebHandoffUI`(웹 UI 트랙)에만 걸려있었다는 더 근본적인 기존 버그**가 드러남. 사용자1이 "디스코드
UI"를 골라 `MainUI`를 쓰는 중엔 `isDisplayingWebHandoff()`가 애초에 false라서, 사용자2가 `/퀴즈`를
입력하면 확인 절차 없이 곧장 화면을 가로챌 수 있었음(사용자1의 진행 상황은 조용히 증발). 이건
2026-08-08 웹 연동 도입 당시부터 있던 설계 공백으로 보임 — 웹 세션만 "하이재킹해도 되는 자원"으로
보호하고 디스코드 UI는 애초에 보호 대상이 아니었음.

**수정**: `createMainUIHolder`(`ui-system-core.ts`)의 가드 조건을 `isDisplayingWebHandoff() &&
소유자 아님`에서 **`소유자 아님`만으로 일반화** — 디스코드 UI든 웹 UI든 다른 유저가 쓰는 중이면
동일하게 "🔒 OOO 님이 (웹에서 퀴즈를 세팅하는/퀴즈 화면을 사용하는) 중입니다" + "🔓 권한 가져오기"
안내가 뜬다(문구는 `isDisplayingWebHandoff()`로 여전히 분기).

**force_take 흐름도 함께 단순화**: 사용자가 "그냥 토큰을 재사용하지 말고 새로 발급하면 안 되나?"라고
질문 — 맞는 지적이라 판단해 위 항목에서 만든 `createForceTakeUIHolder`/`SelectUIModeUI`의
`mode`/`pending_web_session` 생성자 확장을 전부 되돌림. 이제 `bot.js`의 `handle_ui_force_take`(이전
이름 `handle_web_handoff_force_take`)는 IPC `force_take` 액션으로 토큰을 미리 발급받지 않고, 그냥
이전 홀더를 `free()`(웹 세션이 있었다면 `UIHolder.free()`가 알아서 release IPC를 보냄)한 뒤
`createMainUIHolder`를 **그대로 재사용**해서 이 버튼 인터랙션으로 새 `SelectUIModeUI`를 띄운다 — 웹
UI를 다시 고르면 `WebHandoffUI`가 평소처럼 `'create'` 액션으로 새 토큰을 발급받을 뿐이라, 특별한
재사용 로직 자체가 필요 없어짐(비용도 토큰 생성 1회뿐이라 무시할 수준). 컴포넌트/customId도
`web_handoff_force_take_comp`/`'web_handoff_force_take'`(웹 전용 이름)에서 `force_take_comp`/
`'ui_force_take'`(트랙 무관 일반 이름)로 리네임.

검증: `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(349 pass)/`npm run build` 전부 통과.
빌드 산출물(`dist/`)에 `ipc_manager`/`ui-system-core` 목(mock) 스크립트로 시나리오 전체를 직접
재현: 사용자1이 디스코드 UI 선택 → 사용자2의 `/퀴즈`가 하이재킹 가드에 막힘(`undefined` 반환 +
안내 메시지) → "권한 가져오기" 시뮬레이션(`free()` + `createMainUIHolder` 재호출) → 사용자2가 정확히
`SelectUIModeUI`(두 트랙 선택 화면)에 도달하는 것까지 확인. **미검증** — 실제 Discord 클라이언트로는
아직 안 돌려봄(특히 버튼 인터랙션의 `reply()`가 새 공개 메시지로 정상 발행되는지), 다음 세션 최우선.

## 2026-08-13 — 브랜치 전략 재편(develop-claude/develop/master) + docs/ 재정리 + quizbot_update.sh 신설

사용자가 앞으로 브랜치 용도를 `develop-claude`(Claude와의 바이브코딩용) → `develop`(실서버 설치해
전수 테스트하는 용도) → `master`(전수 테스트 통과 후 장기 운영) 3단계로 나누기로 결정. 이에 맞춰 여러
작업을 한 세션에 처리:

- **브랜치 rename**: 기존 작업 브랜치 `develop-v3.5`를 `develop-claude`로 rename(`git branch -m`,
  origin에는 아직 `develop-v3.5`만 있고 `push`는 안 함 — 로컬 전용 변경).
- **`docs/` 재정리**: `ACTIVE_PLAN.md`/`COMPLETED_WORK_LOG.md`/`TEST_CHECKLIST.md` 3개만 루트에
  남기고 나머지 22개를 `docs/plans/`(작업계획서 15개)/`docs/archive/`(로그성 보존 문서 5개)/
  `docs/mockups/`(정적 HTML 목업 2개)로 분류. 이동한 파일을 참조하던 모든 `CLAUDE.md`(루트+하위 6개)와
  `docs/*.md` 내부 상호 참조 경로를 스크립트로 일괄 치환 후 잔존 참조 없는지 grep으로 재검증.
- **`auto_script/server_script/quizbot_update.sh` 신설**: 운영 서버(`develop`/`master` 브랜치 전용,
  다른 브랜치면 실행 거부)에 최신 커밋을 반영하는 업데이트 스크립트 —
  `systemctl stop` → `git fetch` + `reset --hard origin/<브랜치>`(private_config.json 등 gitignore
  대상은 안 건드림) → `npm install` → `custom_node_modules` 패치 재적용(install 스크립트와 동일
  이유 — npm install이 패치 대상 패키지를 재설치하면 패치가 날아감) → `npm run build`(TS 빌드 실패
  시 서비스를 시작하지 않고 중단, 이전 `dist/`는 그대로 보존돼 안전) → `systemctl start`. `정석
  사용법.txt`/`CLAUDE.md` 갱신.
- **`develop-claude` → `develop` 병합**: 로컬 `develop`이 origin/master의 오래된 조상(unique 커밋
  0개, `git merge-base --is-ancestor`로 확인)이라 순수 fast-forward. 병합 후 `develop` 브랜치에서는
  `CLAUDE.md`(전부)와 `docs/`(대부분) 등 Claude 세션 전용 문서를 제거 — 상세는 `develop` 브랜치의
  커밋 로그 참고(이 로그 자체는 develop-claude 전용 문서라 develop에는 없음).

검증: 수정한 셸 스크립트(`quizbot_update.sh`) `bash -n` 통과. **미검증** — 실제 서버에서
`quizbot_update.sh` 실행은 안 해봄, 다음 서버 배포 시 최우선 확인 대상.

## 2026-08-13 — 랜덤 퀴즈 프리셋 설계+구현 완료 (B-8, 신규 기능)

웹 UI("랜덤 퀴즈" 탭 "직접 담기" 모드)에서 자주 쓰는 퀴즈함(quiz_id 목록) 조합을 이름 붙여 저장/재적용
하는 기능. 사용자 결정: 범위는 퀴즈함 목록만(옵션은 저장 안 함), 유저 단위 최대 10개.

- **스키마 설계**: 이 코드베이스는 마이그레이션 프레임워크가 없어 DDL을 직접 psql로 실행하는 관행 —
  `tb_random_quiz_preset`(메타)/`tb_random_quiz_preset_item`(항목, `sort_order`로 순서 보존) 연결
  테이블 2개로 설계(배열 컬럼 대신 `tb_like_info`류 기존 패턴을 따름, 퀴즈 삭제 시 FK
  `ON DELETE CASCADE`로 항목 자동 정리). 사용자가 직접 SQL 실행 완료 후, 신규 설치용 덤프
  (`auto_script/db_backup/base.sql`)에도 동일 스키마를 pg_dump 포맷 그대로 반영(알파벳 정렬 위치 등
  기존 관행 맞춤).
- **DB 헬퍼**: `quizbot/managers/db/db_random_quiz_preset.ts`(목록/이름 중복 확인/개수 카운트/생성/
  삭제 5개), `db_manager.js` facade에 재수출(export 36→41개, 회귀 테스트 갱신). `insertRandomQuizPreset`은
  트랜잭션 헬퍼가 없는 이 코드베이스 관행상 2단계 INSERT라, item 삽입 실패 시 방금 만든 빈 preset을
  직접 정리해 고아 방지.
- **Express API**: `web_express_app.ts`에 인라인 3개 추가(`GET`/`POST`/`DELETE
  /api/random-quiz-presets[/:preset_id]`, 기존 `/api/omakase-tags` 등과 동일한 배치 방식 — 별도
  라우터 파일 안 만듦). 당초 계획한 `requireOwnerScopedSession` 대신 **스코프 제한 없는
  `requireWebSession`만 사용**하도록 단순화 — guild 세션(omakase가 실제 쓰는 세션 종류)도 owner
  세션도 둘 다 `owner_id`를 갖고 있음을 코드 확인 후 결정. 이름 중복은 `db_core.sendQuery`가 에러
  코드를 구분 안 해서(항상 `undefined`) DB의 `UNIQUE(user_id, preset_name)` 대신 사전 SELECT로 확인.
- **프론트엔드**: `OmakaseTab.jsx`의 퀴즈함 드로워 상단에 "저장된 프리셋" 섹션 추가 — 기존
  `qd-row`/`qd-remove` 등 클래스를 그대로 재사용해 신규 CSS는 래퍼 3개뿐. 삭제는 `QuizDetailPage.jsx`와
  동일한 2클릭 확인(🗑→⚠️) 관례. 불러오기는 서버가 필터링 없이 내려준 `quiz_id_list`를 이미 불러온
  공개 퀴즈 목록(`userQuizzes`)과 대조해서 존재하는 항목만 채우는 방식 — 비공개 전환/삭제 필터링을
  프론트가 담당해서 별도 API/DB 조회가 필요 없어짐(설계 단순화).

검증: `npx tsc --noEmit`(0 error)/`npm run lint`(0 error, 기존 57 warning 수준 유지)/`npm test`(361
pass — `db_random_quiz_preset` 회귀 테스트 4건 + `/api/random-quiz-presets` 통합 테스트 9건 신규)/
`npm run build`(백엔드+프론트엔드) 전부 통과. **미검증** — 실제 Discord+브라우저 테스트 전무, 다음
세션 최우선(`docs/TEST_CHECKLIST.md` AE 섹션). 상세는 `docs/plans/RANDOM_QUIZ_PRESET_PLAN.md`.

## 2026-08-13 — 랜덤 퀴즈 프리셋 최초 구현 직후 사용자 피드백 3건 반영 (같은 세션)

(1) 프리셋 불러오기 시 아무 반응이 없던 문제 — `✓ "이름" 불러왔어요.` 안내를 3초간 표시 후 자동으로
지우도록 수정. (2) 사용자가 "API 직접 호출로 10개 제한을 우회할 수 있는지" 점검 요청 → 실제로
개수확인(SELECT)과 저장(INSERT)이 별도 요청이라 동시 호출 시 우회 가능한 TOCTOU 허점을 발견 —
`insertRandomQuizPreset`의 INSERT 문 자체에 `where (select count(*) ...) < $3` 조건을 넣어 원자적으로
재확인하도록 수정(완전한 직렬화는 아니지만 창을 크게 좁힘, 이 코드베이스에 트랜잭션/락 인프라가 없어
완전 방지는 과함으로 판단). (3) 삭제 확인(🗑→⚠️) 아이콘이 레이아웃에서 어긋나 보이던 문제 —
`.qd-remove`에 `display:flex` 중앙정렬 누락이 원인, 추가로 수정. 검증: `tsc`/`lint`/`test`(362
pass)/`web-frontend` `build` 통과(백엔드 `npm run build`는 `config/private_config.json`이 `dist/`로
복사되는 부작용을 피하려 이번엔 생략, `tsc --noEmit`으로 코드 정확성만 재확인). 상세는
`docs/plans/RANDOM_QUIZ_PRESET_PLAN.md` 하단.

## 2026-08-13 — 세션 중 `config/private_config.json` 실수로 덮어씀 → 사용자가 복구 (사고 기록)

랜덤 퀴즈 프리셋 작업 중 `npm test`가 `config/private_config.json`(비밀 설정, gitignore 대상) 부재로
전부 실패하는 걸 보고, 테스트 통과 목적으로 더미 값 `config/private_config.json`을 새로 만든 뒤
검증 차원에서 `npm run build`를 실행함 — 이 빌드가 `scripts/copy-js-assets.js`로 `config/*.json`을
`dist/`에 byte-for-byte 복사하는데, `dist/config/private_config.json`이 2026-08-07부터 살아남아있던
(소스 트리엔 이미 없어졌던) 사용자의 실제 설정 유일한 사본이었다는 걸 모르고 그 위에 더미 값을
덮어써버림. 파일이 삭제된 게 아니라 내용이 덮어써진 거라 git으로도 복구 불가(애초에 gitignore
대상이라 커밋된 적도 없음) — 다행히 사용자가 직접 복구함. 앞으로의 교훈은
`[[feedback_private_config_json_build_caution]]` 메모리로 저장, 재발 방지 규칙으로 삼음.

## 2026-08-14~15 — `docs/TEST_CHECKLIST.md` 전수 재검증 완료 (A~AE 30개 섹션)

체크박스 전체 초기화 후 A섹션부터 순서대로 재검증. 특수 환경(2클러스터 강제 실행, force_take 라이브
레이스컨디션)이나 미구현 기능(악성 길드 강제퇴장) 4개 항목만 남기고 전부 확인 완료. 진행 중 죽은
코드(`/신고처리` 슬래시커맨드, 이미 `/quizmgr` 관리자 패널로 대체됨)를 발견해 즉시 제거(예외 처리 —
명령어 목록 확인 항목 자체를 막던 케이스). 발견한 버그/개선사항은 전부 즉시 고치지 않고
`docs/plans/TEST_CHECKLIST_BUG_LOG.md`에 기록만 하고 계속 진행(아래 항목에서 일괄 수정).

## 2026-08-15 — 체크리스트 문서 정리 (기능 영역별 목차 + 중복/죽은 항목 정리)

전수 재검증 중 사용자가 "같은 주제(다크모드/세션 GC/하이재킹 방어/서버 설정)를 여러 섹션에서 반복
확인하게 된다"고 지적 — 섹션이 A→Z→AA→AE로 기능 추가 시점 순서로 계속 누적돼온 결과. 물리적 섹션
순서/내용은 유지(서로 다른 시점에 구현된 별개 시스템을 검증하는 경우가 많아 억지로 합치면 오히려
불명확해짐)하고: 기능 영역별 목차 추가, AC섹션의 이미 죽은 취소선 항목 삭제, W섹션의 O섹션과 100%
중복인 항목 삭제, AB섹션 서버설정 항목 2개를 F섹션으로 이동, 헷갈리는 지점(GC 만료/하이재킹 방어
용어)에 "다른 시스템" 설명 추가.

## 2026-08-15 — 전수 재검증 버그 로그 일괄 수정 (B-9)

`docs/plans/TEST_CHECKLIST_BUG_LOG.md`에 쌓인 14건을 순서대로 처리 — 11건 수정, 2건 보류. 실제
버그 3건의 원인을 특정해 수정했다는 게 이번 배치의 핵심:
- **E섹션 랜덤퀴즈 진행 중 크래시**(`Cannot read properties of null (reading 'quiz')`) — "그만두기"로
  강제종료할 때 가끔 발생한다는 사용자 힌트가 정확했음. `prepare.ts`의 `generateAudioResourceFromWeb`이
  yt-dlp 다운로드 `await` 도중 세션이 `free()`되면(`option_data`가 null로 초기화) await 재개 후 그
  null을 그대로 읽다 크래시하는 레이스 — 다른 실패 케이스와 동일한 방식(조용히 스킵)으로 처리하도록
  null 체크 추가.
- **J섹션 `/quizmgr` 신고처리 UnhandledPromiseRejection** — `sendReportLog`가 DB 조회 `await` 전에
  `interaction.explicit_replied`를 안 세워서 `bot.js` 전역 fallback의 `deferUpdate()`와 경합하는
  레이스(`user-question-info-ui.ts`의 `duplicateQuestion`과 동일 패턴). 동기적으로 플래그를 먼저
  세우도록 수정 + 기존에 `user.send()`로만(사실상 무응답) 처리하던 두 실패 분기도 `interaction.reply()`로
  교체.
- **P섹션 웹에서 유저 퀴즈 재선택 시 이미지 간헐적 미표시** — `UserQuizInfoUI.reapplyFromWebPayload`가
  `update()`(embed edit)를 쓰고 있었는데, Discord가 embed edit로는 새 이미지 URL을 간헐적으로 안
  불러오는 잘 알려진 버그(`user-question-info-ui.ts`의 "24.05.07 embed 이미지 버그"와 동일 원인) —
  `sendDelayedUI(this, true)` 강제 재전송으로 교체.
- **Q섹션 랜덤퀴즈 "직접 담기" 목록에 태그 미표시** — `OmakaseTab.jsx`의 `BasketQuizCard`에 태그
  렌더링 로직 자체가 없었음(`UserQuizTab.jsx`의 `QuizCard`엔 있었음) — 추가. `MultiplayerTab.jsx`도
  같은 컴포넌트를 재사용해서 "직접 골라 담기"(R섹션)도 같이 고쳐짐.

나머지: 트리비얼 문구 삭제 4건(J 신고접수 멘트, L 멀티플레이 밴 문의처, D 퀴즈함 제거 ephemeral 누락,
+ "봇 공유하기" 메뉴 신설), UX 개선 5건(B 투트랙 화면 서버수 표시, V 문제편집 탭 가시성(신규
`.segmented-tabrail`)/이어서 새 문제 추가 버튼(부수적으로 "새 문제 추가 화면 진입 시 이전 폼이 안
지워지던 버그"도 같이 발견해 수정)/비공개 퀴즈 안내문구, Q 퀴즈함 탭 전환 시 유지(`App.jsx`로 상태
끌어올림)). 보류 2건: E섹션 태그/퀴즈함 시작차단 간헐적 버그(정적 코드로는 원인 특정 실패, 재현
불안정), P섹션 호버 미리보기 상세설명/문제수(목록 API에 해당 데이터가 없어 API 설계 변경이 필요한
아키텍처 결정 — 방향 확정 전까지 보류). 검증: `tsc --noEmit`/`lint`(0 error)/`test`(362 pass, 웹
재선택 이미지 수정에 맞춰 `user_quiz_web_apply.test.js`의 mock holder에 `sendDelayedUI` 추가)/양쪽
`build` 전부 통과, 로컬 봇 재빌드+재시작 완료.

작업 중 `npm test`가 `config/private_config.json` JSON 파싱 오류로 30건 실패하는 걸 발견 — 파일
마지막 줄에 오타로 보이는 글자 하나(`ㄸ`)가 남아있었음(비밀 설정 파일이라 사용자 확인 후 삭제,
2026-08-13에 있었던 덮어쓰기 사고와는 다른 별개의 편집 사고로 추정).

## 2026-08-15 — 웹 안내 페이지 비주얼 개선 + 공지사항 정렬 안정화 + quizmgr 공지 관리 기능

사용자 요청 3건을 한 세션에서 처리:

1. **웹 UI 퀴즈 만들기 안내 페이지 비주얼 개선** — `GuidePanel.jsx`/`NoticesPanel.jsx` 둘 다 이미
   설치돼 있었지만 실제 연결이 안 돼 있던 `remark-breaks`를 `<Markdown remarkPlugins={[remarkBreaks]}>`로
   연결(원문의 단일 줄바꿈이 무시되던 문제 수정, 원문은 디스코드 임베드와 그대로 공유하므로 손대지
   않음). `GuidePanel.jsx`를 `.guide-page`/`.guide-card`(좌측 accent 컬러) 카드형 레이아웃으로 재구성,
   `NoticesPanel.jsx` 상세 화면도 동일 카드로 감쌈. CSS는 `web-frontend/src/styles.css`의 기존 디자인
   토큰(`--primary`/`--violet`/`--surface-sunken` 등, 라이트/다크 둘 다 대응)만 사용.
2. **공지사항 정렬 방식 변경** — 기존 `resources/notices/*.txt` 파일명 한글로케일 역순 정렬이 제목에
   따라 작성 순서를 보장 못 하는 문제(사용자 발견)를 해결. 파일명 앞에 14자리 타임스탬프
   접두사(`YYYYMMDDHHmmss_`)를 붙이는 방식으로 결정(mtime은 서버 배포 시 `git reset --hard`로 깨질 수
   있어 제외, 별도 인덱스 JSON도 검토했으나 파일-인덱스 불일치 위험으로 제외 — 사용자 선택).
   `notice_manager.ts`의 `loadNoticeList`가 이 접두사 기준 최신순 정렬(접두사 없는 레거시 파일은
   mtime 폴백)로 바뀌고, 기존 공지 2개는 `git log --follow`로 확인한 실제 최초 커밋 시점 순서로
   마이그레이션(`git mv`로 파일명 변경, 내용 무변경).
3. **quizmgr 공지 작성/수정/삭제 관리자 기능 신설** — `AdminPanelUI`에 "공지 관리" 버튼 추가,
   `AdminNoticeListUI`(목록 select + 작성 모달)/`AdminNoticeDetailUI`(본문 미리보기 + 수정 모달/삭제
   확인)를 `AdminBanListUI`와 동일 패턴(select 메뉴, 확인 절차)으로 신설.
   `notice_manager.ts`에 `writeNoticeFile`/`updateNoticeFile`/`deleteNoticeFile` 3개 추가 —
   `updateNoticeFile`은 제목이 바뀌어도 기존 타임스탬프 접두사(작성 순서)는 유지하고, 접두사 없던
   레거시 파일을 수정하면 그때 접두사가 새로 부여됨(자가 치유).

검증: `test/managers/notice_manager.test.js` 정렬/CRUD 테스트 갱신+추가(11 pass),
`test/quiz_ui/components.test.js` export 개수 64→69 갱신, `npm test`(370 pass)/`npm run lint`(0
error)/`web-frontend` `npm run build` 전부 통과. 관련 CLAUDE.md(루트 제외 `managers/`,
`quiz_ui/`, `quiz_ui/components/`) + `docs/TEST_CHECKLIST.md`(L섹션 공지 관리 신규 항목,
웹 안내/공지사항 항목 `[ ]`로 되돌림) 갱신 완료. 실사용 테스트(Discord+브라우저)는 다음 세션 확인 필요.

**같은 날 후속(사용자 실사용 확인 후)**: "예시 영상" 필드 제거(더 이상 예시 영상을 제공하지 않음) —
`config/text_contents.json`의 `quiz_tool_guide_ui.fields2` 삭제, `quiz-tool-guide-ui.ts`(디스코드)/
`web_express_app.ts`(`GET /api/quiz-tool-guide`)의 `fields2` 참조 제거(둘 다 이제 `fields1` 1개만
반환). `web_express_app.test.js`의 필드 개수 검증(2→1)도 같이 수정. 위 3건 중 나머지(비주얼 개선/정렬/
공지 관리)는 사용자가 실사용으로 정상 동작 확인 완료.

## 2026-08-15 — GCP 신서버 웹 UI "Cannot GET /" 버그 수정 (install/update 스크립트)

사용자가 직접 GCP에 새 서버를 세우고 `install_quizbot3.sh`로 설치 후 웹 UI(포트 3000, 방화벽 직접
설정)에 접속하니 "Cannot GET /"만 뜨는 문제 발견. 원인: `web-frontend/`(퀴즈 선택 웹 UI, React+Vite)는
루트와 별개의 독립 프로젝트라 루트 `npm run build`(tsc)로는 빌드되지 않는데, `install_quizbot3.sh`/
`quizbot_update.sh` 둘 다 루트 빌드만 실행하고 `web-frontend`는 안 빌드했음 — `web-frontend/dist/`가
없으니 `express.static`이 아무것도 못 찾아 Express 기본 404("Cannot GET /")가 뜬 것.
`cd web-frontend && npm install && npm run build`로 즉시 해결 확인 후, 두 스크립트 모두 루트 빌드
직후 같은 단계를 자동 실행하도록 수정(`install_quizbot3.sh`는 sudo로, `quizbot_update.sh`는
`npm install`/`npm run build` 실패 시 서비스 미시작 후 중단하는 기존 에러 핸들링 패턴 그대로 따름).
`auto_script/정석 사용법.txt`와 루트 `CLAUDE.md`의 "빌드/배포" 섹션도 이 단계를 명시하도록 갱신.
셸 스크립트라 `node:test` 대상은 아니고 `bash -n`으로 문법만 검증.

## 2026-08-15 — 웹 UI 문제 수 기본값 버그 수정 (20 고정 → 퀴즈 전체 문제 수)

사용자 발견: 웹 UI(공식 퀴즈/유저 퀴즈)에서 퀴즈를 선택하면 문제 수 스테퍼 초기값이 항상 20이었음
(퀴즈가 20개보다 많은 문제를 갖고 있어도). 원인은 `DevQuizTab.jsx:131`/`UserQuizTab.jsx:158`의
`clamp(20, 1, max)` 호출 — 이미 그 시점에 퀴즈의 전체 문제 수(`node.quiz_size`/`d.question_count`)를
알고 있었는데도 리터럴 `20`을 우선시하고 상한으로만 자르고 있었음(20보다 문제가 많으면 항상 20,
적으면 그제서야 전체 문제 수). 디스코드 쪽(`user-quiz-info.ui.ts`/`quiz-info-ui.ts`/
`alert-quiz-start-ui.ts`)은 원래부터 일관되게 "값이 없으면 전체 문제 수"를 기본값으로 쓰고 있어서,
웹 쪽도 같은 규칙으로 맞춤 — `clamp(node.quiz_size, 1, node.quiz_size)` /
`clamp(max_count, 1, max_count)`로 리터럴 20을 제거. 백엔드(`web_express_app.ts`의
`/api/session/confirm` 클램프)는 프론트가 보낸 값을 재검증만 할 뿐 기본값 계산에 관여하지 않아 손댈
곳 없음. 랜덤 퀴즈(오마카세)/멀티플레이는 원래부터 30이 관용적 기본값(고정 상한 100/60 안에서의
기본값 개념)이라 이번 규칙과 무관, 수정 대상에서 제외. `web-frontend` 자체 테스트는 없어(UI 미대상
관례) `npm run build`로 스모크 확인.

## 2026-08-15 — 운영 스크립트 3건 개선 (yt-dlp 자동 갱신, 프로세스 정리 강화, systemd 훅화)

사용자가 GCP 서버 운영 중 겪은 3가지를 한 번에 처리:

1. **설치 직후 yt-dlp 최신화** — `install_quizbot3.sh`가 QUIZBOT_PATH export 직후
   `update_yt-dlp.sh`를 바로 실행하도록 추가. cron을 등록해도 다음 스케줄(9시/21시)까지 기다려야
   해서, npm 번들 버전이 오래된 채로 첫 서비스가 뜨는 걸 방지.
2. **`quizbot_stop.sh` 후에도 프로세스가 안 죽는 문제** — 신규 `auto_script/server_script/
   kill_orphan_quizbot.sh`(`pkill -9`로 `node dist/index.js`/ffmpeg/yt-dlp 정리, drop_ffmpeg.sh와
   동일하게 경로 접두사 없이 매칭 — ExecStart가 상대경로라 절대경로로 매칭하면 오히려 못 잡음).
3. **`quizbot_start.sh` 중복 실행 방지** — "이미 떠 있으면 거부" 대신, 시작 직전에 위 청소 스크립트로
   잔여 프로세스를 먼저 정리하는 "자가 치유" 방식 채택(systemd가 같은 유닛의 중복 시작 자체는 이미
   막아주므로, 실질적 위험은 cgroup kill을 빠져나간 미추적 orphan과의 동시 실행 쪽).

**세 가지 다 `quizbot3.service.template`의 `ExecStartPre`/`ExecStopPost` 훅으로 구현** — 사용자 요청("이
기능들이 `systemctl start/stop/restart quizbot3`를 직접 써도 적용되게")에 따라 래퍼 스크립트
(`quizbot_start.sh`/`quizbot_stop.sh`)가 아니라 서비스 유닛 자체에 박아 넣음. 추가로
`TimeoutStopSec=90(기본)→20`, `KillMode=control-group`(명시)도 같이 설정 — 하루 2번 cron이
stop→(1분 뒤)start로 재시작하는데 기본 90초 타임아웃이면 그 1분 간격을 거의 다 잡아먹어 start가
stop 완료 전에 겹칠 위험이 있었음.

**주의(다음 세션/사용자가 알아야 할 것)**: `quizbot_update.sh`는 서비스 파일을 재생성하지 않으므로,
이미 설치된 서버는 서비스 파일을 수동으로 다시 설치해야 이번 개선이 적용됨(명령어는
`auto_script/정석 사용법.txt`의 "systemd 서비스 동작 방식" 항목 참고). 셸 스크립트라 `bash -n`으로
문법만 검증, 실제 서버 반영/재설치 테스트는 사용자가 직접 진행 예정.

## 2026-08-15 — 봇 지원센터 링크 옵션 신설 + 3곳 연결 (디스코드 투트랙/MainUI, 웹 UI)

`SYSTEM_CONFIG.SUPPORT_SERVER_URL`(공개 설정, `system_setting.js`) 신설 — 사용자가 실제 값은 직접
채워 넣기로 해서 예시값(`https://discord.gg/YOUR_INVITE_CODE`)만 넣어둠. 이 값을 3곳에 연결:

1. **투트랙 화면(`select_ui_mode_btn_component`, `SelectUIModeUI`/`QuizEditSelectUIModeUI` 공유
   컴포넌트)** — 기존 "디스코드 UI"/"웹 UI" 2버튼 옆에 3번째로 "❓ 지원센터" Link 버튼 추가(customId
   없이 바로 외부 URL 이동, 인터랙션 핸들러 수정 불필요). 공유 싱글턴이라 `/퀴즈`/`/퀴즈만들기` 두
   진입점 모두에 자동 적용.
2. **`MainUI`(`main_ui_component`)** — 기존 "개인 정보 보호 정책" Link 버튼의 라벨/URL을 지원센터로
   교체(자리 재활용, "봇 공유" 버튼은 그대로 유지).
3. **웹 UI 헤더** — 신규 `GET /api/support-link`(`requireWebSession`, `SYSTEM_CONFIG.SUPPORT_SERVER_URL`
   그대로 반환) + `App.jsx`에 세션 로드 후 fetch → 헤더 `.topbar-actions`에 항상 보이는 pill
   (`.support-link`, violet 톤)로 노출. 기존 "봇 공유하기"처럼 "☰ 더보기" 드롭다운 안에 넣으면 눈에
   안 띈다는 사용자 피드백으로, 드롭다운을 거치지 않는 상시 노출 버튼으로 별도 설계.

검증: `test/managers/web/web_express_app.test.js`에 `/api/support-link` 테스트 추가, `npm test`
(371 pass)/`npm run lint`(0 error)/`web-frontend npm run build` 통과, 디스코드 쪽은 컴포넌트
require 스모크 테스트로 버튼 3개/URL 반영 확인. 관련 CLAUDE.md(`managers/`, `quiz_ui/components/`)
+ `docs/TEST_CHECKLIST.md`(3개 항목, 실제 URL 설정 후 실사용 확인 필요해 `[ ]`로 남김) 갱신.

## 2026-08-15 — 지원센터 링크 기능 후속 2건 (헤더 색상 통일 + 신규 서버 환영 메시지)

같은 날 지원센터 링크 기능(위 항목)에 이은 사용자 피드백 2건:

1. **웹 UI 헤더 색상 통일** — "☰ 더보기" 버튼(`.menu-trigger`)이 기존 중립 톤(`--surface-sunken`/
   `--ink-dim`, 사각형)이었던 걸 지원센터 pill(`.support-link`)과 동일한 violet 톤 + pill 모양으로
   맞춤(`styles.css`). 라이트/다크 모드 둘 다 기존 CSS 변수(`--violet`/`--violet-bg`)를 그대로 쓰므로
   추가 분기 없이 적용됨.
2. **`guildCreate` 환영 메시지에 지원센터 버튼 추가** — `bot.js`의 봇이 새 서버에 들어갔을 때 보내는
   안내 메시지(2026-08-12 UI 개선 2라운드 B-1에서 신설된 기능)가 지금까지 텍스트 전용이었는데,
   `SYSTEM_CONFIG.SUPPORT_SERVER_URL`로 연결되는 "❓ 지원센터" Link 버튼(`welcome_support_link_component`,
   `bot.js`에 직접 정의)을 같이 붙임.

검증: `npm test`(371 pass, 회귀 없음)/`npm run lint`(0 error)/`web-frontend npm run build` 통과.
`bot.js`는 알려진 사전 존재 이슈(`select-quiz-type-ui.ts`가 `.js` 확장자로 `.ts` 파일을 require하는
경로라 `ts-node/register` 단독 실행 시 MODULE_NOT_FOUND — `npm test`/실제 `dist/` 빌드 실행 경로에서는
문제 없음, 이 세션 이전부터 있던 무관한 현상)로 직접 require 스모크 테스트는 안 됐고 lint 통과로 문법만
확인. `docs/TEST_CHECKLIST.md`의 관련 항목(헤더 색상, 환영 메시지 버튼)을 `[ ]`로 갱신.

## 2026-08-15 — 헤더 pill 3종 크기/색상 최종 정리 (같은 날 후속)

지원센터 pill(`.support-link`)/"☰ 더보기"(`.menu-trigger`)/테마 토글(`.theme-toggle`) 셋의 높이가
제각각이라 정렬이 안 맞아 보인다는 피드백 — 셋 다 `height: 38px`로 통일(`.theme-toggle`은 컨테이너에
`height:38px`+`padding:4px`, 내부 버튼은 `height:100%`로 남는 공간을 채우는 방식). 색상은
`.menu-trigger`만 이미 `.support-link`와 같은 violet 톤으로 맞춰뒀던 상태 그대로 유지.

## 2026-08-15 — install_quizbot3.sh에 UTF-8 locale 설정 추가

사용자가 GCP 서버에서 `resources/notices/`의 한글 파일명이 `ls`에 물음표로 깨져 보인다고 보고. 원인
조사 결과 `install_quizbot3.sh`에 locale 설정이 아예 없어서, 클라우드 기본 이미지가 non-UTF-8
locale(C/POSIX)로 뜨는 경우 터미널이 UTF-8 파일명을 못 보여주는 것으로 판단(Node.js `fs`는 locale과
무관하게 항상 raw UTF-8로 파일명을 다루므로, 실제 데이터/봇 동작엔 영향 없음 — 순수 표시 문제).
`sudo apt install -y locales` → `locale-gen en_US.UTF-8` → `update-locale LANG=en_US.UTF-8
LC_ALL=en_US.UTF-8` 3줄을 설치 스크립트 초반(패키지 목록 갱신 직후)에 추가. 이전에 설치된 서버는
소급 적용 안 되므로 같은 3줄을 수동 실행하도록 `auto_script/정석 사용법.txt`에 안내 추가. 셸 스크립트라
`bash -n`으로 문법만 검증, 실제 서버 반영은 사용자가 직접 진행 예정.

## 2026-08-15 — `quizbot_update.sh`/`install_quizbot3.sh` 소유권 버그 수정 + 업데이트 스크립트 3건 개선

사용자가 GCP 서버에서 `/quizmgr` 공지 삭제 시도 중 `EACCES: permission denied, unlink` 에러 보고
(git 추적 대상이던 레거시 공지 파일 대상). 원인: `quizbot_update.sh`가 `git fetch`/`reset --hard`/
`npm install`/`npm run build`를 전부 `sudo`(root)로 실행하면서 이후 소유권을 되돌리는 단계가 아예
없었음 — `quizbot3.service`는 `User=ubuntu`로 도는데, 파일이 root 소유로 남아 그 파일을 쓰거나 지우는
동작이 EACCES로 실패. `install_quizbot3.sh`도 같은 문제가 있었음 — 소유권 복원 시도(`chown -R
"$(id -u):$(id -g)"`)가 있긴 했지만, 스크립트 자체가 `sudo bash install_quizbot3.sh`로 통째로 실행되는
전제라 `$(id -u)`가 이미 root(0)를 가리켜 사실상 no-op이었음. 둘 다 `ubuntu:ubuntu`로 하드코딩해서
수정(systemd `User=ubuntu`/cron `-u ubuntu`와 이미 일관된 고정 유저 가정).

같은 세션에서 사용자가 이어서 요청한 `quizbot_update.sh` 개선 3건도 함께 처리:
1. **브랜치 선택권 제공** — develop에서 검증 후 master로 전환해서 운영하는 시나리오 지원. 실행 시
   업데이트할 브랜치를 물어보고(Enter면 현재 브랜치 유지), 다른 브랜치를 입력하면 `git checkout` 후
   그 브랜치의 `origin`으로 reset.
2. **업데이트 후 자동 재시작 제거** — 빌드/설정 확인할 틈 없이 바로 `systemctl restart`되던 걸 없애고,
   완료 메시지에 수동 시작 안내(`quizbot_start.sh` 또는 `systemctl start quizbot3`)만 출력.
3. **`config/system_setting.js` 로컬 커스터마이징 보호** — 이 파일은 `private_config.json`과 달리
   `.gitignore` 대상이 아니라서 `reset --hard`가 그대로 덮어씀 — 서버에서 직접 고친 값(예: 사용자가
   `WEB_SERVER_PORT`를 3000으로 바꾼 것)이 업데이트마다 조용히 원복될 뻔했던 문제. `private_config.json`과
   동일하게 "서버의 현재 값이 항상 우선"으로 취급 — reset 전 `/tmp`에 백업, reset 후 `sudo cp`로 복원
   (일반 `cp`는 reset 직후 root 소유가 된 파일에 쓸 권한이 없어 `sudo` 필요). 트레이드오프: 이 파일에
   새 `SYSTEM_CONFIG` 필드가 추가돼도 자동으로 안 들어오니, 그런 경우는 수동 병합 필요 —
   `auto_script/정석 사용법.txt`/루트 `CLAUDE.md`에 명시.

검증: 셸 스크립트라 `bash -n`으로 문법만 확인, 실제 서버 반영/재검증은 사용자가 직접 진행 예정. 이미
과거에 `quizbot_update.sh`를 돌린 서버는 `sudo chown -R ubuntu:ubuntu <설치 경로>`를 한 번 수동
실행해야 기존에 이미 root 소유가 된 파일들이 정리됨(스크립트 자체 수정은 다음 실행부터만 적용).

## 2026-08-15 — quizmgr에 점검 모드 관리 + 실시간 공지 수정 기능 추가

기존엔 둘 다 서버 파일(`resources/maintenance_notice.txt`/`resources/current_notice.txt`)을 SSH로
직접 만들고 지우거나 편집하는 방식뿐이었음 - `/quizmgr` 관리자 패널에서 처리 가능하도록 신설.

- **점검 모드**: 신규 `AdminMaintenanceUI`(`quiz_ui/admin-maintenance-ui.ts`) - 켜짐/꺼짐 상태를
  색으로 구분해 보여주고(꺼짐: 초록/켜짐: 빨강 + 현재 안내 문구), 꺼짐이면 "켜기"(모달로 문구 입력),
  켜짐이면 "문구 수정"(모달, 기존 값 프리필)/"끄기"(확인 절차 - 파급력이 큰 기능이라 오클릭 방지)
  버튼. 파일 I/O는 신규 `maintenance_mode_manager.ts`(순수 함수 4개)로 분리. 점검 모드가 켜지면
  `bot.js` 전역 핸들러가 관리자 외 전 유저의 인터랙션(슬래시커맨드/버튼/모달 전부)을 막는 강력한
  기능이지만, 관리자 본인은 그 체크를 그대로 통과하므로 점검 모드 중에도 자기 자신을 잠그지 않고
  `/quizmgr`로 계속 끌 수 있음을 확인.
- **실시간 공지 수정**: `resources/current_notice.txt`(공지 게시판(`notices/`)과 무관, `/퀴즈` 최초
  진입 화면에만 노출되는 단일 파일) - 별도 화면 없이 `AdminPanelUI`에서 버튼 → 모달(기존 값 프리필) →
  즉시 저장으로 처리. `notice_manager.ts`에 `readCurrentNotice`/`writeCurrentNotice` 2개 추가.

관리자 패널 컴포넌트를 2번째 `ActionRow`(`admin_panel_row2_comp`)로 확장(기존 1번째 줄 4버튼은
그대로 유지, Discord 버튼 한도 때문에 한 줄에 다 못 넣음).

검증: 신규 `test/managers/maintenance_mode_manager.test.js`(6개) +
`test/managers/notice_manager.test.js`에 3개 추가, `test/quiz_ui/components.test.js` export 개수
69→75 갱신. `npm test`(380 pass)/`npm run lint`(0 error) 통과. `AdminMaintenanceUI`를 실제 인스턴스화해서
꺼짐/켜짐 두 상태의 embed가 올바르게 나오는지 직접 확인(테스트용으로 임시 생성한
`resources/maintenance_notice.txt`는 확인 즉시 삭제). `docs/TEST_CHECKLIST.md`에 두 기능 체크리스트
추가.

## 2026-08-15 — quizbot_update.sh 운영 데이터 보호 범위 확장 + 점검 모드 안내에 지원센터 버튼 추가

사용자가 "봇 업데이트하면 notices의 기본 공지를 계속 다시 받아온다"고 보고 - 관리자가 `/quizmgr`로
지운 레거시 공지 2개가 `git reset --hard` 때마다 되살아나던 문제. 확인해보니 `resources/` 하위에
git으로 추적되면서 봇이 런타임에 직접 쓰는 파일이 예상보다 많았음(`config/system_setting.js`는 이미
전 세션에 보호 완료):

- **`resources/notices/`의 레거시 공지 2개** — `git rm --cached`로 추적에서 완전히 제외(물리 파일은
  그대로 둠). 더 이상 "새 설치 시 기본으로 깔리는 공지"로 취급하지 않기로 함(오래돼 사실상 안 쓰는
  내용) - 관리자가 quizmgr로 지우면 이제 정말로 사라짐.
- **`resources/current_notice.txt`**(quizmgr "실시간 공지 수정"으로 바뀜)/**`resources/banned_user.txt`**
  (`ban_manager.js`가 실시간으로 쓰는 밴 목록) — `config/system_setting.js`와 동일한 백업/복원 방식으로
  보호 대상에 추가. `quizbot_update.sh`의 개별 백업 코드를 `PROTECTED_PATHS` 배열 + 반복문으로
  일반화(파일이 하나 더 늘어도 배열에 경로만 추가하면 되게).
- **판단 기준**: `resources/quizdata/`(공식 퀴즈)·`resources/bgm/`처럼 코드와 함께 실제로 배포돼야 하는
  콘텐츠는 그대로 둠(계속 `git reset --hard`로 갱신되는 게 맞음) - "서버별로 런타임에 바뀌는 운영
  상태"인지 "코드와 함께 버전관리돼야 하는 콘텐츠"인지로 구분. `resources/tagged_dev_quiz_info.json`/
  `resources/version_info.txt`는 런타임 쓰기 경로가 없음을 grep으로 확인 후 보호 대상에서 제외(전자는
  quizdata와 짝을 이루는 정적 설정, 후자는 이미 안 쓰는 죽은 참조).

같은 세션 추가 피드백: 점검 모드 차단 안내 메시지(`bot.js`)에 지원센터 Link 버튼이 없어서, 막힌
유저가 문의할 방법이 안 보였음 - `guildCreate` 환영 메시지 전용이었던 컴포넌트를 `support_link_component`로
개명해 두 곳(환영 메시지/점검 모드 차단 안내)에서 공유하도록 재사용.

검증: 셸 스크립트라 `bash -n`으로 문법만 확인, `bot.js` 변경은 `npm test`(380 pass)/`npm run lint`
(0 error)로 검증(회귀 없음 - 컴포넌트 개명은 참조 2곳만 바꾸는 단순 리네임). 문서(정석 사용법.txt,
루트/managers `CLAUDE.md`, `docs/TEST_CHECKLIST.md`) 갱신. 실제 서버 반영/재검증은 사용자가 직접
진행 예정.

## 2026-08-15 — 스코어보드 시즌 아카이브 + 웹 UI 노출 (`docs/plans/SCOREBOARD_SEASON_PLAN.md`)

사용자 요청: (1) 디스코드 전용이던 순위표(스코어보드)를 웹 UI에서도 볼 수 있게, (2) 과거 시즌
스코어보드도 조회 가능하게. 착수 전 조사에서 "시즌"이 `text_contents.json`의 고정 텍스트
(`scoreboard.season_label`, "[베타 시즌]")일 뿐 실제 데이터 모델이 전혀 없었다는 사실을 발견 -
이 기능 이전 과거 시즌 기록은 복구 불가능함을 사용자에게 알리고, 구조 개선안(신규 DB 테이블로
시즌 종료 시점 스냅샷 아카이빙 + Discord/웹 양쪽 시즌 브라우징 + 관리자 시즌 종료 액션)을 제안,
"둘 다 진행(추천)"으로 스코프 확정.

- **DB 설계**: 핫패스 테이블(`tb_global_scoreboard`, 매 대결 종료마다 갱신)은 건드리지 않고 완전히
  분리된 아카이브 구조 채택 - `tb_scoreboard_season`(시즌 메타)/`tb_global_scoreboard_archive`
  (시즌 종료 시점 `tb_global_scoreboard` 스냅샷, `season_id`+`guild_id` PK). 마이그레이션 프레임워크가
  없어(`RANDOM_QUIZ_PRESET_PLAN.md`와 동일 관행) DDL은 `docs/plans/SCOREBOARD_SEASON_PLAN.md`에 psql로
  수동 실행할 스크립트로 적어두고 `auto_script/db_backup/base.sql`에도 반영 - **사용자가 dev/prod DB에
  직접 실행하기 전까지는 새 함수 4개가 전부 조용히 `undefined`를 반환**(`db_core.sendQuery`의 에러
  흡수 동작 그대로 활용), 상위 계층은 이를 "시즌 없음"으로 취급해 기존 동작(현재 시즌만 표시)으로
  안전하게 폴백함.
- **`db/db_scoreboard.ts`**: `selectSeasonList`/`selectArchivedTop10Scoreboard`/
  `selectArchivedGuildScoreboard`/`endCurrentSeason` 4개 추가. 이 코드베이스에 트랜잭션 헬퍼가 없어
  `endCurrentSeason`은 "시즌 행 INSERT → 스냅샷 INSERT...SELECT → 라이브 테이블 DELETE" 순서로
  진행하고, 스냅샷 단계가 실패하면 방금 만든 시즌 행을 보상 DELETE로 정리하는 애플리케이션 레벨
  보상 패턴(`db_random_quiz_preset.ts`의 기존 관행)을 그대로 적용.
- **`managers/scoreboard_season_manager.ts`**(신규): 현재 시즌 이름을 `resources/current_season_name.txt`
  (재배포 없이 quizmgr에서 바로 수정, `current_notice.txt`/`maintenance_notice.txt`와 동일 패턴)로
  관리. `endSeasonAndStartNew`는 "시즌 종료" 버튼 한 번으로 아카이빙+새 이름 저장을 묶어서 처리(실패
  시 파일은 안 건드림).
- **디스코드 `ScoreboardUI`**: `selectSeasonList()`로 종료된 시즌 목록을 불러와 StringSelectMenu
  ("현재 시즌"+최대 24개 과거 시즌)를 추가, 과거 시즌 선택 시 아카이브 스냅샷을 보여줌. 시즌 목록이
  비어있으면(DDL 미실행 포함) 기존과 동일한 뒤로가기만 있는 화면으로 폴백.
- **quizmgr `AdminSeasonUI`**(신규, 관리자 패널 2번째 줄 3번째 버튼): 현재 시즌 이름 + 종료된 시즌
  개수 표시, "시즌 종료 및 새 시즌 시작" 버튼 → 확인 절차(2버튼) → 모달로 새 시즌 이름 입력 →
  `endSeasonAndStartNew` 호출.
- **웹 UI**: `web_express_app.ts`에 `GET /api/scoreboard`(쿼리 `season_id` 유무로 현재/과거 분기)/
  `GET /api/scoreboard/seasons` 2개 라우트 추가(`requireGuildScopedSession`). 신규
  `web-frontend/src/ScoreboardPanel.jsx` + `App.jsx`의 "☰ 더보기" 메뉴에 "🎖 순위표" 항목 추가(기존
  3항목 → 4항목).

검증: 신규 `test/managers/scoreboard_season_manager.test.js`(5개) + `test/managers/db_manager.test.js`에
6개 추가(export 개수 41→45), `test/quiz_ui/components.test.js` export 개수 75→78 갱신. `npm test`
(391 pass)/`npm run lint`(0 error)/`web-frontend`의 `npm run build` 통과. `docs/TEST_CHECKLIST.md`에
AF섹션 신설(디스코드/웹/quizmgr 3갈래 체크리스트), 관련 `CLAUDE.md` 4개(`managers/`, `managers/db/`,
`quiz_ui/`, `quiz_ui/components/`) 갱신. **DDL 미실행 상태 실사용 미검증** - 사용자가 dev DB에 DDL을
먼저 적용해야 시즌 아카이브 관련 화면들을 실제로 테스트할 수 있음.

## 2026-08-15 — (같은 날 후속) 시즌 관리 모달 크래시 수정 + TOP10 → TOP50 확장

바로 위 스코어보드 시즌 기능을 실서버에서 켜본 사용자가 두 가지를 발견/요청:

- **버그**: quizmgr "시즌 관리" → "시즌 종료" → 새 시즌 이름 모달 제출 시 `new_ui.onReady is not a
  function`으로 봇이 죽음. 원인은 `admin-season-ui.ts`의 `handleNewSeasonName`이 DB 호출 때문에
  `async` 함수인데 `onInteractionCreate`가 `return this.handleNewSeasonName(interaction)`으로 그
  결과(Promise)를 그대로 반환했던 것 — UI 프레임워크는 `onInteractionCreate`가 새 UI 인스턴스 또는
  `undefined`를 반환한다고 가정하는데, Promise가 넘어가자 `appendNewUI`가 그걸 새 화면으로 착각해
  `.onReady()`를 호출하려다 크래시. 다른 async 모달 핸들러들과 동일하게 fire-and-forget으로 호출만
  하고 `onInteractionCreate`는 `undefined`를 반환하도록 수정(1줄).
- **TOP10 → TOP50 확장**: `db_scoreboard.ts`의 `selectTop10Scoreboard`/`selectArchivedTop10Scoreboard`를
  `selectTop50Scoreboard`/`selectArchivedTop50Scoreboard`로 개명 + `LIMIT 10`→`LIMIT 50`. 웹
  (`ScoreboardPanel.jsx`)은 이미 배열을 그대로 렌더링하던 구조라 코드 변경 없이 `.scoreboard-list`에
  `max-height`+`overflow-y: auto`만 추가해서 스크롤 목록으로 대응. 디스코드(`scoreboard-ui.ts`)는 embed
  하나에 50줄을 다 못 넣어 자체 페이지네이션(10개씩, `scoreboard_top_prev`/`scoreboard_top_next` 버튼,
  경계에서 `.setDisabled()`)을 신설 — 이미 한 번에 50개를 로드해둔 배열을 페이지 전환 시 슬라이스만
  하므로 DB 재조회 없음. `QuizBotControlComponentUI`(번호 select 버튼 포함, 선택 가능한 목록 전용)는
  이 화면(클릭 불가 순수 표시용 랭킹)엔 안 맞아 채택하지 않고 최소한의 자체 로직만 추가. 4위부터
  쓰던 `ICON_NUM_` 텍스트 이모지(0~10까지만 존재)는 TOP50엔 애초에 못 써서 평범한 `"N)"` 숫자로 통일.

부수적으로 발견한 이슈(수정은 보류, 사용자에게 사실만 보고): 이 코드베이스의 관리자/파괴적 액션
로깅이 파일마다 들쭉날쭉함 — `ban_manager.ts`류 오래된 매니저는 액션마다 로깅하지만, 오늘 새로 만든
`notice_manager.ts`/`maintenance_mode_manager.ts`/`scoreboard_season_manager.ts`는 애초에 `logger`
import가 없어 완전히 무음. 명문화된 로깅 정책 문서도 없음 — 전체 감사는 범위가 커서 별도 논의로 분리.

검증: `test/managers/db_manager.test.js`에 함수 개명 반영 + `selectTop50Scoreboard` 테스트 1개 추가
(392 pass), `npm run lint`(0 error), 루트+`web-frontend` 양쪽 `npm run build` 통과, `ScoreboardUI`
페이지네이션 로직은 `node -e` 스모크 테스트로 경계값(11개/37개 데이터, 4페이지 시작 랭크 등) 직접
확인. `docs/TEST_CHECKLIST.md` AF섹션에 TOP50/페이지네이션 체크리스트 추가, 관련 `CLAUDE.md` 3개
(`managers/`, `managers/db/`, `quiz_ui/`) 갱신.

## 2026-08-15 — 웹 UI 기본 탭 변경 + yt-dlp Python 3.11 요구사항 대응

사용자 피드백 2건, 서로 무관한 소규모 수정:

- **웹 UI 기본 탭**: `/퀴즈` → "웹 UI" 선택 시 뜨는 첫 탭이 "공식 퀴즈"였는데 "유저 퀴즈"부터 보이게
  해달라는 요청 — `select-ui-mode-ui.ts`의 `new WebHandoffUI('dev', interaction)`을
  `new WebHandoffUI('user', interaction)`으로 1줄 변경. `mode`는 세션 생성 시 초기 탭 값일 뿐(웹
  프론트엔드에서 탭을 자유롭게 오갈 수 있음, 세션 자체엔 고정 안 됨) 다른 어떤 로직도 이 값에
  의존하지 않는 걸 확인하고 안전하게 변경.
- **yt-dlp Python 버전 문제**: yt-dlp 최신 버전이 Python 3.11+를 요구하는데, Ubuntu 22.04 기본
  python3는 3.10이라 노래 퀴즈가 아예 안 되는 문제 발견. 근본 원인은
  `auto_script/server_script/update_yt-dlp.sh`가 받던 GitHub 릴리즈 자산 "yt-dlp"가 시스템 python3를
  shebang으로 호출하는 zipapp이었던 것 — standalone 바이너리 자산 "yt-dlp_linux"(PyInstaller로 만든
  자체 Python 런타임 내장 빌드)로 다운로드 대상을 바꿔서 시스템 python3 버전과 완전히 무관하게 만듦
  (저장 파일명은 그대로 "yt-dlp"라 다른 코드 변경 불필요). 부수적으로 `quizbot_update.sh`가
  `npm install` 직후 `youtube-dl-exec` 자체 postinstall이 이 python 의존 버전을 다시 받아써서
  되돌려놓는 걸 발견 — `npm install` 다음 줄에 `update_yt-dlp.sh` 재호출을 추가해 매번 즉시 재보정하게
  함(이전엔 다음 9시/21시 크론까지 최대 12시간 방치됐음).

검증: `select-ui-mode-ui.ts` 변경은 `npm test`(392 pass)/`npm run lint`(0 error)/`npm run build`로
확인(UI 클래스라 관례상 유닛테스트 대상 아님). 셸 스크립트 2개는 `bash -n`으로 문법만 확인 — 실제
서버 반영/재검증(다운로드된 바이너리가 실제로 python 없이 동작하는지)은 사용자가 직접 진행 예정.
`quizbot/quiz_ui/CLAUDE.md`/`auto_script/정석 사용법.txt` 갱신.

## 2026-08-18 — 퀴즈함 관리+프리셋 UI 신설(오마카세 한정) + 계획서 2건

사용자 요청: 웹 UI엔 이미 있는 프리셋(저장/불러오기/삭제) 기능을 디스코드에도 추가, 겸사겸사 퀴즈함
표시 한도도 25→50개로 확장. 설계 중 메인 화면(`OmakaseQuizRoomUI`)의 컴포넌트 행 예산이 5/5로 꽉 차는
문제를 발견해, 퀴즈함 관련 기능 전체를 독립 ephemeral 화면으로 분리하는 방향으로 재설계(사용자 결정) —
`docs/plans/QUIZ_BASKET_PRESET_UI_PLAN.md`에 계획서 작성 후 다음 세션에 구현.

- **`basket-manage-flow.ts`**(신규) — `QuizbotUI`/`UIHolder`를 상속하지 않는 독립 ephemeral 화면.
  `admin-panel-ui.ts`의 `report_manual_processing.sendReportLog`(호출만 하고 자체적으로 응답 처리)와
  같은 계열 패턴을 처음으로 명시적인 재사용 모듈로 확립 — `interaction.reply()`로 최초 응답을 만들고
  이후 컴포넌트는 `interaction.update()`(discord.js가 제공하는, 그 컴포넌트가 속한 메시지 자체를
  편집하는 API, `quiz_ui/` 전체에서 이 파일이 처음 씀)로 자기 자신만 갱신. `OmakaseQuizRoomUI.
  onInteractionCreate`는 `isBasketManageEvent`/`handleBasketManageEvent`로 위임만 하고 화면 전환을
  전혀 안 함 — `handleBasketManageEvent`는 내부 핸들러가 async여도 항상 `undefined`를 동기 반환하도록
  설계(2026-08-15 `admin-season-ui.ts`에서 실제로 겪은 "async 핸들러가 Promise를 그대로 반환해서
  프레임워크가 새 화면으로 오인해 크래시" 버그와 동일 함정을 의도적으로 피함 - 이번엔 처음부터 이
  패턴으로 설계해서 재발 안 함). 메인 화면과 완전히 독립된 메시지라 퀴즈함이 바뀔 때마다
  `room_ui.refreshUI()`+`room_ui.update()`를 명시적으로 호출해 동기화(설계 중 발견한 핵심 함정).
- **퀴즈함 50개 확장**: `UserQuizSelectUI` 생성자에 `max_basket_size` 파라미터 추가(기본값 25 유지),
  오마카세 호출부만 50을 명시적으로 넘김. 표시 select는 25개 넘으면 2행으로 분할(Discord API가 select
  menu 하나당 25개 하드캡이라).
- **프리셋 기능**: `db_random_quiz_preset.ts`(2026-08-13, 원래 웹 전용)가 순수 `user_id` 파라미터라
  수정 없이 그대로 재사용됨 — 웹에서 만든 프리셋을 디스코드에서 불러오거나 반대도 정상 동작(유저 단위
  저장이라 설계 의도 그대로). 신규 `db_quiz.ts`의 `selectQuizInfoByIds`는 프리셋의 quiz_id 목록을
  제목과 함께 조회 - `selectRandomQuestionListByBasket`과 동일한 `ANY($1::int[])` 패턴, 삭제/비공개
  전환된 항목은 자동으로 빠지고 그 차이로 "N개 제외됨" 안내. 저장 시 이름 길이(30자)/중복/10개 한도는
  웹(`web_express_app.ts`)과 동일 기준.
- **범위를 오마카세로 한정한 이유**: 구현 착수 전 `multiplayer-quiz-lobby-ui.js`도 동일한 `BASKET_CACHE`
  로직을 별도로 복사해서 쓰고 있고, 바구니 변경 시 IPC 브로드캐스트(`sendEditLobbySignal`)까지
  필요해서 오마카세보다 위험하다는 걸 발견 — 사용자와 상의해 오마카세만 먼저 진행, 멀티플레이는 별도
  작업으로 명시적으로 미룸. `QuizInfoUI.BASKET_CACHE` static 필드는 완전 제거하지 않고 유지(멀티플레이가
  계속 read/write) — 오마카세 쪽 read/write(2곳: `omakase-quiz-room-ui.ts`의 `handleLoadBasketItems`,
  `web-handoff-ui.ts`의 `buildOmakaseQuizInfoUI`)만 제거. 공유 컴포넌트 `request_basket_reopen_comp`도
  그대로 두고(멀티플레이가 계속 씀) 오마카세 전용으로 `omakase_basket_manage_open_comp`를 새로 만듦 -
  공유 싱글턴을 직접 고쳤으면 멀티플레이 쪽 버튼까지 같이 깨졌을 지점.
- **`docs/plans/DISCORD_UI_SEPARATION_AUDIT_PLAN.md`**(같은 날 신규, 방법론만) — 이번에 확립한 "독립
  ephemeral 화면 분리" 패턴을 다른 화면에도 적용할 만한지 전수 점검하기 위한 계획서. 실제 순회/판정은
  미착수, 기존 `quiz_ui/CLAUDE.md`에 이미 "복잡하다"고 적혀있던 화면들(`multiplayer-quiz-lobby-ui.js`
  등) 위주로 1차 예비 후보만 정리해둠.

검증: 신규 `test/quiz_ui/basket_manage_flow.test.js`(3개, `handleBasketManageEvent`가 절대 Promise를
반환하지 않는다는 계약 집중 검증) + `test/managers/db_manager.test.js`에 `selectQuizInfoByIds` 테스트
1개 추가(46개 export). `test/quiz_ui/omakase_web_apply.test.js`의 기존 `BASKET_CACHE` 갱신 검증
2건은 이번 변경으로 더 이상 유효하지 않아 제거(제거된 동작 자체를 검증하던 테스트라 남겨두면 항상
실패함). `test/quiz_ui/components.test.js` export 개수 78→80. `npm test`(396 pass)/`npm run lint`
(0 error)/`npx tsc --noEmit`(0 error) 통과. 컴포넌트 행 예산(30개 담기+프리셋 선택 시 최대 5/5행)과
"항목 제거 시 메인 화면 동기화" 두 핵심 지점은 `node -e` 스모크 테스트로 직접 확인. 관련 `CLAUDE.md`
3개(`quiz_ui/`, `quiz_ui/components/`, `managers/db/`) 갱신, `docs/TEST_CHECKLIST.md` AG섹션 신설.
**실사용(실제 Discord+DB) 미검증** — 사용자가 직접 봇으로 확인 예정.

## 2026-08-18 — (같은 날 후속) 퀴즈함 관리+프리셋에 방장 권한 모델 + 프리셋 편집(이름변경/항목제거) 추가

바로 위 기능을 사용자가 리뷰하며 더 구체적인 플로우를 요청 — 실제 작업 전 확인 요청에 따라 전체
플로우를 재확인받고 진행:

- **권한 모델 신설**: 라이브 퀴즈함(공유 상태)을 건드리는 액션(항목 제거/저장/불러오기)은 이제
  `quiz_info.room_owner`(방장)만 가능 — 이전 버전은 아무나 제거/저장/불러오기가 가능했던 게 실제
  버그성 허점이었음(공유 채널 메시지라 아무나 클릭 가능). 방장이 아니면 항목 select가
  `.setDisabled(true)`로 뜨고 "🔒 방장만..." 안내 + "📋 프리셋 관리" 버튼만 보임. "프리셋 관리"는
  라이브 상태와 무관한 순수 개인 기능이라 방장 여부 무관하게 허용. 방장이 항목을 지워도 이미
  열려있는 다른 사람의 조회 화면엔 실시간 반영 안 함(설계 확정 - ephemeral 특성상 자연스러움, 새로
  열면 최신 상태로 보임).
- **"프리셋 관리" 화면 신설**(기존엔 "불러오기"/"삭제"만 있었음): 내 프리셋 목록 선택 → 같은 화면이
  그 프리셋의 항목 목록으로 in-place 갱신 → 항목 선택 시 **저장된 프리셋에서만** 제거(라이브
  퀴즈함과 무관) → 프리셋 이름 변경(모달, 현재 이름 프리필)/전체 삭제(2단계 확인)도 이 화면에서.
  "불러오기"는 별도의 더 단순한 화면으로 분리(내 프리셋 목록 → 선택 즉시 라이브 퀴즈함에 로드).
- **신규 DB 함수 2개**(`db_random_quiz_preset.ts`): `updateRandomQuizPresetName`(이름 변경),
  `deleteRandomQuizPresetItem`(프리셋에서 항목 하나만 제거, `tb_random_quiz_preset_item`에
  `user_id`가 없어 `tb_random_quiz_preset`과 `USING` 조인으로 소유권 강제) — **둘 다 웹 UI엔 아직
  없는 기능**(웹은 저장/불러오기/전체삭제 3개뿐), 디스코드가 먼저 갖게 됨.
- **행 예산 재검토**: 프리셋 자체는 웹에서 최대 100개까지 저장 가능(라이브 퀴즈함 한도 50보다 큼) -
  "프리셋 관리" 화면에서 항목 제거 UI가 select 2행(최대 50개) 예산을 넘을 수 있다는 걸 설계 중 발견,
  앞 50개만 표시하고 넘으면 "웹 UI를 이용해주세요" 안내로 대응(행 예산 초과 방지, 사용자가 애초에
  원했던 "웹에서 편집하면 더 편해요" 멘트와 자연스럽게 맞물림).
- **버그 하나 자체 발견/수정**: 리팩터 중 `OmakaseQuizRoomUI.onInteractionCreate`가 새 모달 제출
  customId(`modal_basket_preset_save`/`modal_basket_preset_rename:*`)를 안 걸러내서 모달 제출이
  조용히 무시되는 걸 타이핑 중 발견 - `isBasketManageEvent`(버튼/셀렉트, `basket_manage_` 접두사)와
  별도로 `isBasketManageModalEvent`(모달, `modal_basket_preset_` 접두사) 체크를 추가해서 수정.

검증: `test/quiz_ui/basket_manage_flow.test.js`에 4개 추가(host 권한 분기, 비-host 프리셋관리 접근
허용, modal 이벤트 판별) — 기존 3개와 합쳐 7개. `test/managers/db_manager.test.js`에 신규 함수 2개
테스트 추가(export 개수 46→48). `npm test`(402 pass)/`npm run lint`(0 error)/`npx tsc --noEmit`
(0 error) 통과. 프리셋 상세 화면 렌더링(customId에 preset_id 인코딩, 이름 prefill, 항목 제거)은
`node -e`로 실제 discord.js 빌더 호출까지 스모크 테스트. 관련 `CLAUDE.md` 2개(`quiz_ui/`,
`managers/db/`) 갱신, `docs/TEST_CHECKLIST.md` AG섹션 전면 갱신(방장 권한 분기 + 프리셋 관리 세부
플로우 체크리스트 추가). **실사용 미검증** — 사용자가 직접 봇으로 확인 예정.

## 2026-08-18 — (같은 날 네 번째 후속) 프리셋 관리 페이지네이션(100개 지원) + 실사용 버그 2건 수정

### 프리셋 관리 페이지네이션으로 100개까지 지원

사용자가 "이 페이지네이션 방식을 쓰면 프리셋 최대 100개(웹 상한)도 디스코드에서 다 지원되지 않냐"고
제안 — 기존엔 select 2행(최대 50개)에 다 안 들어가면 "웹 UI를 이용해주세요"로 안내만 하고 앞 50개로
잘랐었는데, `scoreboard-ui.ts`의 TOP50 페이지네이션과 동일한 패턴(select 1행 + prev/next 버튼 1행,
25개씩 페이지 이동)으로 교체 — 이제 상한 없이 전부 디스코드에서 편집 가능. 페이지 번호도 다른 상태
값들과 동일하게 customId에 인코딩(`basket_manage_manage_item_select:${preset_id}:${page}`,
`basket_manage_manage_page_prev/next:${preset_id}:${page}`)해서 무상태 유지, 항목 제거 후 같은
페이지에 머무르되(`Math.min(Math.max(page,0), total_pages-1)`로 clamp) 마지막 페이지가 통째로 비면
자동으로 이전 페이지로 보정됨. 이름변경/삭제 요청도 페이지 번호를 같이 실어 날라서, 완료 후 원래
보던 페이지로 정확히 돌아가게 함.

### 실사용 중 발견한 버그 2건

사용자가 실제 봇으로 "불러오기"/"프리셋 관리" 버튼을 눌러보고 바로 2건을 리포트:

1. **`DiscordAPIError[40060]: Interaction has already been acknowledged`** — `renderPresetLoadList`
   등 DB 조회가 필요한 여러 핸들러가 `interaction.explicit_replied = true`를 **첫 `await` 이후에나**
   설정하고 있었음. `handleBasketManageEvent`가 이 async 핸들러들을 fire-and-forget으로 호출하고
   나면(Promise를 그대로 반환하면 안 되니까) `onInteractionCreate` 체인이 곧바로 `undefined`를 반환하며
   빠져나가는데, 그 시점에 `bot.js` 전역 fallback이 `!interaction.explicit_replied`를 보고 먼저
   `deferUpdate()`를 불러버림 — DB 조회가 끝나고 핸들러가 뒤늦게 진짜 `interaction.update()`를 부르면
   이미 응답된 인터랙션이라 40060 에러. **`user-question-info-ui.ts`의 `duplicateQuestion`에 이미
   문서화돼 있던 것과 정확히 같은 함정**("첫 줄에서 설정할 것, await 이후로 미루면 안 됨")인데 이번에
   새로 만든 핸들러 8개 중 다수에서 놓쳤던 것 — `basket-manage-flow.ts`의 async 핸들러 전부를 다시
   훑어서 `interaction.explicit_replied = true`를 예외 없이 각 함수의 첫 줄(첫 `await` 이전)로 이동.
2. **방장이 아닌 유저가 "🧺 퀴즈함 보기"를 누르면 "해당 UI를 생성한 OOO님만이 조작할 수 있어요"로
   막힘** — `bot.js`에 이번에 처음 발견한, 훨씬 근본적인 게이트가 있었음: PUBLIC UI(길드 채널)에서는
   `uiHolder.getOwnerId()`(그 UI를 만든 사람)가 아니면 `uiHolder.on(...)`을 아예 호출하지 않고 화면
   코드에 도달하기도 전에 막아버리는 전역 로직이 원래부터 있었음(예외는 멀티플레이 로비뿐). 이번
   기능은 "방장 외 다른 유저도 참여 가능"하게 설계했는데 이 게이트를 전혀 몰랐던 게 진짜 설계
   미스였음 — 사용자가 "이 버튼만 예외 둘지, 예외 버튼 목록을 만들지" 제안, 후자로 결정.
   `bot.js`에 `PUBLIC_UI_OWNER_CHECK_EXEMPT_PREFIXES`(customId 접두사 화이트리스트) +
   `isExemptFromPublicUIOwnerCheck` 헬퍼를 신설해서 게이트 조건에 추가 — `basket_manage_`/
   `modal_basket_preset_` 접두사는 소유자가 아니어도 화면 진입 자체는 통과시키고, 세부 권한(방장만
   가능한 액션)은 여전히 `basket-manage-flow.ts` 내부의 `room_owner` 체크가 책임짐. 앞으로 PUBLIC UI
   안에 "소유자 아닌 사람도 눌러야 하는 버튼"을 또 만들면 이 화이트리스트에 추가해야 한다는 걸
   `quiz_ui/CLAUDE.md`에 명시해둠(다음에 또 놓치지 않도록).

검증: `test/quiz_ui/basket_manage_flow.test.js`에 2개 추가(100개 프리셋 4페이지 페이지네이션 경계값,
"DB 조회 완료 전에 이미 explicit_replied가 설정돼 있는지"를 직접 검증하는 회귀 테스트 — 두 번째는
방금 겪은 사고를 그대로 재현하는 테스트라 앞으로 같은 실수를 하면 바로 잡힘) — 기존 7개와 합쳐 9개.
`npm test`(404 pass)/`npm run lint`(0 error)/`npx tsc --noEmit`(0 error) 통과. `bot.js`는 관례상
유닛테스트 대상이 아니라(Discord Client 연결 등 부수효과) 코드 리뷰로만 검증. 관련 `CLAUDE.md`
(`quiz_ui/`) 갱신, `docs/TEST_CHECKLIST.md` AG섹션 갱신(페이지네이션 체크리스트로 50개 상한 항목
교체). **`bot.js`의 실제 동작(권한 게이트 우회)은 여전히 실사용 검증 필요** — 이번엔 사용자가 실제로
겪은 에러를 재현/수정한 것이라 이전보다 신뢰도는 높지만, 두 버그 다 실제 Discord로 다시 확인 권장.

### 같은 날 다섯 번째 후속 — 방장 권한 모델 재조정(실사용 확인 중 발견)

위 두 버그를 고친 뒤 사용자가 직접 다시 확인하다가 권한 모델 자체의 세부 조정이 필요함을 발견:

1. 방장이 아닌 사람이 "🧺 퀴즈함 보기"에 정상 진입은 하게 됐지만(바로 위 버그 수정 덕분), 항목
   select가 `.setDisabled(true)`로 떠서 **드롭다운을 열어볼 수조차 없어 조회마저 막혀있었음** —
   원래(이 기능이 생기기 전)는 방장이 아니어도 목록 조회는 가능했던 동작인데, 최초 설계 때
   "방장만 제거 가능"을 구현하면서 select 자체를 비활성화해버려 조회 기능이 같이 죽어버린 게
   설계 실수였음. `buildItemSelectRows`에서 `.setDisabled()` 호출을 제거해 방장이 아니어도 항상
   select를 열어볼 수 있게 하고, 대신 실제로 항목을 선택해서 제출하면(`handleBasketManageEvent`의
   `basket_manage_item_select_*` 분기) `is_host`가 아닐 때 제거 대신 "🔒 퀴즈함에서 제거하는 건
   방장만 할 수 있어요" 안내만 띄우고 원래 화면으로 되돌리도록 수정.
2. "현재 퀴즈함을 프리셋으로 저장"도 방장이 아니어도 가능해야 한다는 요청 — 저장은 라이브
   퀴즈함을 읽기만 할 뿐 공유 상태를 전혀 바꾸지 않으므로, 굳이 방장 전용으로 막을 이유가 없었음.
   `basket_manage_save_request`/`modal_basket_preset_save` 두 분기의 `if(is_host)` 게이트를
   제거하고, `handleSaveSubmit`이 메인 화면으로 복귀할 때 쓰던 하드코딩된 `true`(항상 방장인 것처럼
   렌더링하던 버그 — 방장이 아닌 사람이 저장하면 불러오기 버튼까지 잘못 보이게 됐을 것)도
   `interaction.user.id === room_ui.quiz_info['room_owner']`로 다시 계산하도록 수정.
   `buildMainViewPayload`도 버튼 구성을 "저장(항상)+불러오기(방장만)+관리(항상)"로 재조립.

최종 권한 모델: 라이브 퀴즈함을 실제로 "바꾸는" 액션(항목 제거, 불러오기 — 통째로 덮어씀)만 방장
전용이고, 조회/저장/프리셋 관리는 전부 방장 여부 무관.

검증: `test/quiz_ui/basket_manage_flow.test.js`의 기존 "방장이 아니면 제거를 무시한다" 테스트를
"제거는 안 되지만 안내와 함께 원래 화면으로 돌아온다"로 갱신하고, "방장이 아니어도 프리셋 저장이
가능하다" 테스트를 신규 추가 — 9개→10개(정확히는 교체 1 + 신규 1). `npm test`(405 pass)/
`npm run lint`(0 error)/`npx tsc --noEmit`(0 error)/`npm run build` 전부 통과. `docs/TEST_CHECKLIST.md`
AG섹션의 메인 화면 진입 체크리스트를 새 권한 모델에 맞게 갱신, `quiz_ui/CLAUDE.md`의 권한 모델
설명도 갱신. **실사용 재확인 권장** — 사용자가 실사용 중 순차적으로 발견한 피드백을 반영한 것이라
로직상으로는 이전보다 신뢰도가 높지만, 실제 Discord에서 방장/비방장 두 계정으로 직접 확인 필요.

## 2026-08-19 — 퀴즈함 관리+프리셋 UI 멀티플레이 로비 이식

오마카세(`OmakaseQuizRoomUI`)에만 있던 퀴즈함 관리+프리셋 UI(`basket-manage-flow.ts`)를 멀티플레이
로비(`MultiplayerQuizLobbyUI`)까지 이식 — 코드 중복 없이 `basket-manage-flow.ts`를 두 화면이 그대로
공용(room_ui 인자 자리에 둘 중 아무 인스턴스나 넘겨도 동작). 사용자가 사전에 지적한 구조적 차이 3가지를
전부 반영해서 설계:

1. **권한 모델이 오마카세보다 한 단계 더 필요함** — 멀티플레이는 로비를 만든 "호스트 길드"와 나중에
   참가만 한 "참가 길드"가 길드별로 별도 `MultiplayerQuizLobbyUI` 인스턴스를 가짐(`this.readonly`:
   호스트=false, 참가=true). `room_owner`(방장 멤버 id) 비교만으론 "방장 본인이 다른 서버(참가
   길드)에도 속해 있어서 그 서버로 참가했을 때도 조작 권한이 생겨버리는" 구멍이 생겨서, `is_host`
   판별을 `interaction.user.id === room_owner && room_ui.readonly !== true` 두 조건 AND로 강화 —
   오마카세는 `readonly`가 항상 `false`라 기존 동작 그대로 유지됨.
2. **상태 동기화가 IPC 브로드캐스트 기반** — 오마카세는 로컬 화면만 갱신하면 되지만, 멀티플레이는
   참가 길드 전체에 화면이 복제돼 있어서 항목 제거/불러오기 후 `room_ui.sendEditLobbySignal()`로
   `CLIENT_SIGNAL.EDIT_LOBBY` 신호를 브로드캐스트해야 다른 길드 화면도 같이 갱신됨. `syncRoomUI(room_ui)`
   헬퍼를 신설해 `room_ui.sendEditLobbySignal`이 있으면(duck typing, `MultiplayerQuizLobbyUI`만 가짐)
   그쪽으로, 없으면(오마카세) 기존 로컬 `refreshUI()`+`update()`로 분기.
3. **컴포넌트 행 예산 압축이 필수** — 멀티플레이 호스트 로비는 이미 컴포넌트 5행이 꽉 차 있어서,
   기존 "바구니 select+최근 퀴즈함으로 덮어쓰기"(2행)를 오마카세와 동일하게 "🧺 퀴즈함 보기" 등
   버튼 1행으로 압축(`multiplayer_basket_manage_open_comp`, 호스트 전용 2버튼 "퀴즈함에 퀴즈 더
   담기"+"🧺 퀴즈함 보기"). 참가 길드는 항목 추가/제거 권한이 없어 조회+프리셋 저장/관리만 가능하므로
   "🧺 퀴즈함 보기" 1버튼만(`multiplayer_basket_view_comp`) — 기존 자체 읽기전용 뷰어를 대체.

이식으로 구 메커니즘(`BASKET_CACHE`, `basket_select_component`, `setupBasketSelectMenu`,
`handleBasketSelected`, `handleLoadBasketItems`, `request_basket_reopen_comp`,
`omakase_basket_readonly_select_menu`/`omakase_basket_select_menu`/`omakase_basket_select_row`)의
마지막 소비처(멀티플레이)가 사라져 전부 완전히 삭제(원문은 `docs/archive/DEPRECATED_CODE_REMOVED.md`
보존) — 오마카세는 2026-08-18에 이미 뗐었고, 그땐 멀티플레이가 유일한 남은 소비처라 남겨뒀던 것.
멀티플레이 담기 상한(`UserQuizSelectUI`의 `max_basket_size`)은 이번 이식 범위 밖이라 25개 그대로
유지(오마카세만 50 — 사용자가 요청한 적 없어 스코프 확대 안 함, 필요하면 추후 오마카세와 동일하게
호출부에서 50을 넘기기만 하면 됨).

검증: `test/quiz_ui/basket_manage_flow.test.js`에 2개 추가 — (1) room_owner가 같아도 참가 길드
(`readonly:true`)면 제거를 막는 회귀 테스트(사용자가 직접 지적한 시나리오를 그대로 재현), (2)
`sendEditLobbySignal`을 가진 room_ui(멀티플레이)에서는 로컬 `refreshUI`/`update` 대신 그쪽으로
브로드캐스트하는지 검증 — 기존 10개와 합쳐 12개. `test/quiz_ui/components.test.js`의 export 개수
회귀 테스트를 80→78로 갱신(4개 삭제+2개 신설). `npm test`(407 pass)/`npm run lint`(0 error, 기존
57개 warning 유지)/`npx tsc --noEmit`(0 error)/`npm run build` 전부 통과. `dist/` 컴파일 산출물로
`multiplayer-quiz-lobby-ui.js`/`omakase-quiz-room-ui.js`/`basket-manage-flow.js`/`components.js`를
직접 require해 신규 컴포넌트 존재 + 구 컴포넌트 완전 제거를 스모크 확인. 관련 `CLAUDE.md` 3개
(`quiz_ui/`, `quiz_ui/components/`) 갱신, `docs/TEST_CHECKLIST.md` AG섹션에 멀티플레이 전용
체크리스트 신설(호스트/참가 길드 권한 분기, "같은 계정으로 참가 길드 참가" 핵심 회귀 시나리오, IPC
브로드캐스트 동기화). **실사용 전혀 미검증** — 특히 "같은 계정으로 참가 길드에서도 참가했을 때 권한이
안 생기는지"와 "호스트의 변경이 참가 길드 화면에 실시간 반영되는지" 두 가지는 실제 멀티 서버 환경
에서만 확인 가능한 지점이라 반드시 실사용 테스트 필요.

## 2026-08-19 — (같은 날 후속) 퀴즈함 100개로 재확장 + 실사용 피드백 3건

바로 위 멀티플레이 이식 직후 사용자 피드백 반영:

1. **퀴즈함 담기 상한 50→100 (오마카세+멀티플레이 둘 다)**: "페이지네이션 없이도 100개 정도는 UI상
   문제없지 않냐"는 사용자 제안 확인 후 적용. `basket-manage-flow.ts`의 메인 화면(`buildItemSelectRows`)
   은 이미 25개씩 select를 필요한 만큼 나눠 그리는 구조라 로직 변경은 불필요 — `OMAKASE_MAX_BASKET_SIZE`
   (50→100)/신설 `MULTIPLAYER_MAX_BASKET_SIZE`(100, 멀티는 기존 기본값 25였던 걸 명시적으로 100으로)
   두 상수만 올리면 끝. 단 100개면 select 4행+버튼 1행=정확히 Discord 5행 한도를 다 쓰게 돼 여유가
   없어짐 — 사용자가 "지금은 페이지네이션 안 해도 된다, 나중에 버튼 행이 부족해지면 그때 프리셋 관리
   화면과 동일한 prev/next 페이지네이션으로 바꾸면 된다"고 확인해 그 방향으로 결정, 코드에 근거를
   주석으로 남겨둠(`basket-manage-flow.ts`/`omakase-quiz-room-ui.ts`/`multiplayer-quiz-lobby-ui.js`
   상단).
2. **웹 UI의 "디스코드는 25개까지만 지원" 안내 문구 제거**: 위 확장으로 이제 사실이 아니게 돼서
   `OmakaseTab.jsx`/`MultiplayerTab.jsx`의 `qd-limit-badge`/`qd-limit-note`(25개 초과 시 노출되던
   배지+안내문)를 완전히 제거, 사용처가 없어진 관련 CSS(`styles.css`의 `.qd-limit-note`/
   `.qd-limit-badge`)도 같이 정리.
3. **프리셋 삭제 확인 화면에 프리셋 이름 표시**: 기존엔 "정말 이 프리셋을 삭제하시겠어요?"만 떠서
   뭘 지우는지 확인이 안 됐음 — `handleManageDeleteRequest`가 (이름변경 요청 핸들러와 동일한 패턴으로)
   DB를 재조회해 `"${preset_name}" 프리셋을 정말 삭제하시겠어요?`로 이름을 채워 넣도록 수정(동기
   함수였던 걸 async로 바꾸고 `interaction.explicit_replied = true`를 첫 `await` 이전으로 배치 — 이
   파일의 다른 async 핸들러들과 동일 규칙).

방장이 아닌 유저에게 뜨는 "🔒 방장만 ~ 할 수 있어요" 계열 안내 문구를 없애자는 네 번째 피드백은
범위가 모호해(상시 노출되는 안내 문구만 뺄지, 실제로 시도했을 때 뜨는 안내까지 다 뺄지) 사용자에게
직접 확인 중 — 아직 미반영.

검증: `test/quiz_ui/basket_manage_flow.test.js`에 3개 추가 — 100개 select 행 수(4+1=5) 경계값 확인,
삭제 확인 화면에 프리셋 이름이 포함되는지, `explicit_replied` 회귀 테스트 대상에
`basket_manage_manage_delete_request`(방금 async로 바뀐 핸들러) 추가 — 기존 12개와 합쳐 15개(파일
전체 신규 테스트 기준 재계산). `npm test`(409 pass)/`npm run lint`(0 error)/`npx tsc --noEmit`
(0 error)/`npm run build` 전부 통과. `node -e`로 dist 산출물을 직접 require해 100개 기준 정확히
5행(4 select+1 버튼)이 나오는지 스모크 확인. 관련 `CLAUDE.md`(`quiz_ui/`), `docs/TEST_CHECKLIST.md`
AG섹션(100개 기준 select 행 수, 101번째 차단, 삭제 확인 문구) 갱신. **실사용 미검증**.

### 같은 날 후속 — "방장만 할 수 있어요" 상시 안내 문구 제거(위에서 보류했던 4번째 피드백 확정)

범위를 확인한 결과: **상시 노출되는 안내 문구만 제거, 실제로 시도했을 때만 뜨는 반응형 안내는 유지**로
확정. `buildMainViewPayload`의 메인 화면 설명("🔒 방장만 여기서 퀴즈를 제거하거나 프리셋을 불러올 수
있어요...")과 `buildItemSelectRows`의 select placeholder("조회 전용 - 제거는 방장만 가능...")를
제거/중립 문구("퀴즈함 목록")로 교체 — `handleBasketManageEvent`가 비방장의 실제 제거 시도에 대해
띄우는 "🔒 퀴즈함에서 제거하는 건 방장만 할 수 있어요" 안내는 그대로 유지(안 그러면 왜 안 됐는지 알
길이 없어짐).

검증: 기존 테스트가 정확한 문자열을 assert하지 않아 회귀 없이 통과(`npm test` 409 pass 유지,
`npm run lint`/`npx tsc --noEmit`/`npm run build` 전부 통과). 관련 `CLAUDE.md`(`quiz_ui/`),
`docs/TEST_CHECKLIST.md` AG섹션 갱신.

### 같은 날 후속 — 퀴즈함 모드 메인 화면에 담긴 개수 표시

영구 메시지(오마카세 방 설정/멀티플레이 로비)의 "📗 유저 퀴즈 설정 / 🔸 퀴즈함 모드 사용 중" 문구가
몇 개 담겼는지 안 보여줘서 가시성이 떨어진다는 피드백 — `quiz-info-ui.ts`의 `getTagInfoText()`(오마카세/
멀티 공용 베이스, 각자 `refreshUI()`에서 호출)의 바구니 모드 분기에 `this.quiz_info['basket_items']`
개수를 세서 `🔸 \`퀴즈함 모드 사용 중\` (N개 담김)`으로 표시. 공용 베이스 하나만 고치면 오마카세/
멀티플레이 둘 다 자동 반영됨(중복 구현 없음). `basket-manage-flow.ts`의 `syncRoomUI`가 이미 항목
제거/불러오기 시 `refreshUI()`(오마카세)/`sendEditLobbySignal()`→`applyMultiplayerLobbyInfo`→
`refreshUI()`(멀티)를 태우고 있어서 별도 동기화 로직 추가 없이도 개수가 실시간으로 맞음.

검증: 이 파일은 관례상 유닛테스트 대상이 아니라(UI 텍스트 조립) `node -e`로 dist 산출물의
`getTagInfoText()`를 직접 호출해 출력 확인(`🔸 \`퀴즈함 모드 사용 중\` (3개 담김)` 정상 출력).
`npm test`(409 pass, 회귀 없음)/`npm run lint`(0 error)/`npx tsc --noEmit`(0 error)/`npm run build`
전부 통과. 관련 `CLAUDE.md`(`quiz_ui/`) 갱신.

## 2026-08-19 — quizmgr 관리자 행동 로깅 감사 및 추가

사용자 요청: "QUIZMGR 쪽 기능 관련해서 로그 찍는게 없네, 시스템 운용할 때 정말 중요하니깐 추가"
+ "공지 수정 모달에 기존 내용이 안 채워진다"는 지적 2건.

**로깅 감사 결과 및 조치**: `quizbot/quiz_ui/admin-*.ts` 5개 파일(패널/공지 목록·상세/점검모드/시즌
관리) 전부 `logger` 호출이 단 한 건도 없었고, 이들이 위임하는 매니저 3개(`notice_manager.ts`,
`maintenance_mode_manager.ts`, `scoreboard_season_manager.ts`)도 마찬가지로 무로깅이었음(이미
`ACTIVE_PLAN.md`에 "매니저마다 들쭉날쭉함, 수정 보류"로 기록돼 있던 항목 — 이번에 해소). 아래 함수에
`logger.info`(또는 파급력 큰 항목은 `logger.warn`)를 추가하고, 전부 마지막 인자로 선택적 `actor:
string`(호출부가 `${interaction.user.tag}(${interaction.user.id})` 형태로 넘김)을 받아 "무엇이/누가"
둘 다 로그에 남도록 함:
- `notice_manager.ts`: `writeNoticeFile`/`updateNoticeFile`/`deleteNoticeFile`/`writeCurrentNotice`
- `maintenance_mode_manager.ts`: `enableMaintenanceMode`/`disableMaintenanceMode`(warn — 전 유저
  인터랙션을 차단하는 기능이라)
- `scoreboard_season_manager.ts`: `endSeasonAndStartNew`(성공 info/실패 warn — 되돌릴 수 없는 DB
  아카이브 작업)

이미 로깅이 있던 `ban_manager.js`(`banId`/`unbanId`)도 같은 관례로 actor 인자를 추가(기존엔 "무엇이
바뀌었는지"만 있고 "누가"는 없었음) — 호출부 3곳(`admin-ban-list-ui.ts`, `user-quiz-info.ui.ts`의
"퀴즈 삭제+제작자 영구밴", `report_manual_processing.ts`)은 신고 처리 경로에만 이미 자체
`result_message` 로그가 있어 그대로 두고 나머지 2곳만 actor를 넘기도록 수정.

**"공지 수정 모달 프리필" 건**: 코드 조사 + `node -e` 스모크 테스트로 확인한 결과, quizmgr 공지
게시판(`AdminNoticeDetailUI.requestEditModal`)/점검 모드 문구(`AdminMaintenanceUI.requestEditModal`)/
실시간 공지(`AdminPanelUI.requestCurrentNoticeEdit`) **세 곳 모두 이미 `.setValue()`로 기존 내용을
정상적으로 채워주고 있었음**(전부 2026-08-15 커밋에 이미 포함돼 있던 기존 구현) — 코드 변경 없음.
실제 버그가 아니라 사용자가 테스트한 배포본이 그 이후로 재빌드/재배포되지 않았을 가능성이 높다고
판단해 그대로 안내함(루트 `CLAUDE.md`의 "소스만 고치고 재빌드 안 하면 반영 안 됨" 경고와 부합).

검증: `npx tsc --noEmit`(0 error)/`npm test`(409 pass, 회귀 없음)/`npm run lint`(0 error, 기존 57개
warning 유지)/`npm run build` 전부 통과. `node -e`로 dist 산출물의 `notice_manager`/
`maintenance_mode_manager`/`ban_manager`를 직접 호출해 로그 포맷(레벨/문구/actor 포함 여부)과 실제
파일 쓰기가 정상 동작하는지 스모크 확인(밴/언밴 테스트는 실제 `resources/banned_user.txt`에
잔여 데이터가 안 남았는지도 재확인). 관련 `quizbot/managers/CLAUDE.md` 4개 항목 갱신,
`docs/ACTIVE_PLAN.md`의 기존 보류 항목을 완료로 갱신. **실사용 미검증** — 특히 로그 포맷이 실제
운영 로그 파일에서 보기 편한지는 사용자가 직접 확인 필요.

### 같은 날 후속 — 관리자 기능 밖 로깅 실태 점검 + 유저 퀴즈 삭제 로그 누락 수정

사용자 질문: "관리자 기능 이외에도 주요 기능들에 대해 로깅 처리가 잘 돼있는게 확실한가?" — 전수
확인 결과를 보고하고, 발견된 유일한 실제 공백 하나를 수정.

**점검 방법**: `quizbot/managers/`, `quizbot/quiz_system/` 전체와 `quiz_ui/`의 관련 파일들을 대상으로
파일별 `logger.` 호출 횟수를 세고, 의심스러운 지점(0건인 파일들)을 하나씩 확인해서 "의도적으로 없는
것"과 "빠뜨린 것"을 구분.

**결론 — 전반적으로 잘 돼있음, 구멍 하나 발견**:
- 퀴즈 진행 엔진(`quiz_system/`)/멀티플레이(`multiplayer_session.js` 등)는 세션 시작·종료·승패
  MMR 증감까지 꼼꼼히 로깅돼 있음(문제 단위 세부 상태 전환만 의도적으로 무로깅 — 매 문제마다 찍히면
  로그가 감당 안 됨).
- DB 쿼리 실패는 `db_core.ts`의 `sendQuery` 한 곳에서 전부 중앙집중 로깅되므로 개별 `db_*.ts` 파일에
  로그가 없는 게 정상(누락 아님).
- 신고 처리(수동/자동), 유저 퀴즈 CRUD 중 생성/수정/문제 CRUD는 이미 잘 로깅돼 있었음(`user-quiz-list-ui.ts`
  의 "Created New Quiz", `user-quiz-info.ui.ts`의 "Edited Quiz ..." 3종, `user-question-info-ui.ts`의
  생성/복제/수정/삭제 4종, 웹 쪽(`web_quiz_editor_routes.ts`)도 `[Web]` 접두사로 동일하게 전부 대응).
- **실제 발견된 공백**: `user-quiz-info.ui.ts`의 `quiz_delete_confirmed`(일반 삭제)와
  `quiz_delete_confirmed_and_ban`(어드민 삭제+영구밴) 두 버튼 핸들러가 `user_quiz_info.delete()`를
  호출하면서 로그를 전혀 안 남기고 있었음 — 생성/수정/문제 단위는 다 로깅되는데 유독 "퀴즈 삭제"라는
  되돌릴 수 없는 액션만 빠져 있었음(웹 쪽 삭제 라우트는 이미 로깅돼 있었어서 더 눈에 띄는 비대칭).
  두 핸들러 다 `logger.info`로 quiz_id/제목/실행자(`interaction.user.tag(id)`) 로깅 추가(밴 버전은
  creator_id도 같이).

검증: `npx tsc --noEmit`(0 error)/`npm test`(409 pass, 회귀 없음)/`npm run lint`(0 error)/
`npm run build` 전부 통과.

## 2026-08-19 — 퀴즈 시작 시 권한 부족 안내 강화

사용자 지적: "퀴즈 시작할 때 메시지 전송 등 권한 체크하는 로직이 있지 않나? 문제 없나 점검해달라"에서
출발한 조사→구현.

**조사 과정에서 두 번 정정됨**: 처음엔 "권한 체크가 아예 없어서 실패하면 조용히 멈추고 세션이 좀비로
남는다"고 잘못 진단했으나, 실제로는 `quiz_play_ui.ts`의 `QuizPlayUI.send()`가 이미
`MissingPermissions`/`MissingAccess` 에러 코드를 감지해서 세션을 정리하고 방장에게 DM으로 이유를
안내하는 견고한 처리가 있었음(사용자가 직접 지적해서 정정). 또한 `bot.js`의 `checkPermission`이
이미 `/퀴즈` 진입 시점에 SendMessages/ViewChannel을 체크하고 있었던 것도 재조사 중 발견 — **실제로
비어있던 건 음성 채널(Connect/Speak) 권한 체크뿐**이었음(`createVoiceConnection()`이 권한 부족 시
에러 없이 그냥 연결이 "Connecting"에 멈춰서, 텍스트는 정상 진행되는데 노래만 영원히 안 나오는 상태로
조용히 망가지는 문제).

**구현**: 신규 `utility/util/discord_permission_utility.ts` — `QUIZ_TEXT_CHANNEL_PERMISSIONS`
(ViewChannel/SendMessages/EmbedLinks/AttachFiles)/`QUIZ_VOICE_CHANNEL_PERMISSIONS`(Connect/Speak)
두 상수 배열 + `getMissingPermissionLabels(permissions, required)`(부족한 권한의 한글 라벨만 배열로
반환, permissions 자체가 없으면 required 전체를 부족하다고 취급) 하나만 노출. 두 곳이 이걸 공유:
1. `bot.js`의 `checkPermission`(텍스트, `/퀴즈` 진입 시) — 기존엔 SendMessages/ViewChannel을 하나씩
   순서대로 체크해서 "부족한 것 중 하나만" 알려주던 걸 한 번에 다 검사해서 전부 나열하도록 재작성.
   **사용자 추가 요청으로 DM 백업도 추가** — ephemeral 응답(권한이 없어도 항상 성공)에 더해
   `interaction.user.send(...)`로 명령어 입력자에게 동일 내용을 DM으로도 보냄(DM 실패는 조용히 무시,
   ephemeral 응답 자체는 이미 갔으니 흐름을 막을 이유가 없음).
2. `quiz_system.ts`의 `checkReadyForStartQuiz`(음성, 퀴즈 실제 시작 시) — **신설**: 음성 채널 참가
   확인 다음, 진행 중 세션 확인 전에 `owner.voice.channel.permissionsFor(guild.members.me)`로
   Connect/Speak를 체크, 부족하면 새 `text_contents.json` 키 `reason.no_voice_permission`(placeholder
   `${missing_permissions}`)으로 안내하고 세션 생성 자체를 막는다. 이 함수는 4개 진입 경로(오마카세
   `quiz-info-ui.ts`/멀티플레이 `multiplayer-quiz-select-ui.js`/유저 퀴즈 `user-quiz-info.ui.ts`/웹
   연동 `web-handoff-ui.ts`)가 전부 공유해서 호출하므로, 이 함수 하나만 고치면 4곳 다 동일하게
   적용됨(각 호출부는 `check_ready.reason`을 그대로 ephemeral 메시지에 꽂는 기존 패턴 그대로라 추가
   수정 불필요 — 실제로 4곳 다 동일 패턴인지 코드로 확인함).

검증: `npx tsc --noEmit`(0 error)/`npm test`(412 pass, 신규 `discord_permission_utility` 유닛테스트
3개 포함)/`npm run lint`(0 error, 기존 57개 warning 유지)/`npm run build` 전부 통과. `node -e`로 dist
산출물의 `checkReadyForStartQuiz`(음성 권한 부족 시 정확한 안내 문구 확인)와 `getMissingPermissionLabels`
(실제 discord.js `PermissionsBitField` 인스턴스로 확인)를 직접 호출해 스모크 확인. 관련
`utility/CLAUDE.md`(신규 파일 항목 + 오래전부터 잘못돼 있던 "4개 파일" 표기를 "6개"로 같이 수정),
`quizbot/quiz_system/CLAUDE.md`(`checkReadyForStartQuiz`/`checkPermission` 관계 설명) 갱신,
`docs/TEST_CHECKLIST.md`에 AH섹션 신설. **실사용 미검증** — 특히 음성 채널 권한을 실제로 뺏은 상태에서
퀴즈가 정말 시작 전에 막히는지, DM이 실제로 도착하는지는 실제 서버에서 확인 필요.

## 2026-08-20 — `/프리셋관리` 개인 명령어(웹 전용) 신설

사용자 질문("프리셋 기능을 개인 명령어로도 관리할 수 있게 할 수 있나?")에서 출발 — 조사 결과 디스코드
"프리셋 관리" 화면(`basket-manage-flow.ts`, AG섹션)의 이름변경/항목제거/전체삭제는 이미 `room_ui`
없이 순수 `user_id`만으로 동작해서 뽑아내는 것 자체는 쉬웠으나, 사용자가 곧바로 "퀴즈를 프리셋에
**추가**하는 기능도 있어야 하지 않나"라고 지적 — 조사해보니 퀴즈를 고르는 화면(`UserQuizSelectUI`)이
`QuizbotUI`/`UIHolder` 화면 전환 스택에 올라타는 구조라, 화면 전환 체계를 안 쓰는
`basket-manage-flow.ts`(독립 ephemeral 플로우)엔 그대로 못 붙는다는 구조적 문제를 발견해 보고. 이어서
"웹에서 퀴즈 담기까지 지원하려면 더 커지나?"라는 질문엔 **반대로 웹이 더 쉽다고 답변** — "직접 담기"
모드(`OmakaseTab.jsx`)에 퀴즈 브라우징 UI가 이미 있어서 새 화면 설계가 필요 없기 때문. 사용자가
"그럼 명령어로는 웹만 지원하자, DM 강제도 필요 없지?"로 스코프를 최종 확정.

**DM 강제가 필요 없는 이유**: `/퀴즈만들기`가 DM 전용인 건 `UIHolder`를 만들어서 후속 인터랙션(버튼
클릭 등)을 같은 클러스터 프로세스가 받아야 하는데, 길드에서 요청하면 그 길드를 담당하는 클러스터와
DM을 받는 클러스터가 샤딩 때문에 다를 수 있어서다(`create_quiz_handler`의 "샤딩돼 있어서..." 주석).
`/프리셋관리`는 Link 버튼(URL, discord.js가 인터랙션 없이 바로 브라우저로 열어줌) 하나로 끝나는
1회성 에페메럴 응답이라 `UIHolder`를 아예 안 만들고, 그래서 이 제약 자체가 적용되지 않는다 —
길드/DM 어디서 호출해도 동일하게 동작.

**구현**: DB `db_random_quiz_preset.ts`에 `replaceRandomQuizPresetItems(preset_id, user_id,
quiz_id_list)` 신설(항목 목록 통째 교체, `insertRandomQuizPreset`의 item 삽입부와 동일한
`unnest ... with ordinality` 패턴 재사용 — "추가"와 "정리" 둘 다 최종 목록을 클라이언트가 계산해서
넘기는 방식으로 통일, 개별 추가 API는 따로 안 만듦). `web_express_app.ts`에 `PUT
/api/random-quiz-presets/:preset_id`(이름변경)/`PUT .../items`(항목 교체)/`DELETE
.../items/:quiz_id`(항목 하나 제거, 기존 `deleteRandomQuizPresetItem` 재사용) 3개 라우트 추가 — 전부
`requireWebSession`만(기존 프리셋 라우트와 동일하게 스코프 제한 없음). `command_manager.ts`에
`/프리셋관리`, `bot.js`에 `preset_manage_handler`(owner-scoped 세션 발급 후 Link 버튼 1개 에페메럴
응답). 프론트엔드는 `editor.html`/`QuizEditorApp.jsx`(퀴즈 편집기)와 대칭되는 신규 진입점
`presets.html`/`presets-main.jsx`/`PresetManagerApp.jsx`(Vite 멀티페이지 세 번째 진입점,
`web_express_app.ts`가 `/editor`와 동일한 방식으로 `/presets` 정적 서빙) — 하위 라우트가 없어
`react-router-dom` 없이 로컬 state로 목록⟷상세 전환. 목록은 생성(이름+퀴즈 검색 피커로 미리 담고 한
번에 `POST`, 빈 프리셋 생성은 기존 정책대로 계속 금지)/삭제(2클릭 확인), 상세는 이름변경/항목 개별
제거(삭제·비공개 전환된 항목은 디스코드와 동일하게 "더 이상 사용할 수 없는 퀴즈"로 표시)/퀴즈
추가(검색 피커 클릭 즉시 반영, 별도 저장 버튼 없음 — 이 앱의 "클릭=즉시 반영" 관례를 그대로 따름).
신규 CSS 없음 — `OmakaseTab.jsx`/`QuizListPage.jsx`의 기존 클래스(`qd-row`/`qd-list`/`section-block`/
`text-field`/`toolbar-cta` 등)만 재사용.

검증: `npx tsc --noEmit`(0 error)/`npm run lint`(0 error, 기존 57개 warning 유지)/`npm test`(421
pass, 신규 PUT/DELETE 라우트 테스트 8건 포함, `db_manager.js` export 개수 회귀 테스트 48→49
갱신)/`npm run build`(백엔드)/`npm run build`(프론트엔드, `presets.html`이 별도 청크로 정상 산출되는
것까지 확인) 전부 통과. `docs/plans/RANDOM_QUIZ_PRESET_PLAN.md` 후속 섹션 추가,
`docs/TEST_CHECKLIST.md`에 AI섹션 신설(목록/상세/명령어 진입/디스코드·웹 상호 호환 4갈래).
**실사용 미검증** — 특히 Link 버튼 클릭 후 실제 세션 인증, 디스코드 쪽에서 만든 프리셋이 웹에 그대로
보이는지(그 반대도)는 실제 서버+브라우저에서 확인 필요.

## 2026-08-29 — 멀티플레이 로비 관리자 강제삭제/영구밴 기능

사용자 요청: 멀티플레이 로비의 방 제목은 자유 입력이라 타 길드 비하/욕설 등 문제 방제목을 만들어둘
수 있는데, 지금까지는 관리자가 이를 지울 방법이 없었음(자연 만료를 기다리는 것뿐) — `/quizmgr`에
"대기 중인 로비 목록 조회 → 강제 삭제 / 삭제+방장 길드 영구밴" 기능 신설. 착수 전 세부 설계 4가지를
사용자와 확정: (1) 목록은 LOBBY(대기중)+INGAME(진행중) 둘 다 보여주되 삭제/밴 액션은 LOBBY에서만,
(2) 밴 대상은 로비를 만든 방장 길드만(참가 길드는 제외), (3) 강제 종료 시 참가 길드에는 전용 문구
없이 기존 정상 종료(`EXPIRED_SESSION`)와 동일한 안내를 재사용, (4) UI 흐름은 select 목록 → 상세
화면 → 확인 버튼.

**조사로 밝혀진 핵심**: 로비 레지스트리(`multiplayer_session_registry.js`)는 마스터 프로세스에만
있어 클러스터(`/quizmgr`는 DM이라 임의 클러스터에서 실행)에서는 `ipc_manager.sendMultiplayerSignal`
왕복이 필요함. 기존 `CLIENT_SIGNAL.REQUEST_LOBBY_LIST` 핸들러가 이미 PREPARE만 제외하고 LOBBY+INGAME
전부(제목/호스트 길드ID/참가수/진행여부/평균MMR)를 반환하고 있어서 **목록 조회는 새 신호 없이 기존
신호 재사용만으로 요구사항을 100% 충족** — 방장 길드ID가 곧 `session_id`라 밴 대상 확인도 별도 조회
없이 됨. 강제 종료도 `acceptLeaveLobby`의 호스트 이탈 경로(`sendSignal(EXPIRED_SESSION)` 후
`finish()`)를 그대로 신호 핸들러 안에서 호출하면 돼서 **`multiplayer_session.js`는 전혀 수정하지
않음**. 밴도 `ban_manager.banId(guild_id, actor)`(길드ID/유저ID 통합 관리)를 그대로 재사용.

**구현**: `multiplayer_signal.js`에 `CLIENT_SIGNAL.ADMIN_FORCE_DELETE_LOBBY`(0x13) 신설.
`multiplayer_signal_handlers.js`에 `handleAdminForceDeleteLobby` 추가(LOBBY 상태 아니면 거부,
`EXPIRED_SESSION` 브로드캐스트 후 `session.finish()`). 신규 화면 `admin-lobby-list-ui.ts`(select
목록, `AdminNoticeListUI`와 동일 패턴)/`admin-lobby-detail-ui.ts`(상세+확인, `AdminNoticeDetailUI`와
동일 패턴 — 밴 포함 삭제는 `quiz_delete_confirm_admin_comp`처럼 확인 절차를 2개 ActionRow로 분리해
오클릭 방지) — `AdminPanelUI`의 관리자 패널 2번째 줄에 "🎮 로비 관리" 버튼으로 진입. 밴은 삭제 IPC
성공 응답을 받은 뒤 클러스터 로컬에서 바로 `ban_manager.banId` 호출(IPC 불필요, `user-quiz-info.ui.ts`의
"퀴즈 삭제+제작자 영구밴" 버튼과 동일 패턴).

검증: `npm run lint`(0 error, 기존 56개 warning 유지)/`npm test`(421 pass, `components.test.js` export
개수 78→80 갱신 포함) 전부 통과. `docs/TEST_CHECKLIST.md` N섹션(실전 대결)에 신규 항목 추가.
**실사용 미검증** — 실제 2개 이상 길드로 로비를 만들어 강제 삭제/영구밴이 참가 길드 쪽 화면과
밴 목록에 정상 반영되는지는 다음 세션에서 확인 필요.
