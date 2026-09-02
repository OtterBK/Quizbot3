# 현재 진행 중 / 미착수 작업 통합 (2026-08-07 최초 작성)

> **새 세션은 이 문서부터 읽을 것.** 여러 계획 문서에 흩어진 "아직 안 끝난 것"만 모아서 요약한
> 진입점 문서 — 완료된 것은 `docs/COMPLETED_WORK_LOG.md` 참고. 각 항목의 상세 내역/코드 위치는
> 원본 문서에 그대로 남아있으니 링크를 따라갈 것(이 문서는 원본을 대체하지 않고 가리키기만 함).
>
> **원칙**: 이 문서에 있는 항목을 착수하기 전, 사용자에게 먼저 확인할 것(이번 계획에 이미 있는
> 문서별 확정 방침도 각 항목에 표시해둠 — "즉시 착수 가능"이 아니면 반드시 먼저 물어볼 것).

> **✅ 2026-08-29 멀티플레이 로비 관리자 강제삭제/영구밴 기능 구현 완료(코드/자동테스트 레벨만 —
> 실사용 미검증).** 사용자 요청: 문제 방제목(타 길드 비하/욕설 등) 로비를 관리자가 지울 방법이
> 없었음 — `/quizmgr`에 "🎮 로비 관리"(대기 중 로비 목록 → 상세 → 강제 삭제/삭제+방장 길드 영구밴)
> 신설. 조사로 기존 `CLIENT_SIGNAL.REQUEST_LOBBY_LIST`가 이미 필요한 정보를 다 반환하고 있음을
> 확인해 목록 조회는 재사용, 신규 신호는 강제 삭제(`ADMIN_FORCE_DELETE_LOBBY`) 1개만 추가 —
> `multiplayer_session.js`는 무수정. 상세는 `docs/COMPLETED_WORK_LOG.md` 2026-08-29 항목,
> `docs/TEST_CHECKLIST.md` N섹션 신규 항목. **다음 세션 실사용 검증 시**: 2개 이상 길드로 로비
> 생성 → 강제 삭제/영구밴이 참가 길드 화면과 밴 목록에 정상 반영되는지 확인할 것.

> **🔴 2026-08-13 사용자 확정, 최우선(아래 다른 항목들보다 먼저): 다음 세션은 `docs/TEST_CHECKLIST.md`
> 전수 테스트부터 시작.** B-8(랜덤 퀴즈 프리셋)까지 포함해 그동안 여러 세션에 걸쳐 쌓인 기능들이
> 코드/자동테스트 레벨로만 검증되고 실제 Discord+브라우저로는 확인 안 된 게 많이 쌓임(C~AE 섹션
> 기준 미확인 240개, 확인됨 100개 — 2026-08-13 시점). **착수 순서/범위는 새 세션에서 사용자와 다시
> 논의**(전체를 한 번에 다 하지 않고 섹션 단위로 나눠 진행할 가능성 높음) — 시작 전 이 문서와
> `docs/COMPLETED_WORK_LOG.md`를 먼저 읽고, `docs/TEST_CHECKLIST.md` 자체의 안내(재현조건/실제동작/
> 기대동작 형태로 버그 기록)를 따를 것. **주의**: `config/private_config.json`은 비밀 설정 파일이고
> 최근 세션에서 실수로 덮어썼다가 사용자가 직접 복구한 사고가 있었음(상세는
> `docs/COMPLETED_WORK_LOG.md` 2026-08-13 "세션 중 `config/private_config.json` 실수로 덮어씀" 항목) —
> 이 파일을 새로 만들거나 `npm run build`를 실행하기 전에 항상 먼저 사용자에게 확인할 것.

> **✅ 2026-08-14~15 `docs/TEST_CHECKLIST.md` 전수 재검증 완료.** A섹션부터 전체 재초기화(기존
> 확인됨 100개 포함 전부 `[ ]`로 리셋)해서 A~AE 전 섹션(30개)을 처음부터 다시 훑음 — 특수 환경이
> 필요하거나(2클러스터 강제 실행, force_take 라이브 레이스컨디션 2건) 아직 미구현인 기능(N섹션 악성
> 길드 강제퇴장) 4개만 남기고 전부 확인 완료. 발견한 버그/개선사항은 즉시 고치지 않고
> `docs/plans/TEST_CHECKLIST_BUG_LOG.md`에 기록만 해두는 방식으로 진행(사용자 결정 — 테스트 흐름 중
> 컨텍스트 전환 방지), 진행 자체를 막는 치명적 버그(`/신고처리` 죽은 코드)만 예외로 즉시 수정. 같은
> 기간 중 체크리스트 문서 자체도 정리 — 기능 영역별 목차 추가, 여러 섹션에 흩어져 있던 중복/죽은
> 항목 정리(2026-08-15). **다음 단계**: `docs/plans/TEST_CHECKLIST_BUG_LOG.md`에 쌓인 항목(버그 다수 +
> UX/문구 개선 다수)을 한꺼번에 수정하는 단계 착수 — 아래 B-9 참고.

> **✅ 2026-08-15 사용자 요청 3건(웹 안내 페이지 비주얼 개선/공지사항 정렬 안정화/quizmgr 공지 관리
> 기능) 구현 완료, 사용자 실사용 테스트까지 통과.** B-9 배치 수정 착수 전 별도로 들어온 ad hoc 요청 —
> 상세는 `docs/COMPLETED_WORK_LOG.md` 2026-08-15 항목(후속 "예시 영상" 필드 제거 포함).
> `docs/TEST_CHECKLIST.md` L섹션 "공지 관리 (신규)" + "웹 안내/공지사항" 항목 모두 `[x]` 확인 완료로
> 갱신됨.

> **✅ 2026-08-15 스코어보드 시즌 아카이브 + 웹 UI 노출 구현 완료(코드/자동테스트 레벨만 — 실사용
> 미검증).** 사용자 요청: 순위표 웹 UI 노출 + 과거 시즌 조회 지원. "시즌"이 이전엔 실제 데이터 모델
> 없이 고정 텍스트였다는 조사 결과를 사용자에게 알리고 구조 개선안을 제시, "둘 다 진행(추천)"으로
> 스코프 확정 — 신규 DB 테이블(`tb_scoreboard_season`/`tb_global_scoreboard_archive`) + Discord
> `ScoreboardUI` 시즌 선택 + quizmgr `AdminSeasonUI`(시즌 종료) + 웹 `ScoreboardPanel.jsx` 전부 구현.
> **DDL을 사용자가 dev/prod DB에 psql로 직접 실행하기 전까지는 시즌 관련 기능이 전부 "시즌 없음"으로
> 안전하게 폴백**(크래시 없음, 기존 스코어보드 동작은 그대로 유지) — 다음 세션 실사용 검증 전 DDL
> 적용 여부부터 확인할 것. 상세는 `docs/plans/SCOREBOARD_SEASON_PLAN.md`,
> `docs/COMPLETED_WORK_LOG.md` 2026-08-15 항목. `docs/TEST_CHECKLIST.md`에 AF섹션 신설(미확인).
> **같은 날 후속(실서버 실사용 중 발견)**: quizmgr 시즌 종료 모달 제출 시 크래시 나던 버그(async
> 핸들러가 Promise를 UI 인스턴스처럼 반환) 수정 완료 + 사용자 요청으로 TOP10→TOP50 확장(디스코드는
> 자체 페이지네이션 신설, 웹은 스크롤 목록으로만 대응) 완료 — 둘 다 `docs/COMPLETED_WORK_LOG.md`
> 같은 날 두 번째 항목 참고. 관리자/파괴적 액션 로깅이 매니저마다 들쭉날쭉하다는 점도 이 과정에서
> 발견됐으나 수정은 보류(전체 감사는 별도 논의 필요, 사용자에게 사실만 보고한 상태).
>
> **✅ 2026-08-19 위 로깅 감사 완료.** 사용자가 명시적으로 요청 — quizmgr(공지 작성/수정/삭제,
> 실시간 공지 수정, 점검 모드 켜기/끄기, 시즌 종료) 전부 원래 무로깅이었던 걸 확인하고
> `logger.info`/`logger.warn`을 추가, 어드민 UI 호출부가 `${interaction.user.tag}(${interaction.user.id})`
> 형태의 `actor`를 선택 인자로 넘겨 "누가 했는지"도 로그에 남게 함. 기존에 이미 로깅이 있던
> `ban_manager.js`도 같은 관례로 actor 인자를 추가(밴/언밴). 신고 처리 파이프라인(`report_manual_processing.ts`)
> 은 이미 자체 로그가 있어 그대로 둠. 상세는 `docs/COMPLETED_WORK_LOG.md` 2026-08-19 항목,
> `quizbot/managers/CLAUDE.md`의 각 매니저 항목. **같은 요청에서 나온 "공지 수정 모달이 기존 내용을
> 안 채워준다"는 지적은 코드 조사 결과 이미 세 군데(quizmgr 공지 게시판/점검 모드 문구/실시간 공지)
> 모두 `.setValue()`로 정상 프리필하고 있었음(스모크 테스트로 확인)** — 실제 버그가 아니라 사용자가
> 테스트한 배포본이 이 기능이 들어간 이후로 재빌드+재배포되지 않았을 가능성이 높음, 다음 배포 시
> `npm run build`부터 확인할 것.

> **✅ 2026-08-18~19 퀴즈함 관리+프리셋 UI 구현 완료(오마카세 한정) + 실사용 피드백 반영.** 사용자
> 요청: (1) 랜덤 퀴즈 퀴즈함 표시 25→50개 확장, (2) 웹에만 있던 프리셋(저장/불러오기/삭제) 기능을
> 디스코드에도 추가. 설계 중 메인 화면(`OmakaseQuizRoomUI`) 컴포넌트 행 예산이 5/5로 꽉 차는 문제를
> 발견해 **퀴즈함 관련 기능 전체를 독립 ephemeral 화면(`basket-manage-flow.ts`)으로 분리**
> (`QuizbotUI`/`UIHolder` 프레임워크 밖, `report_manual_processing.sendReportLog`류 기존 관행의 확장)
> — 구현 착수 시 멀티플레이 로비도 동일 로직을 복사해서 쓰고 IPC 브로드캐스트까지 필요해 더
> 위험하다는 걸 추가로 발견, 사용자와 상의해 **오마카세만 이번에 진행, 멀티플레이는 별도 작업으로
> 명시적으로 미룸**(`BASKET_CACHE`도 완전 제거 대신 멀티플레이 쪽만 유지). 방장 권한 모델은 프리셋
> 관리(이름변경/항목제거) 추가 → 프리셋 100개까지 페이지네이션 확장 → **실사용 테스트로 버그 2건
> 발견 후 수정**(①"불러오기"/"프리셋 관리" 클릭 시 `DiscordAPIError[40060]` — `explicit_replied`를
> 첫 `await` 전에 설정하도록 수정, ②방장 아닌 유저가 "퀴즈함 보기" 자체를 못 누름 — `bot.js`에
> Public UI 소유자 제한 예외 목록(`PUBLIC_UI_OWNER_CHECK_EXEMPT_PREFIXES`) 신설) → **권한 모델
> 최종 조정**(라이브 퀴즈함을 실제로 바꾸는 액션(항목 제거/불러오기)만 방장 전용, 조회와 "프리셋으로
> 저장"은 방장 여부 무관 누구나 가능) 순으로 여러 라운드를 거쳐 확정. 상세는
> `docs/plans/QUIZ_BASKET_PRESET_UI_PLAN.md`, `docs/COMPLETED_WORK_LOG.md` 2026-08-18 항목(다섯 번째
> 후속까지). `docs/TEST_CHECKLIST.md` AG섹션은 이 최종 권한 모델 기준으로 갱신됨(버그 2건은 수정
> 완료 표시, 그 외 항목은 실사용 미검증). `docs/plans/DISCORD_UI_SEPARATION_AUDIT_PLAN.md`(방법론+1차
> 예비 후보 목록만, 실제 순회는 미착수)는 별도로 계속 대기 중.
>
> **✅ 2026-08-19 멀티플레이 로비 이식 완료(코드/자동테스트 레벨만 — 실사용 전혀 미검증).** 사전 조사로
> 확인한 구조적 차이 3가지(방장 판별이 멤버 단위가 아니라 길드 단위여야 함 — 사용자가 직접 지적한
> "방장 본인이 참가 길드로도 참가하면 권한이 새는" 시나리오 포함, 상태 동기화가 IPC 브로드캐스트
> 기반이어야 함, 호스트 로비 컴포넌트 행 예산이 이미 5/5라 압축이 필수)를 전부 반영해서 재설계 —
> `basket-manage-flow.ts`를 오마카세/멀티 공용으로 그대로 재활용(코드 중복 없음, `is_host` 판별에
> `room_ui.readonly !== true` 조건만 추가, 상태 동기화는 `syncRoomUI` 헬퍼가 `room_ui.sendEditLobbySignal`
> 존재 여부로 duck typing 분기). 이식으로 구 `BASKET_CACHE`/`basket_select_component` 계열 메커니즘의
> 마지막 소비처가 사라져 전부 삭제(원문은 `docs/archive/DEPRECATED_CODE_REMOVED.md`). 상세는
> `docs/COMPLETED_WORK_LOG.md` 2026-08-19 항목, `docs/TEST_CHECKLIST.md` AG섹션에 멀티플레이 전용
> 체크리스트 신설(호스트/참가 길드 권한 분기, "같은 계정으로 참가 길드 참가" 핵심 회귀 시나리오, IPC
> 브로드캐스트 동기화 확인 등). **다음 세션 후보**: ① AG섹션 전체(오마카세+멀티 둘 다) 실사용 검증 —
> 특히 멀티는 실제 멀티 서버 환경에서만 확인 가능한 시나리오가 있어 우선순위 높음, ②
> `DISCORD_UI_SEPARATION_AUDIT_PLAN.md` 기준 `quizbot/quiz_ui/` 전수 순회.

> **✅ 2026-08-12 사용자가 다음 세션 착수 순서를 확정, 같은 세션 중 재조정.** 원래 순서(B-1이
> 2번)에서 사용자가 "B-1은 마지막에 하고 다른 작업부터"로 재조정함 — 아래가 현재 순서(순서 자체가
> 확정 사항 — 바꾸려면 사용자에게 먼저 확인):
> 1. ~~**[코드 수정] `basket_items` 소유권/공개여부 검사 추가**~~ — ✅ 완료(같은 날, 이 세션).
>    상세는 `docs/COMPLETED_WORK_LOG.md` 2026-08-12 "`basket_items` 소유권/공개여부 검사 추가" 항목.
> 2. ~~**[사용자 논의 필요] 11. MMR 개선 / 12. 랜덤 추첨 알고리즘 평가**~~ — ✅ 완료(같은 날, 이 세션,
>    범위는 사용자와 논의해 축소 — MMR은 비대칭 캡 제거만, 추첨은 깨진 셔플 수정만). 상세는 아래 B-2
>    항목 하단 및 `docs/COMPLETED_WORK_LOG.md` 2026-08-12 항목.
> 3. ~~**[결정 필요] UI 개선 [P1] 남은 2건**~~ — ✅ 완료(같은 날, 이 세션). 남은 [P1]은 B-5 밴 메시지
>    문구 1건뿐이었음 — 수정 완료. 상세는 아래 B-4 항목 및 `docs/COMPLETED_WORK_LOG.md` 2026-08-12 항목.
> 4. **[결정 필요] UI 개선 [P2] 대표 항목들** — 같은 문서, 착수 순서는 사용자와 논의. **일부 완료
>    (2026-08-12, 같은 세션)**: 사용자가 직접 지정한 B-1 전체 4항목 + B-4 2항목 + B-7 1항목 완료 —
>    상세는 아래 B-4 항목 및 `docs/COMPLETED_WORK_LOG.md` 2026-08-12 항목. 나머지 [P2]/[P3]는 여전히
>    미착수.
> 5. **[결정 필요] UI 개선 [P3]** — 같은 문서, 우선순위 가장 낮음. (4번과 일부 겹쳐 같이 진행됨 — 위 참고)
> 6. **[결정 필요] B-1. 문제 일괄 등록** — 아래 B-1 항목, `docs/plans/B1_BULK_IMPORT_EXPORT_TODO.md`의
>    3가지 결정부터. (2026-08-12 사용자가 마지막 순서로 재조정)
>
> 6번은 "사용자와 먼저 논의/결정"이 선행돼야 함 — 시작 전 반드시 확인할 것. 종합 배경은 `docs/plans/
> DEVELOP_V3_5_CHANGES_REVIEW.md`(develop-v3.5 전체 변경사항 리뷰 문서, 참고용).

> **✅ 2026-08-12 `auto_script/` 운영 스크립트 개선 완료 (같은 날 후속 세션).** 저장소 주소 수정(옛
> `OtterBK/Quizbot3` → `OtterBK/discord-quizbot-v2`) + 브랜치 선택 설치 + `npm run build` 자동화 +
> systemd 데몬화(`quizbot3.service`, cron의 하루 2번 stop/start와 충돌 없게 `Restart=on-failure`)까지
> 전부 구현. 착수 확인 중 "지금 운영 서버는 TS 마이그레이션 이전 구코드가 배포된 상태"라는 더 심각한
> 사실을 발견 — 곧 GCP 신서버를 `develop-v3.5` 기준으로 재구축할 예정이라 그에 맞춰 설계함. **아직
> 실제 신서버에 설치해보는 실사용 검증은 안 함** — 다음 서버 생성 시 최우선 확인. 상세는
> `docs/COMPLETED_WORK_LOG.md` 2026-08-12 "`auto_script/` 운영 스크립트 개선 구현 완료" 항목,
> `docs/plans/SERVER_SCRIPT_IMPROVEMENT_PLAN.md`.

---

## A. 보류 중 (조건 충족 전까지 착수 금지)

- **A-3 6단계: `multiplayer_*` 전체 TS 전환** — 실전 대결(2개 이상 길드) 테스트가 끝나기 전까지 보류.
  상세: `docs/plans/TS_MIGRATION_AND_CONVENIENCE_PLAN.md` A-3 표.
- **다국어(i18n) 지원** — 순수 설계 문서 단계, **코드 미수정, 사용자가 명시적으로 지시하기 전까지 착수 금지**.
  착수 전 사용자가 정해야 할 것 3가지(동시 다국어 vs 언어 통째 교체 / locale 저장 단위 / 실제 2번째 언어)는
  `docs/plans/I18N_ARCHITECTURE_PLAN.md` 5장 참고.

---

## B. 설계/결정 완료, 착수만 하면 됨

### B-0. 퀴즈 선택 웹 연동 (신규, 2026-08-08 설계+UI 목업 완료)

디스코드 채널 잠금 + 임시 토큰 기반 웹 프론트엔드에서 퀴즈를 검색/선택하는 기능. 아키텍처 결정(마스터
프로세스에 세션 상태, 기존 멀티플레이 IPC 브로드캐스트 패턴 재사용 등), 오마카세 퀴즈의 실제 구조(공식
장르+유저 장르모드/바구니모드 이원 구조) 조사, UI 목업까지 전부 끝났음 — 상세는
`docs/plans/WEB_INTEGRATION_PLAN.md`, 승인된 화면은 `docs/mockups/WEB_UI_MOCKUP.html`(브라우저로 직접 열기).

**네이밍 변경 2건 처리 완료** (2026-08-08): "장바구니"→"퀴즈함", "오마카세 퀴즈"→"랜덤 퀴즈" 둘 다
디스코드 쪽 사용자 노출 문구까지 변경(내부 변수/클래스명은 유지) — 상세는 `docs/plans/WEB_INTEGRATION_PLAN.md`
해당 섹션.

**Phase 0(인프라 스켈레톤) + Phase 1(공식 퀴즈 웹 선택) 완료** (2026-08-08): IPC 메시지 타입 2개,
마스터 `web_session_manager.ts`, Express API(세션 인증/dev-quizzes 트리/select/confirm),
`WebHandoffUI`(dev 모드), 하이재킹 방어(force_take), React+Vite 프론트엔드(공식 퀴즈 탭 완전 동작,
승인된 CSS 그대로 이식).

**1차 실사용 테스트 → 버그 3건 발견 → 근본 원인 재설계까지 완료** (2026-08-08, 같은 날): "선택 완료"가
토큰을 즉시 파기해서 확정 후 재선택/문제 수 재조정이 전부 막혔던 문제. 응급 수정 대신 토큰 파기 시점을
"퀴즈 실제 시작"/"UIHolder 소멸"로 옮기고 `DevQuizInfoUI`가 직접 웹 신호를 받도록 재설계해서, **확정
후에도 웹에서 계속 재선택 가능**하게 만듦(`web_session_manager.ts`의 `apply`/`release` 액션 분리 +
`UIHolder.free()`/`handleStartQuiz`의 조용한 정리 훅 — 고아 토큰 방지까지 포함). 상세 설계는
`docs/plans/WEB_INTEGRATION_PLAN.md` 5-1 "토큰 생명주기".

**재설계 직후 순환 require 크래시 발견 → 수정 완료** (2026-08-08, 같은 날): 실사용 테스트로 퀴즈1 확정
→ 퀴즈2로 재선택 시 `dev-quiz-select-ui.ts`↔`dev-quiz-info-ui.ts` 순환 require 때문에 크래시(자세한
내용은 `docs/plans/WEB_INTEGRATION_PLAN.md`의 `dev-quiz-info-ui.ts` 항목). require를 함수 안으로 미뤄서
수정, 회귀 테스트(`test/quiz_ui/dev_quiz_web_reapply.test.js`) 추가 — fix를 일부러 되돌려서 같은 에러가
재현되는 것까지 확인 후 커밋.

**✅ 2026-08-08 실사용 재검증 완료**: 사용자가 실제 봇으로 기본 흐름(잠금→선택→확정→`DevQuizInfoUI`
전환) + 확정 후 다른 퀴즈로 재선택까지 정상 동작 확인함. `docs/TEST_CHECKLIST.md` O 섹션에 확인된
항목 `[x]` 표시 완료.

**Phase 1은 핵심 흐름 기준으로 안정화됨.** 남은 미확인 항목(문제 수만 재변경/뒤로가기 스택/퀴즈 시작
후 세션 종료/하이재킹/GC 만료/고아 토큰 방지/다크모드) — 급하지 않으면 다음 세션 초반에 짧게 훑고
Phase 2(유저 퀴즈 웹 선택)로 넘어가면 됨. `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(247
pass)/`npm run build`(백엔드+프론트엔드 둘 다) 전부 통과.

**✅ 2026-08-08 투트랙 진입점 분리 완료 (Phase 2 착수 직전 반영)**: 사용자 요청으로 "기존 디스코드 UI
완전 대체"가 아니라 "디스코드 UI/웹 UI 투트랙" 구조로 바뀜. `/퀴즈` 직후 곧장 `MainUI`를 띄우던 것을
`SelectUIModeUI`(신규, 디스코드 UI/웹 UI 2버튼)가 먼저 뜨도록 변경 — 디스코드 선택 시 `MainUI`부터
웹 연동 이전과 100% 동일(`select-quiz-type-ui.ts`의 '공식 퀴즈' 분기도 `DevQuizSelectUI`로 원복), 웹
선택 시 `MainUI`/`SelectQuizTypeUI`를 건너뛰고 `WebHandoffUI('dev')`로 바로 진입. mode는 여전히 'dev'
고정(사용자 확인: "DEV모드 하나만 동작하는게 맞음") — 세션을 dev/user/omakase 자유 전환 가능하게 만드는
재설계는 Phase 2/3 착수 시 실제 백엔드가 붙을 때 같이 함. 상세는 `docs/plans/WEB_INTEGRATION_PLAN.md` "8.
투트랙 진입점 분리". `docs/TEST_CHECKLIST.md` O 섹션에 진입점 변경으로 재검증 필요한 항목 표시함(우선
순위 낮음 — `WebHandoffUI` 내부 로직 자체는 안 바뀜). 검증: `npx tsc --noEmit`/`npm run lint`/`npm test`
전부 통과(component export 개수 63→64 갱신 포함), **아직 실제 봇으로 두 트랙 수동 테스트 안 함**.

**✅ 2026-08-08 Phase 2(유저 퀴즈 웹 선택) 완료**: `select-ui-mode-ui.ts`의 "웹 UI" 버튼이 만드는
`WebHandoffUI`가 이제 dev/user 두 모드를 한 세션에서 오갈 수 있음 — 세션 생성 시 고정되던 `mode` 대신
`WebHandoffUI.handleApplied`/`/api/session/confirm`이 **요청/payload의 `mode` 필드**로 분기하도록
일반화(`web_session_manager.ts`는 원래 스테이트리스라 변경 불필요). 신규 DB 헬퍼
`selectQuizInfoById`/`loadUserQuizInfoById`(quiz_id 단건 조회, 기존엔 없었음), Express
`GET /api/user-quizzes`(목록+`QUIZ_TAG` 태그)/`GET /api/user-quizzes/:quiz_id`(상세+실제 문제 수),
`UserQuizInfoUI.onReceivedWebSessionSignal`(dev와 동일 패턴, DB 조회 때문에 비동기),
프론트엔드 `UserQuizTab.jsx`(검색+태그 AND 필터+인증 토글+정렬+카드 그리드, 목업 디자인 그대로 이식) +
`App.jsx`(탭 잠금을 `session.mode` 비교에서 `AVAILABLE_MODES` 상수로 변경, user 탭 활성화). 상세는
`docs/plans/WEB_INTEGRATION_PLAN.md` "단계별 구현 순서" 4번. 검증: `npx tsc --noEmit`/`npm run lint`(0
error)/`npm test`(260 pass)/`npm run build`(백엔드+프론트엔드) 전부 통과. **미검증**: 투트랙 진입점
분리 + Phase 2 전체를 아직 실제 Discord+브라우저로 안 돌려봄 — `docs/TEST_CHECKLIST.md` O/P 섹션
참고, 다음 세션 최우선.

**✅ 2026-08-08 Phase 2 피드백 3건 반영**: (1) 유저 퀴즈 목록 카드에 `simple_description`(한줄 소개)이
안 보이던 문제 — 기존 디스코드 `user-quiz-select-ui.ts`가 목록에서 제목과 함께 한줄 소개를 보여주는
관행을 웹 카드에도 반영(`card-desc` 신설). (2) 상세 패널이 문제 수/좋아요만 보여주고 있던 걸
`user-quiz-info.ui.ts`의 `refreshUI()` 기준으로 정보 전체 복원 — 썸네일 이미지, 한줄 소개, 태그 칩,
전체 설명, 플레이한 서버/만들어진 날짜/업데이트 날짜 통계 추가(Express `GET /api/user-quizzes/:quiz_id`
응답에 `played_count`/`birthtime`/`modified_time` 필드 추가). (3) 운영 반영 전 프로덕션에 부적절한
개발용 문구 제거 — `App.jsx`의 "토큰은 history.replaceState로 마스킹됩니다" 하단 문구 삭제, "다음
체크포인트(Phase 3)에서 연결될 예정이에요" 같은 내부 로드맵 용어를 "곧 추가될 예정이에요"로 순화.
검증: `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(260 pass, `/api/user-quizzes*` 응답의
신규 필드 검증 테스트 보강)/`npm run build`(백엔드+프론트엔드) 전부 통과.

**✅ 2026-08-08 Phase 3(랜덤/오마카세 퀴즈 웹 선택) 완료**: omakase payload는 DB 조회가 필요 없는 작은
데이터(태그 비트마스크/인증필터/퀴즈함/문제 수)라 dev 모드처럼 전부 동기로 처리 — `WebHandoffUI.
handleApplied`의 `'omakase'` 분기(`buildOmakaseQuizInfoUI`), `OmakaseQuizRoomUI`에 `static
applyWebPayloadToQuizInfo`/`static buildOmakaseQuizInfoFromWebPayload`(dev-quiz-select-ui.ts와
동일 패턴의 공유 헬퍼) + `onReceivedWebSessionSignal`(재선택 지원, 같은 인스턴스 갱신) 추가. Express
`GET /api/omakase-tags`(DB 없이 `DEV_QUIZ_TAG`/`QUIZ_TAG` config를 유형/장르로 분류해 노출,
`omakase_components.ts`의 태그 select 메뉴와 동일한 분류 규칙 재사용), `/api/session/confirm`에
`mode:'omakase'` 분기(문제 수 고정 상한 100 클램프). 프론트엔드 `OmakaseTab.jsx` 신설 — 공식 장르
칩 + 유저 퀴즈 모드 전환(장르로 뽑기/직접 담기) + 유형·장르 칩 + 인증 필터 + 퀴즈함 브라우징(`/api/
user-quizzes` 재사용) + 🍱 FAB+드로워(퀴즈함 25개 제한 없이 자유롭게 담기 가능함을 안내) + 우측
"설정 요약" 카드. `UserQuizTab.jsx`와 공유하는 카드 헬퍼는 `quizCardUtils.js`로 분리. `App.jsx`의
`AVAILABLE_MODES.omakase`를 `true`로 변경 — 세션 mode 개념은 Phase 2에서 이미 일반화해둬서 추가
설계 변경 없이 바로 적용 가능했음. 상세는 `docs/plans/WEB_INTEGRATION_PLAN.md` "단계별 구현 순서" 5번.
검증: `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(267 pass, omakase 신규 테스트 21건
포함)/`npm run build`(백엔드+프론트엔드) 전부 통과. **미검증**: 아직 실제 Discord+브라우저로 안
돌려봄 — `docs/TEST_CHECKLIST.md` Q 섹션 참고, 다음 세션 최우선.

**✅ 2026-08-10 Phase 4(멀티플레이 퀴즈 웹 연동) 설계+코드 구현 완료, 같은 세션**: 진입점은 `/멀티퀴즈`를
안 건드리고 기존 `/퀴즈`→웹UI 트렁크에 4번째 탭 추가(사용자 결정 — 디스코드/웹은 처음부터 갈라져야
한다는 기존 원칙 유지). "착수 전 확인 체크리스트" 4개 항목을 먼저 확인(대기실 목록은 마스터가 IPC 왕복
없이 인프로세스로 직접 서빙 가능함을 코드로 확인, `createLobby`/`tryJoinLobby`의 interaction 의존이
예상보다 깊어(모달 필드 읽기 + `interaction.reply()` 둘 다) 사용자에게 대응 방식 확인 후 페이로드
직접 대입 + 신규 static 헬퍼로 구현) → 곧장 구현 착수. `index.js`(마스터 ban_manager 초기화),
`web_express_app.ts`(`GET /api/multiplayer-lobbies`, `/api/session/confirm` mode:multiplayer),
`web-handoff-ui.ts`(`buildMultiplayerUI` - 밴/음성채널 체크 재현 후 어댑터로 `MultiplayerQuizLobbyUI`
직접 생성), `multiplayer-quiz-lobby-ui.js`(웹 payload 적용 static 헬퍼 + `is_web_origin` 분기 +
`onReceivedWebSessionSignal`), `web-frontend/src/MultiplayerTab.jsx`(신규, 대기실 목록→생성 폼→완료
3단계) 전부 완료. 구현 중 `multiplayer-quiz-lobby-ui.js`의 기존 하드코딩된 `.js` require 경로가
`web-handoff-ui.ts`를 직접 require하는 다른 mode 테스트를 ts-node에서 깨뜨리는 걸 발견해 지연 require로
수정(회귀 없음, 267 pass 유지). `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(267 pass)/
`npm run build`(백엔드+프론트엔드) 전부 통과. **알려진 한계**(다음 세션 참고, 상세는
`docs/plans/WEB_INTEGRATION_PLAN.md` Phase 4 "알려진 한계"): 확정 응답이 실제 성공 여부와 무관하게 항상
`{success:true}`(비동기 처리라 실패는 디스코드 채널에서만 안내됨), 생성 폼은 실시간 미리보기 없이
확정 시에만 반영. **미검증** — 아직 실제 Discord+브라우저로 안 돌려봄(참가/생성/음성채널 체크/재확정/
2클러스터 이상 IPC 왕복 전부), 다음 세션 최우선.

**✅ 2026-08-10 Phase 4 실사용 피드백 6건 수정, 같은 세션**: 사용자가 실제 브라우저로 테스트해 위
"미검증" 항목 중 여러 개가 실제 버그였음을 발견 — 가장 심각했던 건 밴/음성채널 체크 실패 시
`this.goToBack()`을 불러 `WebHandoffUI` 자신이 사라져버려서, 최초 실패(음성채널 미접속) 이후엔
웹에서 아무리 재시도해도 완전히 먹통이 되던 문제(`goToBack()` 제거 + `this.last_error`로 화면 유지한
채 실패 사유 표시). 웹에도 진짜 에러가 뜨도록 `report_multiplayer_result`/`GET /api/multiplayer-result`
(1회성 폴링 채널) 신설. 로비 생성 후에도 웹에서 계속 설정을 바꿔 재확정 가능하도록 프론트엔드 수정(백엔드
`onReceivedWebSessionSignal`은 이미 지원 중이었음, 프론트가 활용을 안 하고 있었을 뿐). 새로고침 버튼/
방 제목 입력칸 스타일도 앱 디자인 시스템에 맞춤. 상세는 `docs/COMPLETED_WORK_LOG.md`, 알려진 잔여
한계는 `docs/plans/WEB_INTEGRATION_PLAN.md` Phase 4. 검증(`tsc`/`lint`/`test` 267 pass/`build` 백엔드+
프론트엔드) 전부 통과. **여전히 미검증** — 이번 수정 자체를 포함해 실제 Discord+브라우저 테스트 전무,
특히 "실패 후 재시도" 케이스가 다음 세션 최우선(`docs/TEST_CHECKLIST.md` R 섹션).

**✅ 2026-08-10 Phase 4 추가 피드백 4건(퀴즈함 FAB 누락/문제 수 20개 미만 확정 가능/참가 후 목록복귀
버튼/버튼 레이아웃) + 전역 강조색 gold→blue 변경, 같은 세션**: 상세는 `docs/COMPLETED_WORK_LOG.md`.
색상 변경은 4개 탭 전부에 영향 — `docs/TEST_CHECKLIST.md` S 섹션(신설) 참고. 검증 전부 통과, 실사용
재검증은 여전히 안 함.

**Cloudflare Tunnel 배포**는 `docs/plans/WEB_INTEGRATION_PLAN.md`에서 여전히 "추후 논의"로 남겨둔 상태(사용자가
명시적으로 지시하기 전까지 착수 금지는 아니지만, 별도 논의 없이 진행하지 않음).

**✅ 2026-08-09 UX 피드백 6건 반영** (프론트엔드만, 백엔드 변경 없음): (1) 랜덤 퀴즈 퀴즈함 브라우징
카드 클릭이 바로 담기/빼기로 동작하던 걸 "클릭=상세 정보 미리보기, 전용 버튼으로 담기/빼기"로 변경
(`OmakaseTab.jsx`). (2) 공식 퀴즈 장르 선택 가시성 개선 — 강조 카드(`section-block.accent`, 골드
액센트) + 선택 개수 배지 + 안내 문구 + 설정 요약 카드의 넛지("🎯 공식 퀴즈 장르도 추가해보세요" 클릭
시 해당 섹션으로 스크롤, 사용자가 3개 옵션 중 "강조카드+배지+넛지 셋 다"를 선택). (3) 퀴즈함 드로워
항목 클릭 시에도 상세 정보가 표시되도록 연결. (4) 상세 정보 패널을 제작자/한줄 소개/태그/상세 설명을
각각 `field-label`로 분리해서 표시하도록 재구성 — `UserQuizTab.jsx`/`OmakaseTab.jsx`가 공유하는
`QuizDetailCard.jsx` 컴포넌트로 추출(중복 제거 겸함). (5) 기본 테마를 `'system'`에서 `'light'`로
변경 — OS가 다크 모드인 사용자에게도 첫 진입은 항상 라이트로 보임(토글에서 수동으로 다크/시스템
선택 가능). (6) 목록을 한참 스크롤해도 상세/확정 패널이 안 보이던 문제 — `.detail-col`에
`position: sticky`(뷰포트 상단에 붙어 따라다님, 880px 이하 모바일 레이아웃에서는 비활성) 적용,
Dev/User/Omakase 세 탭 전부에 공통 적용됨. 검증: `npm run build`(프론트엔드) 통과, 백엔드는 변경
없어 재검증 불필요.

**✅ 2026-08-09 UX 피드백 8건 추가 반영** (프론트엔드만, 백엔드 변경 없음 — `react-markdown` 의존성
1개 추가): (1) 정렬 옵션이 디스코드 `sort_by_select_menu`(base_components.ts)와 안 맞던 문제 — 원래
없던 "이름순"이 생기고 "주간 인기순"/"최신순"/"오래된순"이 빠져 있었음. `quizCardUtils.js`에
`SORT_OPTIONS`/`compareQuizzesBySort`를 만들어 디스코드 6개 옵션(업데이트순/주간 인기순/전체
인기순/추천순/최신순/오래된순)과 정확히 맞추고, `UserQuizTab.jsx`/`OmakaseTab.jsx` 둘 다 이걸
공유하도록 통일(기존엔 탭마다 임의로 다른 부분집합을 썼었음). (2) 상세보기 태그를 작은 알약
(`mini-tag`) 대신 블록 느낌(`tag-block`, 상세보기 전용)으로 표현. (3) 상세 설명을 태그보다 위로
재배치. (4) 상세 설명에 마크다운 렌더링 추가(`react-markdown` — 결과를 React 엘리먼트로만 만들고
raw HTML을 꽂지 않아 유저가 입력한 설명에 악성 스크립트가 섞여 있어도 안전, `dangerouslySetInnerHTML`
사용 안 함). (5) "오마카세 설정 요약" → "랜덤 퀴즈 설정 요약"으로 문구 변경. (6) 설정 요약 카드 +
상세 미리보기 카드가 같이 쌓이면 sticky 영역이 뷰포트보다 커져 내용이 잘리던 문제 —
`.detail-col`에 `max-height: calc(100vh - 32px); overflow-y: auto;` 추가해 그 안에서만 스크롤되게
함. (7) 랜덤 퀴즈 퀴즈함 브라우징에 우클릭으로 담기/빼기 바로 토글 추가(좌클릭은 상세보기 유지 —
원래 승인된 목업의 상호작용 복원), 발견성을 위한 안내 문구도 추가. (8) 카드에 마우스를 올리고 잠시
기다리면(500ms) 플로팅 미리보기가 뜨는 hover preview 추가(`useHoverPreview` 훅 + `QuizHoverPreview.jsx`,
이미 목록에 있는 요약 정보만 써서 추가 API 호출 없이 즉시 반응) — `UserQuizTab.jsx`/`OmakaseTab.jsx`
둘 다 적용. 검증: `npm run build`(프론트엔드) 통과.

### B-5. 퀴즈 만들기 웹 UI 제공 (2026-08-11 설계 시작, 2026-08-12 Phase 0~5 전체 완료)

`/퀴즈만들기`(`createQuizToolUIHolder` 이하 전체 — `UserQuizListUI`→`UserQuizInfoUI`→
`UserQuestionInfoUI`)를 웹으로 옮기는 작업. `docs/plans/WEB_QUIZ_CREATION_HANDOFF.md`(인수인계, 완료)의
후속 세션에서 핵심 설계 결정 전부 확정 → Phase 0(UI 목업) → Phase 1~4(코드 구현) → Phase 5(폴리시+
통합 검증)까지 **전부 완료**. 잔여 작업은 `B-6`(아래) 참고.

**설계 확정 사항** (전체 Phase 0~5 계획): 세션은 guild가 아니라 owner_id(유저) 단위로 스코프
일반화(`web_session_manager.ts`의 `guild_id`→`scope_id` 리네임 포함), `/퀴즈만들기`에도 `SelectUIModeUI`와
동일한 디스코드/웹 투트랙 진입점 추가, `user-question-info-ui.ts`의 인터랙션-비의존 로직을
`quiz_editor_validation.ts`(신규)로 추출하며 실제로 리팩터, 이미지/오디오는 URL 입력만(파일 업로드
없음), 오디오 미리듣기는 ffmpeg 클립 대신 유튜브 `?t=` 타임스탬프 링크로 대체, REST는
`/api/my-quizzes`(신규 네임스페이스, 기존 `/api/user-quizzes`와 별개), 문제 CRUD는 디스코드 3-모달과
달리 단일 PUT/POST로 통합. 상세 배경/근거는 아래 두 플랜 파일에 전부 기록돼 있음(레포 바깥,
`C:\Users\wjswo\.claude\plans\`) — **Phase 1 착수 시 가장 먼저 이 내용을 `docs/plans/WEB_QUIZ_CREATION_PLAN.md`로
옮겨적을 것**(레포 안에 영구 보존, `docs/plans/WEB_INTEGRATION_PLAN.md`와 대칭되는 문서):
  - `gleaming-foraging-planet.md` — Phase 0~5 전체 상세 설계(조사에서 확정된 핵심 사실 6가지, 사용자
    확정 설계 결정 10가지, Phase별 구현 계획, Critical Files).
  - `elegant-plotting-crystal.md` — 위 내용을 옮겨적은 뒤 Phase 0 실행에 쓴 버전(이번 세션에서 승인받음).

**Phase 0(UI 목업) 완료**: `docs/mockups/WEB_QUIZ_CREATION_UI_MOCKUP.html`(신규, `docs/mockups/WEB_UI_MOCKUP.html`과
대칭) — 퀴즈 목록(유저 퀴즈 선택 화면과 동일한 그리드 카드 언어로 통일)/퀴즈 상세(썸네일 미리보기,
태그, 공개 토글)/문제 편집(디스코드 3모달과 동일하게 기본정보·힌트설정·정답공개 3탭 분리) 3화면 +
"실제 디스코드에선 이렇게 보여요" 미리보기(문제 출제 중/힌트 화면/정답 공개 3상태, 탭 전환과 연동)를
정적 HTML로 구현, 여러 차례 사용자 피드백 받아 반복(그리드 레이아웃 통일, 탭 가시성 개선, 힌트
자동생성 로직 정확도 수정 — `initialize.ts`의 `generateHint()`가 실제로 정답 기반 기본 힌트를
자동생성한다는 걸 코드 확인 후 반영, 오디오 최대 재생시간/WebP 제약 등 디스코드 모달 라벨 그대로
명시, 필수값 미입력 시 인라인 에러 표시 추가) 후 **최종 승인받음**. 코드/DB/세션 인프라는 전혀
안 건드림(승인 전 되돌리기 비용 없는 정적 데모).

**✅ 2026-08-11 Phase 1(세션 스코프 일반화 + 진입점 스켈레톤 + 구조 문서화) 완료, 같은 세션**:
`docs/plans/WEB_QUIZ_CREATION_PLAN.md` 신설(설계 원본 이관, `docs/plans/WEB_INTEGRATION_PLAN.md`와 대칭).
`web_session_manager.ts`가 guild/owner 두 스코프를 다루도록 일반화(`scope`/`scope_id` 필드,
`broadcast(guild_id,...)`→`broadcast(scope_id,...)` 리네임, `owner_token_map` +
`createOwnerScopedSession`/`releaseOwnerScopedSession`, `runGC`의 scope별 분기, `handleRequest`에
`create_owner_session`/`release_owner_session` 액션 — 상세는 `quizbot/managers/CLAUDE.md`).
`web_express_app.ts`의 `GET /api/session`이 `scope`/`scope_id`/`owner_name`도 반환하도록 확장(기존
`guild_id` 필드는 하위 호환으로 유지). `ui-system-core.ts`: `UIHolder.free()`가 PRIVATE 홀더면
`release_owner_session`도 추가 전송, `relayWebSessionSignal`이 `.scope_id`로 라우팅, 신규
`createQuizEditWebHandoffUIHolder`, `createQuizToolUIHolder`의 최초 화면이 `QuizEditSelectUIModeUI`로
교체됨. 신규 `quiz-edit-select-ui-mode-ui.ts`/`quiz-edit-web-handoff-ui.ts`(DM 전용이라 하이재킹 방어
없음 — 상세는 `quiz_ui/CLAUDE.md`). `config/system_setting.js`에 `MAX_QUESTIONS_PER_QUIZ: 50` 추가(교체는
Phase 2). 프론트엔드: `web-frontend/editor.html`+`editor-main.jsx`(Vite 멀티페이지 진입점),
`QuizEditorApp.jsx`(세션 부트스트랩 플레이스홀더, 기존 `api.js` 재사용), `vite.config.js`에
`build.rollupOptions.input` 추가, `react-router-dom` 의존성 설치(실사용은 Phase 3부터). 검증:
`npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(274 pass, 기존 `signal.guild_id` assert들을
`signal.scope_id`로 갱신 + owner-scope 신규 테스트 7건)/`npm run build`(백엔드 + 프론트엔드 index.html·
editor.html 둘 다) 전부 통과. **미검증** — 실제 Discord+브라우저로 아직 안 돌려봄(DM `/퀴즈만들기` 투트랙
분기, 웹 링크 세션 인증, GC 만료 등), `docs/TEST_CHECKLIST.md` 신설 섹션 참고, 다음 세션 최우선.

**✅ 2026-08-11 Phase 2(공유 검증 모듈 추출 + 디스코드 쪽 리팩터) 완료, 같은 세션**: 신규
`quizbot/managers/quiz_editor_validation.ts` — `parseAudioRangePoints`/`redefineRepeatCount`/
`parseUseAnswerTimer`/`isValidAudioUrl`/`isValidImageUrl`/`isDiscordCdnLink`/`canGoPublic` 순수 함수
7개. `user-question-info-ui.ts`(호출부 8곳 교체, 원본 메서드 2개 삭제, 매직넘버 50→
`MAX_QUESTIONS_PER_QUIZ` 3곳)/`user-quiz-info.ui.ts`(`quiz_toggle_public` 1곳)가 이 모듈을 호출하도록
전면 교체(동작 변경 없는 순수 이관 — 상세는 `quizbot/quiz_ui/CLAUDE.md`/`quizbot/managers/CLAUDE.md`).
신규 `test/managers/quiz_editor_validation.test.js`(21건, 경계값 전부). 검증: `npx tsc --noEmit`/
`npm run lint`(0 error)/`npm test`(295 pass)/`npm run build` 전부 통과. 웹 기능(REST 등)은 이 phase에
전혀 없음 — 순수 리팩터만.

**✅ 2026-08-11 Phase 3(퀴즈 메타데이터 REST CRUD) 완료, 같은 세션**: `db_quiz.ts`의
`selectOwnedQuizInfoById`/`user_quiz_info_manager.ts`의 `loadOwnedUserQuizInfoById`(소유권을 DB 레벨에서
강제하는 단건 조회). 신규 `quizbot/managers/web/web_quiz_editor_routes.ts`(`/api/my-quizzes` Express
Router) — 생성/목록/상세/수정/태그/공개토글/삭제 전부(`requireOwnerScopedSession`/
`requireQuizOwnership` 미들웨어 포함), 기존 디스코드 로직(`UserQuizListUI.addQuiz`/
`UserQuizInfoUI.editQuizInfo`/`editTagsInfo`/`quiz_toggle_public`)과 동일한 기본값/검증 규칙을 그대로
반영(글자수 서버 검증, 태그 알려진 비트 마스킹, 공개 전환 시 태그 필수 체크는 `quiz_editor_validation.
canGoPublic` 재사용). 프론트엔드: `web-frontend/src/editor/EditorApi.js`(신규 클라이언트)/
`QuizListPage.jsx`(목록+생성)/`QuizDetailPage.jsx`(메타데이터/태그/공개토글/삭제, 문제 목록은 검증
플래그만 보여주는 읽기 전용 placeholder) + `QuizEditorApp.jsx`에 `react-router-dom` 라우트 배선
(`/`→목록, `/quiz/:quizId`→상세). 검증: `npx tsc --noEmit`/`npm run lint`(0 error)/`npm test`(312
pass)/양쪽 `npm run build` 전부 통과. **미검증** — 실제 Discord+브라우저 테스트 전무, 다음 세션 최우선
(`docs/TEST_CHECKLIST.md` T 섹션에 Phase 3 항목 추가함).

**✅ 2026-08-11 Phase 3 UI 피드백 3건 반영, 같은 세션**: 퀴즈 상세 화면 우측에 `QuizDetailCard.jsx`
재사용한 실시간 미리보기 카드(썸네일 등 타이핑 즉시 반영) 추가, breadcrumb에 `←` 뒤로가기 버튼 추가,
`ThemeToggle`을 `App.jsx`에서 `ThemeToggle.jsx`로 분리해 `QuizEditorApp.jsx`도 공유(다크모드 강제되던
문제 해결, 기본값 라이트 유지). 프론트엔드 전용, 백엔드 무변경. `docs/TEST_CHECKLIST.md` U 섹션에 확인
항목 추가.

**✅ 2026-08-11 Phase 4(문제 CRUD REST + 프론트 문제 편집기, 가장 큰 phase) 완료, 같은 세션**:
`web_quiz_editor_routes.ts`에 문제 CRUD REST 4개 추가(POST/PUT/DELETE `.../questions[/:question_id]`,
POST `.../duplicate`) — `quiz_editor_validation.ts`(Phase 2)의 `parseAudioRangePoints`/
`redefineRepeatCount`를 그대로 재사용, `applyQuestionFields`/`validateQuestionFields` 헬퍼 2개 신설(POST는
전체 필드 반영, PUT은 body에 실린 필드만 partial 반영). 문제 단건 조회 DB 함수가 없어 매번
`loadQuestionListFromDB()`로 전체를 로드해 개수 체크/소속 확인에 씀. 프론트엔드: 신규
`QuestionEditPage.jsx`(디스코드 3모달을 탭 3개로 합친 단일 폼, 승인된 `WEB_QUIZ_CREATION_UI_MOCKUP.html`
레이아웃 그대로 구현 — 정답유형 세그먼트+OX/객관식 버튼, 이미지 `<img>` 직접 표시, 오디오는 유튜브
`?t=` 링크로 미리듣기 대체, cdn.discordapp.com 경고는 프론트에서 한 줄 로직 복제해 실시간 체크).
`QuizDetailPage.jsx`의 문제 목록 placeholder를 실제 추가/수정/복제/삭제 패널로 교체(삭제는 2클릭 확인,
복제 후엔 정렬 특성상 전체 재조회). 기존 CSS 클래스(`tabrail`/`mode-switch`/`tag-chip`/`tree-row`/
`icon-btn`/`switch-field`)만 재사용 — 신규 CSS 없음. 검증: `npx tsc --noEmit`/`npm run lint`(0 error)/
`npm test`(322 pass, 신규 10건)/양쪽 `npm run build` 전부 통과. **미검증** — 실제 Discord+브라우저 테스트
전무, 다음 세션 최우선(`docs/TEST_CHECKLIST.md` Phase 4 섹션 참고).

**✅ 2026-08-12 Phase 4 UI 피드백 4건 반영, 같은 세션**: 최초 구현이 승인된 Phase 0 목업의 설계
(문제 목록 카드 시인성/명시적 수정 버튼/유형·정답값·내용 태그로 구별/"실제 디스코드에선 이렇게
보여요" 실시간 미리보기)를 상당수 놓쳤던 걸 사용자가 지적 — 특히 미리보기 패널은 Phase 4 계획 수립
당시 "Phase 0 데모 전용"으로 잘못 스코프 아웃했던 것. 목업 JS 재검토 + 실제 코드(`question.ts`/
`correct_answer.ts`/`text_contents.json`) 대조 후 신규 공유 모듈
`web-frontend/src/editor/questionDisplay.jsx`(칩 표시 로직 + 3가지 디스코드 임베드 상태 시뮬레이션)로
이식, `QuizDetailPage.jsx`/`QuestionEditPage.jsx`/`styles.css`에 반영. 상세는
`docs/plans/WEB_QUIZ_CREATION_PLAN.md` Phase 4 섹션 하단. 검증: 양쪽 `npm run build` 통과(프론트엔드 전용).

**✅ 2026-08-12 Phase 4 UI 피드백 2차 9건 반영, 같은 세션**: 오디오 미리듣기를 새 탭 링크에서 지정
시작지점부터 바로 재생되는 유튜브 인라인 임베드로 교체, 문제 목록 행을 답/이미지/오디오 요약 한
줄(`q-summary`)로 재설계하고 검증 실패·구별 불가 문제는 행 배경을 연붉은색으로 경고, 유저 퀴즈
선택 UI와 동일한 인증 뱃지를 목록 카드/상세 카드(공유 컴포넌트라 양쪽 동시 적용) 양쪽에 추가,
정답 유형 전환 시 값이 사라지던 버그 수정(유형별 draft 보관), 저장해도 화면에 머물도록 변경(새
문제는 URL만 조용히 전환), breadcrumb에 문제 위치 표시, 이전/다음 문제 버튼 추가. 상세는
`docs/plans/WEB_QUIZ_CREATION_PLAN.md` Phase 4 섹션 최하단. 검증: 양쪽 `npm run build` 통과(프론트엔드
전용, 백엔드 무변경).

**✅ 2026-08-12 Phase 4 UI 피드백 3차 1건 반영, 같은 세션**: 문제 목록 행에서 "문제: 텍스트,이미지"
칩이 2차 피드백 때 q-summary와 중복이라며 숨겼던(`hideBasic`) 게 오히려 힌트/정답 칩과 비일관적이라는
지적 — `hideBasic` prop 자체를 제거하고 문제/힌트/정답 세 칩이 항상 다 뜨도록 원복. 검증:
`npm run build` 통과.

**✅ 2026-08-12 Phase 3/4 실사용 검증 완료 (다음 세션)**: `docs/TEST_CHECKLIST.md` U/V 섹션 전체를
실제 Discord+브라우저로 확인 완료(전부 `[x]`). 검증 중 발견한 버그 1건(OX/객관식 정답 미선택 시 서버
`invalid_answers`가 raw로 노출)은 같은 세션에서 수정+재검증 완료 — 상세는
`docs/plans/WEB_QUIZ_CREATION_PLAN.md` Phase 4 하단 "2026-08-12 Phase 3/4 실사용 검증 완료" 항목.

**✅ 2026-08-12 Phase 5(폴리시 + 통합 검증) 완료, 별도 세션**: 전체 회귀(`tsc`/`lint`/`test` 324
pass/양쪽 `build`) + 2클러스터 이상 강제 실행 환경에서 owner_id 기반 relay 검증(디버그 로그로
REACT/DROP 분기 실측 확인 후 로그 제거, `index.js` 임시 설정 원복) + GC 세션 만료 시나리오(15분 대기,
DM 잠금 자동 해제 확인) 전부 실사용 검증 완료. `close_owner_session`/"편집 중" 실시간 표시는 사용자
결정으로 이번엔 스킵(선택 항목, 필요해지면 별도 착수). "퀴즈 만들기 웹 UI" 전체(Phase 0~5)가 이걸로
마무리됨. 상세는 `docs/plans/WEB_QUIZ_CREATION_PLAN.md` Phase 5 섹션.

**✅ 2026-08-12 Phase 5 검증 중 사용자 피드백 2건 추가 반영, 같은 세션**: (1) 투트랙 선택 버튼(`/퀴즈`,
`/퀴즈만들기` 최초 화면)의 라벨이 그냥 숫자 `'1'`/`'2'`였던 걸 `'디스코드 UI'`/`'웹 UI'`로 변경(공유
컴포넌트 `base_components.ts`의 `select_ui_mode_btn_component` 한 곳 수정으로 두 화면 다 반영),
임베드 description의 중복 안내("1️⃣)/2️⃣)")도 같이 간소화. (2) "권한 가져오기"(force_take) 조사 중
실제 레이스 버그 발견 — 권한을 가져온 직후 예전 소유자의 UIHolder가 `free()`되며 보내는 `release`
IPC가 guild_id만으로 토큰을 지워서, 방금 발급된 새 소유자의 토큰을 즉시 무효화할 수 있었음.
`web_session_manager.ts`의 `releaseSession(guild_id, expected_token?)`에 토큰 일치 검사를 추가해
수정(회귀 테스트 2건 포함, `docs/plans/WEB_INTEGRATION_PLAN.md` 참고).

### B-6. 퀴즈 만들기 웹 UI 이후 추가 요청 3건 (신규, 2026-08-12)

Phase 5 마무리 중 사용자가 준 추가 요청 3건 — 위 두 건(투트랙 버튼 라벨, force_take 레이스 버그)은
바로 고쳤고, 나머지 1건(여러 갈래라 계획 문서로 분리)이 남음:

- ~~**서버 설정 화면 권한 검증 누락**~~ — 2026-08-12 플랜모드에서 사용자 확인: 서버의 아무나 옵션을
  바꿀 수 있는 건 버그가 아니라 **의도된 기존 동작**("어차피 퀴즈봇 관련 설정이라 가능하게 해뒀었음").
  권한 체크 도입 자체를 스코프에서 제외 — 디스코드/웹 둘 다 지금처럼 유지.
- **✅ 나머지 디스코드 전용 화면 웹 포팅 완료 + 실사용 검증 완료 (2026-08-12, 같은 세션)** — 퀴즈만들기
  안내 페이지/공지사항/서버 설정 3개를 "퀴즈 선택 웹"(App.jsx) 헤더 메뉴로 노출. 패치노트 탭은
  스코프 아웃(더 이상 안 씀). 구현 중 사용자 리뷰로 발견한 버그(서버 설정 저장 API가 DB 저장 실패
  여부와 무관하게 항상 `success:true`를 반환) 수정 + 성공/실패 배너 UI 추가, 메뉴 발견성 개선(아이콘
  전용 버튼 → "☰ 더보기" 라벨 + 공지사항 안 읽음 배지)까지 전부 사용자가 직접 실제 봇으로 확인
  완료(`docs/TEST_CHECKLIST.md` X 섹션 전체 `[x]`). 상세는 `docs/COMPLETED_WORK_LOG.md` 2026-08-12
  항목, 설계 배경은 `docs/plans/WEB_UI_REMAINING_SCREENS_PLAN.md`.

### B-7. 문제 미리보기 마크다운 지원 + 웹 API 보안 점검 — ✅ 완료 (2026-08-12, 별도 세션)

사용자가 다음 세션에서 진행하기로 한 작업 2건 — (1) 문제 편집 미리보기(`questionDisplay.jsx`)에
`QuizDetailCard.jsx`/`GuidePanel.jsx`와 동일한 `react-markdown` 패턴 적용, (2) 퀴즈 만들기 웹 API의
IDOR/SQL 인젝션/백엔드 검증/rate limiting 점검. 인수인계 문서(`docs/plans/
QUESTION_PREVIEW_AND_SECURITY_REVIEW_PLAN.md`)의 조사 결과를 재조사 없이 바로 착수해 **체크리스트
5개 항목(rate limiting → IDOR 라이브 검증 → 백엔드 검증 구멍 2개 → SQL 하드닝) 전부 완료**. 마크다운
미리보기도 함께 완료.

**✅ 같은 날 추가 심화 조사(사용자가 "정말 다 안전한거 맞지?" 재확인 요청)**: 원래 스코프(`/api/
my-quizzes`) 밖까지 웹에서 도달 가능한 모든 라우트를 데이터가 최종 소비되는 지점까지 따라가서
재검토 — **실제 SQL 인젝션 1건을 새로 발견해 수정**(`POST /api/session/confirm`의 `basket_items`가
서버 검증 없이 `db_quiz.ts`의 `WHERE quiz_id IN ${...}` 문자열 보간까지 도달할 수 있었음, `= ANY
($1::int[])` 파라미터화 + 호출부 정수 필터링으로 수정) + 미검증 텍스트가 공유 Discord embed에
반영되던 경미한 문제 1건도 수정(`POST /api/session/select`의 `title` 길이 제한 없이 그대로
반영되던 것, 60자로 자름). Rate limit 수치도 사용자 피드백으로 완화(조회 1초당 4→10회, 쓰기
1초당 3→8회). 상세는 `docs/plans/QUESTION_PREVIEW_AND_SECURITY_REVIEW_PLAN.md` 상단 추가 배너 참고.

상세는 `docs/COMPLETED_WORK_LOG.md` 2026-08-12 B-7 항목 참고. 검증: `tsc --noEmit`/`lint`(0 error)/
`test`(345 pass, rate limit 유닛테스트 4건 + IDOR 라이브 검증 테스트 2건 + basket SQL 파라미터화
회귀 테스트 3건 신규)/양쪽 `build` 전부 통과. **미검증** — 실제 Discord+브라우저 재검증은 안 함(보안
점검이라 코드/테스트 레벨이 핵심), 특히 오마카세/멀티플레이 장바구니 모드는 이번에 SQL 호출 방식이
바뀌었으니(`docs/TEST_CHECKLIST.md` Y 섹션에 추가) 다음 세션에 실제로 한 번 돌려서 정상 작동을
확인하는 걸 권장.

**✅ 완료 (2026-08-12, 같은 날 후속 세션) — `basket_items`에 소유권/공개여부 검사 추가**: SQL
인젝션은 막혔지만, `db_quiz.ts`의 `selectRandomQuestionListByBasket`이 `WHERE quiz_id =
ANY($1::int[])`뿐이라 `is_private` 필터도 소유권 체크도 없던 문제 — 짝 함수
`selectRandomQuestionListByTags`와 동일하게 `and is_private = false`, `and is_use = true` 추가.
착수 전 사용자가 "애초에 퀴즈함에 private 퀴즈를 담는게 불가능하지 않냐"는 전제를 확인해왔는데,
정상 프론트엔드 UI 흐름으로는 맞는 말이고 실제 공격 경로는 웹 API를 프론트엔드 없이 직접 호출하는
경우임을 설명하고 진행. 상세는 `docs/COMPLETED_WORK_LOG.md` 2026-08-12 항목 참고.

### B-8. 랜덤 퀴즈 프리셋 (웹 UI 한정, 2026-08-13 설계+구현 완료)

웹 UI("랜덤 퀴즈" 탭 직접 담기 모드)에서 자주 쓰는 퀴즈함(quiz_id 목록) 조합을 이름 붙여 저장/재적용하는
기능. 범위(퀴즈함 목록만 저장, 옵션은 항상 현재 설정 따름 / 유저 단위, 최대 10개), DB 스키마
(`tb_random_quiz_preset` + `tb_random_quiz_preset_item`, 연결 테이블 방식), DB 헬퍼/Express API
3개(`GET`/`POST`/`DELETE /api/random-quiz-presets[/:preset_id]`)/프론트엔드 UI(퀴즈함 드로워 상단
"저장된 프리셋" 섹션)까지 **전부 구현 완료** — 상세는 `docs/plans/RANDOM_QUIZ_PRESET_PLAN.md`. 검증은
`tsc`/`lint`/`test`(361 pass)/양쪽 `build`까지 — **실제 Discord+브라우저 검증만 남음**
(`docs/TEST_CHECKLIST.md` AE 섹션, 다음 세션 최우선).

### ✅ B-9. 전수 재검증(2026-08-14~15) 버그 로그 일괄 수정 — 완료 (2026-08-15)

`docs/plans/TEST_CHECKLIST_BUG_LOG.md`에 쌓인 14건 중 11건 수정, 2건 보류(설계 트레이드오프/재현
불안정, 사유는 로그에 기재), 1건(`config/private_config.json` JSON 파싱 오류)은 코드 버그가 아니라
편집 사고로 확인돼 사용자 확인 후 별도 처리. 실제 버그 3건(E섹션 랜덤퀴즈 크래시 — force stop 중
오디오 다운로드 await 레이스로 `option_data`가 null이 되는 문제, J섹션 `/quizmgr` 신고처리
UnhandledPromiseRejection — `explicit_replied`를 await 전에 안 세운 레이스, P섹션 웹 재선택 시 이미지
미표시 — embed edit 대신 강제 재전송 필요)와 Q섹션 태그 렌더링 누락(멀티플레이 탭도 동일 컴포넌트
공유라 같이 고쳐짐)까지 원인 특정 후 수정. 나머지는 트리비얼한 문구 삭제 4건 + UX 개선 5건(B 서버수
표시/봇공유하기/V 탭가시성·이어서추가·비공개안내/Q 퀴즈함 탭전환 유지). 상세는
`docs/plans/TEST_CHECKLIST_BUG_LOG.md`와 `docs/COMPLETED_WORK_LOG.md` 2026-08-15 항목. 검증:
`tsc`/`lint`(0 error, 기존 57 warning 수준)/`test`(362 pass)/양쪽 `build` 전부 통과, 로컬 봇
재빌드+재시작 완료.

### B-1. 문제 일괄 등록 (Export/Import)

`docs/plans/TS_MIGRATION_AND_CONVENIENCE_PLAN.md`의 B-1. 파일 첨부 방식으로 설계는 끝났지만, 착수 전
3가지 결정 보류 중(JSON 필드명 / Import 시 추가·교체 정책 / 검증 실패 메시지 상세도) —
`docs/plans/B1_BULK_IMPORT_EXPORT_TODO.md`에 옵션별 추천안과 함께 정리돼 있음. 착수 시 그 문서부터 열어서
사용자와 확정할 것.

### B-2. A-5/B-2/B-3'/B-4 전수 테스트 피드백 12건 — 10/12 완료(사용자 실제 검증까지 끝남)

2026-08-07 멀티플레이 포함 전수 테스트 중 발견. `docs/plans/POST_B_ROUND_TEST_FEEDBACK_TODO.md`에 코드
위치/원인까지 정리돼 있음. **1/4/5번(실동작 버그), 2/3/6/9/10번(UX·텍스트), 7/8번(webm seek 부정확 —
7번 실제 재생 경로/8번 미리듣기 경로)은 2026-08-08 수정 + 사용자 실제 봇 재생 검증까지 완료** — 상세는
`docs/COMPLETED_WORK_LOG.md` 참고.

**✅ 11/12 완료 (2026-08-12, 같은 세션)** — 상세는 `docs/COMPLETED_WORK_LOG.md` 2026-08-12
"MMR 비대칭 보정 + 랜덤 추첨 셔플 버그 수정" 항목.

- **11. MMR 시스템 개선** — 사용자 확인 결과 "점수 변동폭 부적절/실력차 미반영" 둘 다 지적, 판단 결과
  상대 길드의 MMR/전적을 아예 참조하지 않는 구조(Elo류 상대평가 아님)라 실력차 반영은 원래 안 됨을
  설명. 사용자가 "구조는 유지하고 비대칭만 보정"으로 결정 — `calcLoserMMR`의 `question_ratio`에만
  걸려있던 `Math.min(0.5, ...)` 캡(승자는 캡 없음, 이 비대칭 때문에 풀게임 패배가 최대 -40점밖에
  안 깎였음)을 제거해 승자와 동일 구조로 맞춤. 승률 보너스(강팀 스노우볼) 쪽은 이번엔 안 건드림 —
  결과 보고 필요하면 추가 조정.
- **12. 공식/유저 퀴즈 무작위 추첨 알고리즘 평가** — 사용자 확인 결과 "특정 퀴즈/문제 쏠림" 지적.
  판단 결과 원인 후보 2개 발견: (1) `ORDER BY RANDOM()`이 퀴즈 단위가 아니라 문제 단위로 균등해서
  문제 수 많은 퀴즈가 구조적으로 더 자주 나옴(쿼리 구조 변경 필요, 범위 큼 — **이번엔 미착수**),
  (2) `quiz_system/lifecycle/initialize.ts`의 `question_list.sort(() => Math.random() - 0.5)`가
  균등분포 안 나오는 잘 알려진 깨진 셔플 패턴(`tagged_dev_quiz_manager.ts`엔 이미 올바른 Fisher-Yates가
  있어 불일치했음). 사용자가 (2)만 먼저 고치기로 결정 — `shuffleArray`(Fisher-Yates)로 교체(3곳:
  Dev/Custom/Omakase 퀴즈 초기화 전부). (1)은 아직 미해결 — 다음에 다시 체감되면 퀴즈 단위 계층화
  샘플링(stratified sampling)으로 쿼리 구조 변경 검토.

### B-3. UI_IMPROVEMENT_PROPOSAL.md 잔여 2건 (1라운드)

거의 완료됐고 아래 2개만 이월됨 — 상세는 `docs/plans/UI_IMPROVEMENT_PROPOSAL.md` 1번/4번 항목.

- "옵션 설명 비대칭" — 태그 select 메뉴(QUIZ_TAG/DEV_QUIZ_TAG)마다 옵션 설명 문구를 새로 써야 하는
  콘텐츠 작업, 코드 변경은 없음.
- "자유 텍스트 예/아니오 → select/버튼 토글 전면 전환" — 3개 모달이 `customId`를 공유하는 기존 구조를
  건드려야 하는 큰 변경이라 보류(지금은 화이트리스트 판정 로직으로만 완화돼 있음).

### B-4. UI_IMPROVEMENT_PLAN_ROUND2.md 잔여 (2라운드 B번)

A번(실제 버그 7건)과 B번 일부(B-2/B-4/B-5/B-6의 [P1] 다수/B-10)는 완료. 나머지는 전부
`docs/plans/UI_IMPROVEMENT_PLAN_ROUND2.md`에 [P1]/[P2]/[P3] 우선순위 태그와 함께 섹션별로 정리돼 있음 —
화면/기능 단위가 크거나 설계가 더 필요해서 아직 손 안 댐.

**✅ 마지막 [P1] 항목도 완료 (2026-08-12)** — B-5의 밴 메시지 문구("당신 또는 이 서버가..."로 시작해
본인 밴인지 서버 밴인지 구분 안 되고 다음 행동 안내 없던 것)를 `multiplayer-quiz-select-ui.js`의
`checkMultiplayerBanMessage`로 교체(유저/길드 분리 검사 + 문의처 안내). 상세는
`docs/COMPLETED_WORK_LOG.md` 2026-08-12 항목. **남은 건 전부 [P2]/[P3]** — 나머지 전체 목록은 원본
문서의 B-1~B-10 섹션 참고. 착수 순서는 우선순위 태그 기준으로 사용자와 논의부터 시작할 것.

**✅ [P2]/[P3] 일부 완료 (2026-08-12, 같은 날, 사용자가 직접 항목 지정)** — B-1 전체 4항목(도움말/
온보딩 신설, 인터랙션 타임아웃 안내, `/퀴즈정리` 확인 절차, 메시지 심각도 이모지 구분), B-4의
"기본값으로 초기화" + "유사 정답 생성"/"정밀 오디오 자르기" 문구, B-7의 "[베타 시즌]" 하드코딩
이동까지 완료. 메시지 심각도 구분은 `bot.js` 범위로만 한정(전체 코드베이스 스윕은 범위가 커서
후속 과제로 분리), "[베타 시즌]" 이동도 그 문구 하나만(스코어보드 나머지 문구는 여전히 하드코딩)
— **이 "[베타 시즌]" 고정 텍스트는 2026-08-15 스코어보드 시즌 아카이브 기능으로 실제 시즌 이름으로
완전히 대체됨(위 배너 참고), 이 항목은 이제 히스토리로만 남음.**
상세는 `docs/COMPLETED_WORK_LOG.md` 2026-08-12 항목. **남은 건 B-1의 "메시지 입력 감지" 트레이드오프
설명 1건 + 원본 문서의 나머지 B-1~B-10 [P2]/[P3] 항목 전체** — 착수 순서는 우선순위 태그 기준으로
사용자와 논의부터 시작할 것.

---

## C. 진행 방식 메모 (2026-08-07, 다음 세션이 참고할 것)

- 완료된 작업의 상세 설명(무엇을 왜 어떻게)은 **커밋 메시지가 1차 기록**이다 — 계획 문서에는 완료 표시 +
  핵심 요약만 남기고, 자세한 배경은 `git log`/`git show`로 확인. 문서가 커밋 내용을 다시 길게 옮겨적지
  않는다.
- 같은 주제로 새 라운드(2라운드, 3라운드...)를 또 만들지 말 것 — 기존 계획 문서에 새 섹션을 추가하는
  방식을 우선 검토. (`UI_IMPROVEMENT_PROPOSAL.md`→`UI_IMPROVEMENT_PLAN_ROUND2.md`처럼 문서가 계속
  늘어나는 걸 방지하기 위한 규칙.)
- 기능을 추가/수정하면: (1) `docs/TEST_CHECKLIST.md`에 테스트 항목 추가, (2) 관련 `CLAUDE.md`(루트 또는
  하위 디렉터리)에 한두 줄 반영, (3) 이 문서(`ACTIVE_PLAN.md`)와 `docs/COMPLETED_WORK_LOG.md`를 갱신.
