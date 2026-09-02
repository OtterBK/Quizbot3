# quizbot/managers/

비즈니스 로직 서비스 계층. 대부분 상태를 가진 싱글턴 모듈이고, `exports.initialize(...)`가 있으면 `quizbot/bot.js`의 시작 시퀀스에서 호출됨(루트 `CLAUDE.md`의 "매니저 패턴" 참고). 두 하위 디렉터리(`db/`, `report/`)는 각각 자체 `CLAUDE.md`가 있음.

## 오디오/캐시

- **`audio_cache_manager.js`** — 노래 맞추기 퀴즈용 yt-dlp 다운로드 + 캐시 파이프라인. 캐시는 `video_id` 첫 글자로 해싱된 하위 폴더(`getHashedPath`)에 저장, 성공하면 webm으로 변환(`convertToWebm`). 함수들이 서로 강하게 얽혀있는 단일 파이프라인이라 **구조 분리를 의도적으로 하지 않음**(`docs/plans/REFACTOR_PLAN.md` Phase 5 결정). 순수 함수 4개(`getHashedPath`/`getDownloadResultType`/`getExpectedErrorType`/`executeDownloadProcess`)는 유닛테스트를 위해 추가로 export됨. `forceCaching`은 대량 사전 캐싱용 CLI성 함수. **주의**: `docs/archive/BUGS_FOUND.md`에 이 파일 관련 미수정 버그 2건 기록됨 (convertToWebm의 unlink 에러 로그 조건이 반대로 보임, reWriteCacheInfo의 fs.writeFileSync에 죽은 콜백 인자) — 둘 다 저위험 판단으로 보류 중. `generatePreviewClipStream(cache_file_path, audio_start_point, audio_length_sec)`(B-2, 2026-08-07 신설) — 캐시 파일에서 구간을 `-c copy`(재인코딩 없음)로 잘라 `PassThrough` 스트림으로 반환, 문제 미리듣기용(`user-question-info-ui.js`의 `sendAudioPreview`가 호출). `downloadAudioCache`는 `downloading_promises`(video_id → Promise) 맵으로 감싸져 있어(2026-08-08 수정) 같은 video_id를 동시에 여러 번 호출해도(미리듣기 연타 등) yt-dlp 프로세스를 중복 스폰하지 않고 진행 중인 Promise를 재사용함 — 실제 다운로드 로직은 `executeDownloadAudioCache`로 분리돼 있음.

## 공지사항

- **`notice_manager.ts`**(나머지 화면 웹 포팅, 2026-08-12 신설) — `loadNoticeList(notices_path)`/
  `readNoticeFile(note_path)` 순수 함수 2개. `quiz_ui/note-select-ui.ts`(목록)/`note-ui.ts`(상세)에
  있던 파일 읽기 로직을 그대로 추출(`quiz_editor_validation.ts`와 동일 관례) — 디스코드 UI가 이
  함수들을 호출하고, `web/web_express_app.ts`의 `GET /api/notices`/`GET /api/notices/:name`도
  재사용한다. 패치노트(`patch_note_contents`)는 죽은 기능이라 손대지 않음.
  **quizmgr 공지 관리(2026-08-15 신설)**: `writeNoticeFile`/`updateNoticeFile`/`deleteNoticeFile` 3개
  추가(`quiz_ui/admin-notice-list-ui.ts`/`admin-notice-detail-ui.ts`가 사용) — 공지 파일명을 이제
  `YYYYMMDDHHmmss_제목.txt`(14자리 타임스탬프 접두사)로 관리한다. 기존엔 파일명 한글로케일 역순
  정렬이라 제목에 따라 작성 순서가 뒤바뀔 수 있었던 문제(사용자 피드백)를 해결하기 위함 — mtime은
  서버 배포 시 `git reset --hard`로 깨질 수 있어 채택 안 하고(운영 배포 스크립트,
  `auto_script/server_script/quizbot_update.sh` 참고), 파일명 자체에 순서를 새겨서 git 배포와 무관하게
  안정적으로 보장한다. `loadNoticeList`는 이 접두사 기준 최신순으로 정렬하고(접두사 없는 레거시 파일은
  mtime으로 폴백), `updateNoticeFile`은 제목이 바뀌어도 기존 접두사(=작성 순서)를 유지한 채 파일명만
  바꾼다(접두사 없던 레거시 파일을 수정하면 이때 접두사가 새로 부여됨 - 자가 치유). 기존 공지 2개는
  git 히스토리(`git log --follow`)로 실제 최초 커밋 시점을 확인해 그 순서로 마이그레이션됨.
  **`resources/notices/`는 2026-08-15부터 `.gitignore` 대상**(quizmgr에서 만드는 공지는 서버별 운영
  데이터라 커밋 대상이 아님) — 기존에 이미 커밋돼있던 공지 2개는 계속 git이 추적함(gitignore는 이미
  추적 중인 파일엔 소급 적용 안 됨), 새로 만드는 공지만 추적 대상에서 빠짐.
  **실시간 공지(2026-08-15 신설)**: `readCurrentNotice`/`writeCurrentNotice` 2개 추가 —
  `resources/current_notice.txt`(위 게시판형 공지(`notices/`)와는 완전히 별개인 단일 파일, `/퀴즈`
  최초 진입 화면(`quiz_ui/select-ui-mode-ui.ts`의 `buildNoticeFields()`)에서만 노출) 읽기/쓰기.
  `quiz_ui/admin-panel-ui.ts`가 목록/상세 화면 없이 관리자 패널에서 바로 모달로 편집하는 데 사용 —
  기존엔 서버 파일을 직접 편집하는 방식뿐이었음.
  **로깅 감사(2026-08-19)**: `writeNoticeFile`/`updateNoticeFile`/`deleteNoticeFile`/`writeCurrentNotice`
  4개 전부 원래 아무 로그도 안 남기고 있었음(quizmgr 기능 전반의 로깅 누락을 사용자가 지적) —
  `logger.info(...)`를 추가하고, 마지막 인자로 선택적 `actor` 문자열(호출부가 `${interaction.user.tag}
  (${interaction.user.id})` 형태로 넘김)을 받아 로그에 "누가 했는지"도 같이 남김. 밴 관리(`ban_manager.js`)
  가 이미 쓰던 관례(로그는 남기되 actor 없이 무엇이 바뀌었는지만)에서 한 단계 더 나아간 것 — 운영 중
  quizmgr로 뭘 바꿨는지 사후 추적이 가능해야 한다는 게 목적.
- **`maintenance_mode_manager.ts`**(quizmgr 점검 모드 관리, 2026-08-15 신설) —
  `isMaintenanceModeOn`/`getMaintenanceNotice`/`enableMaintenanceMode`/`disableMaintenanceMode` 4개
  순수 함수. `resources/maintenance_notice.txt`(공지사항 게시판/실시간 공지와 무관한 별도 파일) 존재
  여부로 점검 모드를 판단 — 이 파일이 있으면 `bot.js`의 전역 `interactionCreate` 핸들러 최상단에서
  관리자(`PRIVATE_CONFIG.ADMIN_ID`) 외 전 유저의 인터랙션(슬래시커맨드/버튼/모달 전부)을 차단하고
  파일 내용을 안내 문구로 보여준다(코드 주석엔 원래 "임시로 잠시 해둠"이라고 적혀 있던 기능). 기존엔
  서버 파일을 SSH로 직접 만들고 지우는 방식뿐이었음 — `quiz_ui/admin-maintenance-ui.ts`에서 켜기/문구
  수정/끄기 가능(관리자 본인은 점검 모드 중에도 이 체크를 그대로 통과하므로 자기 자신을 잠글 걱정
  없음). **`resources/maintenance_notice.txt`는 `.gitignore` 대상**(`resources/notices/`와 동일한
  이유 — 파일 존재 자체가 서버별 운영 상태(점검 모드 on/off)라 실수로 커밋되면 다른 배포본이 점검
  모드가 켜진 채로 넘어갈 수 있음). 점검 모드 차단 안내(`bot.js`)에는 `support_link_component`(지원센터
  Link 버튼, `guildCreate` 환영 메시지와 공유)도 같이 붙어서, 막힌 유저가 문의할 곳을 바로 찾을 수
  있음(2026-08-15 추가). **로깅 감사(2026-08-19)**: `enableMaintenanceMode`/`disableMaintenanceMode`가
  원래 무로깅이었음 — 전 유저 인터랙션을 차단하는 파급력 큰 기능이라 `logger.warn(...)`(info가 아니라
  warn — 운영자가 로그를 훑을 때 놓치면 안 되는 상태 변화라서)으로 켜짐/꺼짐 + `actor`(선택, notice_manager와
  동일 패턴)를 남기도록 추가.

## 스코어보드 시즌

- **`scoreboard_season_manager.ts`**(2026-08-15 신설, `docs/plans/SCOREBOARD_SEASON_PLAN.md`) — "시즌"이
  이 기능 이전엔 `text_contents.json`의 고정 텍스트 라벨일 뿐 실제 데이터 모델이 없었음(과거 시즌 기록은
  복구 불가) — 이번에 신규 DB 테이블(`db/db_scoreboard.ts` 참고)과 함께 처음으로 실제 아카이브 기능이
  생김. `getCurrentSeasonName`/`setCurrentSeasonName`은 `resources/current_season_name.txt`(
  `current_notice.txt`/`maintenance_notice.txt`와 동일 패턴, 재배포 없이 quizmgr에서 바로 수정) 읽기/쓰기
  순수 함수. `endSeasonAndStartNew(path, new_season_name)`는 "시즌 종료" 버튼 한 번으로 끝나는 합성
  동작 — 현재 파일에 적힌 이름으로 `db_manager.endCurrentSeason`을 호출해 스냅샷+라이브 테이블 초기화를
  맡기고, 성공했을 때만 파일에 새 이름을 이어 쓴다(실패 시 파일은 건드리지 않음). `quiz_ui/admin-season-ui.ts`
  (quizmgr "시즌 관리")가 호출부. **로깅 감사(2026-08-19)**: 되돌릴 수 없는 DB 아카이브 작업인데도 원래
  무로깅이었음 — 성공(`logger.info`)/실패(`logger.warn`) 둘 다 이전 시즌 이름→새 시즌 이름 +
  `actor`(선택)를 남기도록 추가.

## 밴 관리

- **`ban_manager.js`** — `resources/banned_user.txt`를 메모리 `Set`으로 캐싱(10분 주기 재조회, `unref()`된 타이머). `isBanned(id_list)`, `banId(id, actor?)`, `unbanId(id, actor?)`, `getBannedIdList()`. **길드ID(멀티플레이 밴)와 유저ID(퀴즈 생성 영구밴)를 같은 목록으로 관리** — 의도된 설계(둘 다 "이 ID는 문제 있음"이라는 같은 의미). `banId`/`unbanId`는 파일에 쓰는 동시에 캐시도 즉시 갱신해 다음 재조회 주기를 기다리지 않음. 원래 이름은 `multiplayer_ban_manager.js`였는데 유저ID 밴도 겸하게 되면서 일반화된 이름으로 리네임됨. 파일 기반 싱글턴이라 Discord client 의존이 없어(2026-08-10 확인) `initialize()`가 클러스터(`bot.js`)뿐 아니라 마스터(`index.js`)에서도 호출됨 — 멀티플레이 웹 연동(Phase 4)의 `/api/session/confirm`(mode:multiplayer)이 로비 생성/참가 브로드캐스트 전에 마스터에서 바로 밴 체크를 하기 위함. `banId`/`unbanId`는 원래부터 `logger.info`로 로깅하고 있었지만(다른 관리자 기능들과 달리 이미 로깅이 있던 몇 안 되는 곳) actor는 안 남기고 있었음 — **로깅 감사(2026-08-19)**로 마지막 인자에 선택적 `actor` 문자열을 추가(`admin-ban-list-ui.ts`/`user-quiz-info.ui.ts`가 넘김, `report_manual_processing.ts`의 자동/수동 신고 처리 경로는 이미 자체 `result_message` 로그가 있어 그대로 둠).

## 명령어/설정

- **`command_manager.ts`** — `SlashCommandBuilder` 배열 + `registerCommands`(길드별)/`registerGlobalCommands`. 새 슬래시커맨드 추가 시 여기 등록. **`/프리셋관리`(2026-08-20 신설)** — 랜덤 퀴즈 프리셋 관리 웹 페이지로 연결하는 Link 버튼만 응답하는 명령어(위 "퀴즈 선택 웹 연동" 섹션의 "프리셋 관리 웹 페이지" 항목 참고), `bot.js`의 `preset_manage_handler`가 처리.

## 신고/피드백

- **`feedback_manager.js`** — 퀴즈 👍 추천. `addQuizLike`/`addQuizLikeAuto`/`checkAlreadyLike`. 추천 수가 `SYSTEM_CONFIG.CERTIFY_LIKE_CRITERIA`를 넘으면 자동으로 `db_manager.certifyQuiz` 호출(인증 마크). 예전에 있던 `@Deprecated` 죽은 코드(`createDynamicQuizFeedbackComponent`/`do_event`)는 삭제됨(`docs/archive/DEPRECATED_CODE_REMOVED.md` 참고).
- **`report_manager.js`** — 신고 처리 전체의 얇은 facade. 상세: `report/CLAUDE.md`.

## 멀티플레이 (서버 간 대결)

여러 길드가 서로 대결하는 "멀티플레이" 기능 전체. **`quizbot/quiz_system/session/multiplayer_session.js`(같은 길드 내부의 State 패턴 퀴즈 세션)와 이름이 겹치지만 완전히 다른 코드**이니 헷갈리지 말 것.

- **`multiplayer_manager.js`** — 얇은 facade. `initialize(manager)` / `onSignalReceived(signal)`만 노출, 아래 파일들에 위임.
- **`multiplayer_session_registry.js`** — `multiplayer_sessions` 레지스트리 객체 + `cluster_manager`(discord-hybrid-sharding 참조) + `broadcast(signal)` + `sendMultiplayerLobbyCount()`.
- **`multiplayer_mmr.js`** — MMR 계산 순수 함수(`calcWinnerMMR`/`calcLoserMMR`), 부수효과 없어 테스트하기 쉬움. **상대 길드의 MMR/전적은 전혀 참조하지 않음**(Elo류 상대평가 아님, 각자 자기 승률/점수만 봄) — 의도된 설계, 실력차 비교가 필요하면 별도 재설계 필요. `calcLoserMMR`의 `question_ratio`(2026-08-12, MMR 비대칭 보정)는 원래 `Math.min(0.5, ...)`로 캡이 걸려있어서 `calcWinnerMMR`의 캡 없는 `question_ratio`와 비대칭이었음(풀게임 패배가 최대 -40점, 승리는 최대 120점) — 사용자 피드백("점수 변동폭 부적절")으로 캡 제거, 승자와 동일 구조로 맞춤. 승률 보너스(이미 승률 높은 길드가 이기면 더 받는 부분)는 안 건드림.
- **`multiplayer_guild_info.js`** — `MultiplayerGuildInfo` 클래스, 대결에 참가한 개별 길드의 상태(참가자, 점수, 동기화 여부 등).
- **`multiplayer_session.js`** — `MultiplayerSession` 클래스(~1000줄) + `SESSION_STATE` enum. 대결 세션의 생명주기 전체(로비 생성 → 시작 → 진행 → 종료/정리). `changeHost()`에 방장 교체 시 레지스트리 재등록 누락 버그가 있었는데 수정됨(`docs/archive/BUGS_FOUND.md` Phase 3).
- **`multiplayer_signal.js`** — `CLIENT_SIGNAL`(0x00~0x13)/`SERVER_SIGNAL`(0x80~0x94, 최상위 비트 set) enum. IPC 메시지 방향 구분용. `ADMIN_FORCE_DELETE_LOBBY`(0x13, 2026-08-29 신설)는 quizmgr 관리자 전용 — 일반 클라이언트(디스코드 UI)는 절대 보내지 않음, `quiz_ui/admin-lobby-detail-ui.ts`만 사용.
- **`multiplayer_signal_handlers.js`** — `onSignalReceived` 디스패치 + `CLIENT_SIGNAL`별 `handle*` 함수 19개. **주의**: `isClientSignal(signal)`이 `signal.signal_type`이 아니라 `signal` 객체 전체를 넘겨받아 비트 검증이 사실상 무력화된 버그가 있음(`docs/archive/BUGS_FOUND.md` Phase 3) — IPC 신호 검증 영역이라 검증 없이 고치지 않고 기록만 해둔 상태. **관리자 로비 강제삭제(2026-08-29 신설)**: `handleAdminForceDeleteLobby`는 대기 중(LOBBY) 로비만 대상으로 하고(진행 중이면 거부), `acceptLeaveLobby`의 호스트 이탈 경로와 동일하게 `session.sendSignal({signal_type: SERVER_SIGNAL.EXPIRED_SESSION})` 브로드캐스트 후 `session.finish()`를 호출한다 — 기존 `MultiplayerSession` public 메서드만 재사용해서 `multiplayer_session.js` 자체는 무수정. 로비 목록 조회는 새 신호를 만들지 않고 기존 `REQUEST_LOBBY_LIST`(PREPARE만 제외, LOBBY+INGAME 전체 + 방장 길드ID(=`session_id`) 반환)를 그대로 재사용 — 방장 길드ID가 곧 밴 대상이라 별도 조회 없이 `ban_manager.banId`(클러스터 로컬 호출, IPC 불필요)로 밴까지 처리된다. 상세는 `quiz_ui/CLAUDE.md`의 `admin-lobby-list-ui.ts`/`admin-lobby-detail-ui.ts` 항목.
- **`multiplayer_chat_manager.js`** — 멀티플레이 중 전체 채팅(`/챗`, `/채팅전환`).

## 퀴즈 만들기 웹 연동 (`quiz_editor_validation.ts` + `web/web_quiz_editor_routes.ts`, 신규 2026-08-11)

- **`quiz_editor_validation.ts`** — `docs/plans/WEB_QUIZ_CREATION_PLAN.md` Phase 2. `quiz_ui/user-question-info-ui.ts`/`user-quiz-info.ui.ts`에 흩어져 있던 인터랙션-비의존 검증/파싱 로직을 순수 함수 7개로 추출(`multiplayer_mmr.js`와 동일하게 "부수효과 없는 순수 함수는 managers/에 바로 둔다" 관례, `web/` 하위가 아니라 `managers/` 바로 밑에 있음에 주의). 디스코드 UI가 지금 이 함수들을 호출하고, Phase 3의 REST 핸들러(아래)도 `isValidAudioUrl`/`isValidImageUrl`/`isDiscordCdnLink`/`canGoPublic`을 재사용한다.
- **`web/web_quiz_editor_routes.ts`**(Phase 3, Phase 4로 문제 CRUD 추가) — 퀴즈+문제 REST CRUD 본체(`/api/my-quizzes`, Express Router). `web_express_app.ts`에 `requireWebSession`(그 파일 소속) + 이 파일이 노출하는 `requireOwnerScopedSession`으로 감싸 마운트됨. `requireQuizOwnership`(내부 미들웨어)이 `user_quiz_info_manager.loadOwnedUserQuizInfoById`로 소유권을 DB 레벨에서 검증 — 통과하면 `req.owned_quiz`에 담아 재조회 없이 재사용. 문제(question) CRUD 4개(`POST`/`PUT`/`DELETE .../questions[/:question_id]`, `POST .../duplicate`)는 DB에 문제 단건 조회 함수가 없어 매번 `owned_quiz.loadQuestionListFromDB()`로 전체를 로드해 개수 체크(최대 50개)/소속 확인(다른 퀴즈 소속이면 404)에 씀. 신규 헬퍼 `applyQuestionFields`/`validateQuestionFields`가 `quiz_ui/user-question-info-ui.ts`의 3개 모달 핸들러(`applyQuestionInfo`/`applyQuestionAdditionalInfo`/`applyQuestionAnsweringInfo`)를 단일 함수로 합침 — `is_partial` 플래그로 `POST`(전체 필드 반영)/`PUT`(body에 실린 필드만 반영)을 분기하고, `quiz_editor_validation.parseAudioRangePoints`/`redefineRepeatCount`를 그대로 재사용한다. **웹 API 보안 점검(2026-08-12, `docs/plans/QUESTION_PREVIEW_AND_SECURITY_REVIEW_PLAN.md`)**: `validateQuizMetadata`/`validateQuestionFields`가 기존엔 `typeof === 'string'`일 때만 길이를 검사해서 비문자열(객체/배열/숫자) 입력이 검증을 통째로 건너뛰고 그대로 저장 시도됐음(`answers` 필드는 타입 체크 없이 바로 `.trim()`을 호출해 TypeError로 요청이 죽을 수도 있었던 가장 심각한 구멍) — 공용 헬퍼 `checkOptionalStringField`로 타입 체크를 길이 체크보다 먼저 수행하도록 수정. `answer_type`도 `VALID_ANSWER_TYPES` 화이트리스트 체크 추가(기존엔 `ANSWER_TYPE` enum 외의 임의 값도 그대로 저장 가능했음). IDOR는 이미 SQL 레벨(`requireQuizOwnership`)에서 안전했음이 코드 리뷰로 확인됐고, 서로 다른 두 세션(owner_A/owner_B)이 실제로 교차 접근을 시도하는 라이브형 회귀 테스트(`test/managers/web/web_quiz_editor_routes.test.js`의 PUT/DELETE "라이브 IDOR 검증" 테스트)로 보강됨.
- **`web/web_rate_limit.ts`**(2026-08-12 신설, 웹 API 보안 점검) — `apiRateLimiter` 미들웨어 하나만 노출, `web_express_app.ts`가 `/api/*`+`/health`에 건다(정적 자산은 제외 - 브라우저가 여러 파일을 동시에 요청하는 게 정상). `express-rate-limit` 기반, 조회(GET/HEAD)는 느슨하게/쓰기(그 외)는 그보다 빡빡하게 계층형 적용 — 고정 윈도우를 250ms/1000ms처럼 짧게 잡으면 "목록 조회 직후 상세 조회", "확정 후 바로 재선택" 같은 정상적인 연속 호출까지 막혀버려서(실제로 기존 통합 테스트 3건이 이 방식으로 깨진 걸 발견), 평균 처리량은 유지하되 1초 윈도우 안에서 짧은 버스트를 허용하는 값으로 조정됨. 최초엔 조회 1초당 4회/쓰기 1초당 3회로 시작했다가 사용자가 실사용 기준 너무 빡빡하다고 판단해 같은 날 조회 1초당 10회/쓰기 1초당 8회로 완화(수치가 또 바뀔 수 있으니 정확한 값은 코드의 `readLimiter`/`writeLimiter` 참고). 키는 `Authorization: Bearer` 토큰 우선(같은 길드/네트워크의 여러 유저가 IP 기준으로 서로를 막는 걸 방지) — 토큰이 없거나 무효해도 그 값 자체를 키로 써서 세션 발급 전 요청/토큰 무차별 대입 시도까지 독립적으로 제한하고, 토큰이 정말 없으면 `ipKeyGenerator`(IPv6 정규화)로 IP 폴백. `MemoryStore`를 직접 생성해 들고 있어 `__resetForTest()`로 테스트 간 카운터를 초기화할 수 있음(`test/managers/web/web_rate_limit.test.js`).

## 퀴즈 선택 웹 연동 (`web/`, 신규 2026-08-08)

`docs/plans/WEB_INTEGRATION_PLAN.md`의 임시 토큰 기반 리모트 컨트롤 기능. 멀티플레이와 같은 이유로 상태를
마스터 프로세스(`index.js`)에 둔다(`multiplayer_session_registry.js`와 동일 패턴). Phase 1(공식
퀴즈)/Phase 2(유저 퀴즈)/Phase 3(랜덤 퀴즈)/Phase 4(멀티플레이 퀴즈)까지 전부 완료 —
`docs/plans/WEB_INTEGRATION_PLAN.md`의 "단계별 구현 순서" 참고. **진입점은 `/퀴즈` 직후 `SelectUIModeUI`
(디스코드 UI/웹 UI 투트랙 분기)** — 디스코드 쪽 `quiz_ui/CLAUDE.md` 참고, 여기 매니저들은 어느
진입점에서 왔는지와 무관하게 동일하게 동작. **Phase 4(멀티플레이)만 예외**: 실제 로비 생성/참가
로직은 마스터가 아니라 그 길드를 담당하는 클러스터의 `WebHandoffUI.buildMultiplayerUI`가 처리한다
(음성채널 체크에 실제 `GuildMember`가 필요해서) — 상세는 `quiz_ui/CLAUDE.md`의 `web-handoff-ui.js`/
`multiplayer-quiz-lobby-ui.js` 항목 참고.

**퀴즈 만들기 웹 연동(`docs/plans/WEB_QUIZ_CREATION_PLAN.md`) Phase 1, 2026-08-11**: `web_session_manager.ts`가
guild(길드)/owner(유저) 두 스코프를 다루도록 일반화됨 — 세션 객체에 `scope`/`scope_id`(브로드캐스트
키로 통일, guild 세션이면 guild_id, owner 세션이면 owner_id와 동일값) 필드가 추가되고, 브로드캐스트
함수도 `broadcast(guild_id,...)`→`broadcast(scope_id,...)`로 리네임됨(시그널 필드도 `signal.guild_id`→
`signal.scope_id`). `owner_token_map`(신규) + `createOwnerScopedSession`/`releaseOwnerScopedSession` —
DM은 봇-유저 1:1이라 하이재킹 개념이 없어 기존 세션이 있어도 무조건 교체한다(`already_locked` 거절
로직 자체가 없음). `/퀴즈만들기`(`createQuizToolUIHolder`)의 새 진입점 `QuizEditWebHandoffUI`(디스코드
쪽 `quiz_ui/CLAUDE.md` 참고)가 `create_owner_session` IPC 액션으로 이 세션을 발급받는다. 기존 guild
세션 함수들(`createSession` 등)은 시그니처 불변 — 내부에서 `scope:'guild'`로 세션을 만들 뿐이다.

- **`web_session_manager.js`** — 마스터 전용 싱글턴. `initialize(cluster_manager)`(index.js에서만 호출),
  토큰↔길드 매핑 Map(`web_sessions`/`guild_token_map`), GC(`runGC`가 설정 인터벌마다 자동 호출되지만 테스트를
  위해 별도 export됨). **스테이트리스** — 세션 자체엔 선택 내용을 저장하지 않고, `select`/`apply` 요청에
  실린 payload를 그대로 브로드캐스트만 함(실제 quiz_info 조립은 클러스터 쪽 `WebHandoffUI`/`DevQuizInfoUI`가
  담당). **토큰 생명주기(2026-08-08 재설계)**: `apply`(확정)는 브로드캐스트만 하고 토큰을 안 지움 —
  파기는 `release(guild_id, expected_token?)`가 담당하고, 이건 클러스터 쪽에서 퀴즈가 실제
  시작되거나(`quiz-info-ui.ts`의 `handleStartQuiz`) 그 길드의 UIHolder가 사라질 때(`ui-system-core.ts`의
  `UIHolder.free()`) 호출됨 — 둘 다 브로드캐스트 없이 조용히 정리(클러스터가 이미 그 이유로 화면이
  바뀌는 중이라 알릴 필요 없음). `expected_token`(2026-08-12 추가)은 `UIHolder.free()`가 `this.ui?.token`을
  같이 넘길 때만 검사됨 — force_take로 이미 새 토큰으로 교체된 뒤 예전 홀더가 free()되며 release를
  불러도, 토큰이 다르면 조용히 무시해서 방금 발급된 새 토큰을 실수로 지우는 레이스를 막는다(토큰을
  안 넘기는 `handleStartQuiz` 등은 여전히 무조건 파기). `handleRequest({action:
  'create'|'force_take'|'select'|'apply'|'release'|'heartbeat', ...})`가
  `index.js`의 `WEB_SESSION_REQUEST` IPC 분기에서 호출되는 진입점. 세션 상태 변화 시
  `ipc_manager.IPC_MESSAGE_TYPE.WEB_SESSION_SIGNAL`로 전체 클러스터에 브로드캐스트(`locked`/`updated`/
  `applied`/`expired` 이벤트, `release`는 브로드캐스트 없음) — 각 클러스터는 `bot.js`의
  `relayWebSessionSignal`(`quizbot_ui.relayWebSessionSignal`로 실제 라우팅)에서 수신해 그 길드에
  현재 떠 있는 UI(`WebHandoffUI`, `DevQuizInfoUI`, `UserQuizInfoUI`)로 전달. **세션의 `mode` 필드는
  생성 시 1회 값일 뿐**(스테이트리스라 select/apply를 그 값으로 강제 제한하지 않음) — Phase 2에서
  "한 세션으로 dev/user 탭을 자유롭게 오갈 수 있게" 요구사항이 생겼을 때 이 매니저는 손댈 필요가
  없었고, 분기는 클러스터 쪽 `WebHandoffUI.handleApplied`와 `web_express_app.js`의
  `/api/session/confirm`이 요청/payload의 `mode` 필드로 처리한다. `reportMultiplayerResult(guild_id,
  result)`/`consumeMultiplayerResult(token)`(Phase 4, 2026-08-10 신규, 실사용 피드백 수정) - 멀티플레이
  로비 생성/참가의 밴/음성채널 체크는 클러스터가 비동기로 처리해서 confirm 응답만으로 성공/실패를 알 수
  없는 문제를, 클러스터가 처리 결과를 `report_multiplayer_result` 액션으로 다시 보고하고(세션 객체에
  `multiplayer_result` 필드로 담아둠) `GET /api/multiplayer-result`가 1회성으로 소비하는 방식으로 해결.
- **`web_express_app.js`** — Express 앱. `SYSTEM_CONFIG.WEB_SERVER_PORT`로 로컬 리슨,
  `SYSTEM_CONFIG.WEB_FRONTEND_DIST_PATH`(`web-frontend/`의 React+Vite 빌드 산출물)를 정적 서빙.
  `requireWebSession` 미들웨어(Authorization: Bearer 토큰 검증)로 보호된 API: `GET /api/session`,
  `POST /api/session/heartbeat`, `GET /api/dev-quizzes`(공식 퀴즈 트리 - `loadLocalDirectoryQuiz`를
  마스터가 직접 호출해서 캐싱, DB/클러스터 릴레이 없음), `GET /api/user-quizzes`(Phase 2 신규 - 유저
  퀴즈 전체 목록 + `QUIZ_TAG` 태그 목록, `loadUserQuizListFromDB(undefined)`를 매 요청마다 조회 -
  디스코드 쪽 `UserQuizSelectUI.onReady()`와 동일 관행), `GET /api/user-quizzes/:quiz_id`(상세 -
  `question_count`는 `selectQuestionInfo`로 실제 계산, 목록 API엔 문제 수 컬럼이 없어 여기서만 정확히
  알 수 있음), `POST /api/session/select`(진행 중 선택 브로드캐스트), `POST /api/session/confirm`
  (**요청 본문의 `mode`로 dev/user/omakase 분기** - dev는 캐시된 트리의 `quiz_size`, user는
  `loadQuestionListFromDB()`로 재조회한 실제 문제 수로 서버 사이드 클램프 후 `applySelection` — 토큰
  유지, 여러 번 호출 가능). `GET /api/omakase-tags`(Phase 3 신규 - DB 조회 없이 `DEV_QUIZ_TAG`/
  `QUIZ_TAG` config만 유형(값≤4)/장르(값>4)로 분류해 노출, `omakase_components.ts`의 태그 select
  메뉴와 동일한 분류 규칙). `mode:'omakase'`는 DB 재검증이 필요 없는 정적 설정이라 문제 수만 고정
  상한(100)으로 클램프하고 나머지 필드(태그/인증필터/퀴즈함)는 그대로 전달. `GET /api/multiplayer-lobbies`
  (Phase 4 신규 - `multiplayer_session_registry.multiplayer_sessions`가 이미 마스터 프로세스 메모리에
  있고 `REQUEST_LOBBY_LIST` 핸들러도 이미 마스터에서 실행되므로, IPC 왕복 없이 `multiplayer_manager.
  onSignalReceived(...)`를 인프로세스로 그대로 호출). `mode:'multiplayer'`는 밴 체크만 마스터에서 먼저
  거르고(`ban_manager.isBanned`), 실제 음성채널 체크/로비 생성·참가는 `applySelection`으로 브로드캐스트만
  한 뒤 그 길드를 담당하는 클러스터(`WebHandoffUI.buildMultiplayerUI`)에 맡긴다 - 그래서 이 엔드포인트는
  항상 `{success:true}`를 즉시 반환한다. `GET /api/multiplayer-result`(2026-08-10 신규, 실사용 피드백
  수정) - 클러스터가 밴/음성채널 체크 결과를 `report_multiplayer_result` 액션으로 다시 보고하면
  `web_session_manager`가 세션에 1회성으로 담아두고, 프론트엔드가 confirm 직후 이 엔드포인트를 잠깐
  폴링해서 실제 성공/실패(+사유)를 읽어간다(`quiz_ui/CLAUDE.md`의 `web-handoff-ui.js` 항목 참고).
  **나머지 화면 웹 포팅(2026-08-12)**: `requireGuildScopedSession` 미들웨어(`requireOwnerScopedSession`과
  대칭, `req.web_session.scope !== 'guild'`면 403) + 신규 라우트 5개 — `GET /api/quiz-tool-guide`(정적),
  `GET /api/notices`/`GET /api/notices/:name`(`notice_manager.ts` 재사용), `GET /api/support-link`
  (봇 지원센터 링크, `SYSTEM_CONFIG.SUPPORT_SERVER_URL`을 그대로 반환 - 디스코드 쪽
  `select_ui_mode_btn_component`/`main_ui_component`와 동일 값 공유, 2026-08-15 신설),
  `GET`/`PUT /api/server-option`
  (서버 옵션 - `quiz_option.js`의 `OptionStorage`를 디스코드 `server-setting-ui.ts`와 그대로 공유, 저장은
  `db_option.updateOptionParameterized`로 영속화, 값 검증은 `text_contents.json`의
  `server_setting_ui.select_menu.option_values` 화이트리스트 기준). 권한 체크는 의도적으로 없음(서버
  설정은 디스코드와 동일하게 아무 길드원이나 편집 가능 — 사용자 확인, `quiz_ui/CLAUDE.md`의
  `server-setting-ui.js` 항목 참고). **랜덤 퀴즈 프리셋(2026-08-13 신설, `docs/plans/
  RANDOM_QUIZ_PRESET_PLAN.md`)**: "랜덤 퀴즈" 탭 "직접 담기" 모드의 퀴즈함(quiz_id 목록)을
  유저(`owner_id`) 단위 최대 10개까지 저장/재적용하는 웹 UI 한정 기능. `GET`/`POST`/
  `DELETE /api/random-quiz-presets[/:preset_id]` 3개, `requireWebSession`만으로 충분(guild 세션인
  omakase도 owner 세션도 둘 다 `owner_id`를 갖고 있어 스코프 제한 불필요). DB는
  `db/db_random_quiz_preset.ts`(`db/CLAUDE.md` 참고) — 옵션(태그/문제 수 등)은 저장하지 않고 quiz_id
  목록만 저장하며, 목록 조회 응답도 필터링 없이 그대로 내려준다. 비공개 전환/삭제로 무효해진 quiz_id를
  거르는 책임은 서버가 아니라 프론트엔드(`OmakaseTab.jsx`)에 있음 — 이미 불러온 공개 퀴즈
  목록(`/api/user-quizzes`)과 대조해서 존재하는 항목만 퀴즈함에 채우고, 못 찾은 항목 수만큼 안내
  문구를 보여준다. **프리셋 관리 웹 페이지(`/프리셋관리` 명령어, 2026-08-20 신설)**: 위
  저장/불러오기/삭제와 별개로 이름변경/항목 개별 제거/**퀴즈 추가**까지 지원하는 전용 페이지 —
  `PUT /api/random-quiz-presets/:preset_id`(이름변경, `updateRandomQuizPresetName` 재사용)/
  `PUT .../items`(항목 목록 통째 교체, 신규 `replaceRandomQuizPresetItems` — "추가"도 최종 목록을
  계산해서 이 엔드포인트로 보내는 방식)/`DELETE .../items/:quiz_id`(항목 하나 제거,
  `deleteRandomQuizPresetItem` 재사용, 디스코드 "프리셋 관리" 화면과 동일 함수) 3개 라우트 추가. 이
  라우트들도 `requireWebSession`만 사용(스코프 제한 없음, 위와 동일 근거). `bot.js`의
  `preset_manage_handler`가 owner-scoped 세션(`create_owner_session`, `mode:'preset_manage'`)을 발급받아
  `/presets?token=...` Link 버튼 하나만 응답하고 끝 — `/퀴즈만들기`(아래 항목)와 달리 **`UIHolder`를
  전혀 만들지 않아 DM 강제가 없다**(Link 버튼은 discord.js가 인터랙션 없이 바로 브라우저로 여는 URL
  버튼이라 후속 인터랙션 자체가 발생하지 않고, 그래서 "어느 클러스터가 후속 인터랙션을 받는가" 문제가
  애초에 생기지 않음 — 아래 `/퀴즈만들기`가 DM을 강제하는 이유와 대조). 프론트엔드는 `editor.html` 계열과
  대칭되는 신규 Vite 진입점 `presets.html`/`presets-main.jsx`/`PresetManagerApp.jsx`(디스코드 쪽
  `quiz_ui/CLAUDE.md`엔 없음 — 이 페이지는 디스코드 UI 화면이 아니라 독립된 웹 전용 진입점이라 여기
  managers/CLAUDE.md에 기록). **스코어보드 웹 노출(2026-08-15 신설, `docs/plans/SCOREBOARD_SEASON_PLAN.md`)**:
  `GET /api/scoreboard`(쿼리 `season_id` 없으면 현재 시즌 — `scoreboard_season_manager`+
  `selectGlobalScoreboard`/`selectTop50Scoreboard`, 있으면 해당 시즌 아카이브 —
  `selectArchivedGuildScoreboard`/`selectArchivedTop50Scoreboard`)/`GET /api/scoreboard/seasons`
  (종료된 시즌 목록, 드롭다운용) 둘 다 `requireGuildScopedSession` 적용. DDL 미실행 상태에서도
  `selectSeasonList()`가 `undefined`→빈 배열로 안전하게 폴백해 크래시 없이 "시즌 없음" 상태로 보인다.
  **TOP50 노출(같은 날 후속)**: 원래 TOP10이었던 걸 사용자 요청으로 TOP50까지 확장(`selectTop10Scoreboard`→
  `selectTop50Scoreboard` 개명 포함) — 웹은 `ScoreboardPanel.jsx`가 배열을 그대로 스크롤 목록(`max-height`+
  `overflow-y`)으로 렌더링해서 추가 변경이 필요 없었지만, 디스코드는 embed 하나에 50줄을 다 못 욱여넣어
  `scoreboard-ui.ts`에 자체 페이지네이션(10개씩, prev/next 버튼)이 새로 생김 — 상세는 `quiz_ui/CLAUDE.md`.

## 기타

- **`ipc_manager.js`** — 클러스터 간 상태 동기화. `sync_objects`(Map, `guild_count`/`local_play_count`/`multi_play_count` 등 공유 값), `adaptRelayHandler`. `WEB_SESSION_REQUEST`(클러스터→마스터 요청-응답, `sendWebSessionRequest`)/`WEB_SESSION_SIGNAL`(마스터→전체 클러스터 브로드캐스트, `adaptWebSessionRelayHandler`)는 위 웹 연동용으로 `MULTIPLAYER_SIGNAL`과 대칭 구조로 추가됨(2026-08-08).
- **`monitoring_manager.js`** — CPU/메모리 주기 로깅(CSV 파일). `calculateAverageCpuUsage`는 순수 함수로 추출돼 테스트됨.
- **`tagged_dev_quiz_manager.js`** — 공식(개발자 제작) 태그별 퀴즈 데이터를 시작 시 메모리에 로드.
- **`user_quiz_info_manager.js`** — 유저 제작 퀴즈 CRUD. `UserQuizInfo`/`UserQuestionInfo` 클래스, `loadUserQuizListFromDB`/`loadQuestionListFromDBByTags`. `@Deprecated`였던 `UserQuizInfo.addLike`는 삭제됨(`DEPRECATED_CODE_REMOVED.md`). `loadUserQuizInfoById(quiz_id)`(퀴즈 선택 웹 연동 Phase 2, 2026-08-08 신설)는 `selectQuizInfoById` 결과를 `UserQuizInfo`로 조립 - question_list는 기존 관행대로 비워둠(UI의 `onReady()`가 나중에 채움). `loadOwnedUserQuizInfoById(quiz_id, creator_id)`(퀴즈 만들기 웹 연동 Phase 3, 2026-08-11 신설)는 동일 패턴이되 `db_quiz.ts`의 `selectOwnedQuizInfoById`를 써서 소유권까지 DB 레벨에서 강제(본인 비공개 퀴즈도 조회 가능) - `web/web_quiz_editor_routes.ts`의 `requireQuizOwnership`이 사용.
