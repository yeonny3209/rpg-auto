# 현재 상태

마지막 실행: 2026-11-28 12:00 KST (6번째 실행) — 상세: `docs/runs/2026-11-28_1200/summary.md`

## 완료된 것
- 기획 문서 3종, 프로젝트 뼈대, 테스트·스크린샷 스크립트
- ROADMAP M0·M1 전부, M2 전부(클래스 3종, 잔불 게이지·스킬, 인벤토리·장비·저장), M3 전부(M3-2·M3-9 포함), M4-1~M4-6, M5-1, M5-2 뼈대(지역·적·보스·봉화·2장 퀘스트)
- 이번 실행: 지역 2 가라앉은 숲(regions), 숲 적 3종·보스 늪의 어미, 2장 퀘스트, 봉화 빠른이동(T)
- 이전 실행(09시): 전문화 6갈래(저장 v8), 의뢰 게시판(경비대장 오르카), 아이템 SVG 아이콘, 상점 품절
- 이전 실행: 소모품·재료 가방(저장 v7), 물약(H), 대장장이 제작, 미니보스 재티 파수꾼(보스 일반화), 스킬 수련, 클래스 변경, 소품 배치+고목

## 코드 구조
- `src/logic/` — 렌더링 무관 로직 (테스트 대상): progression, combat, stamina, collision, poise, spawn, stats, items, embers, save(v8), classes, skills, quests, terrain, tutorial, boss, shop, darkness, enhance, bag, crafting, skillLevel, scatter, specs, bounty, regions, travel
- `src/game/` — Three.js·DOM 쪽
  - `core.ts` 렌더러·씬·플레이어 상태·저장/불러오기·토스트/떠오르는 글자 (다른 모듈이 모두 여기서 가져감)
  - `player.ts` 입력 동작·공격·스킬 시전·피격/사망, `enemies.ts` 적 AI·투사체, `input.ts` 키/마우스
  - `sanctuary.ts` 봉화·잔불 각인·사망 흔적, `loot.ts` 바닥 전리품, `camera.ts` 추적·가림 처리
  - `hud.ts` HUD·미니맵·스킬바, `panels.ts` 능력치/장비 창, `classSelect.ts` 시작 화면
  - `npcs.ts` 마을 NPC, `dialog.ts` 대화창(+거래·강화·제작·수련·클래스 변경 화면), `questflow.ts` 퀘스트 보고·보상·목록, `tutorial.ts` 안내 상자
  - `world.ts` 지형·장식, `beacons.ts`, `actors.ts`(메시), `fx.ts`, `sfx.ts`
- `src/main.ts` — 프레임 루프 + `window.__game` 디버그 핸들 (약 90줄)
- `data/*.json` — 밸런스·콘텐츠 수치 (progression, combat, enemies, items, world[지형 포함], classes, skills, quests, npcs, tutorial, bosses, shop, enhance, materials, recipes, skillLevels, specs, bounties, regions)

## 알려진 문제 / 미검증
- 실제 GPU 성능, 사람 손 조작감, 효과음은 미검증 (헤드리스 소프트웨어 렌더링으로만 확인). 헤드리스는 프레임이 느려 시간 의존 검증이 흔들릴 수 있음
- 스킬·클래스·보스·드롭·제작·수련 비용 수치는 모두 첫 값. 밸런스 테스트는 단순 모델(레벨5 ≈6분, 레벨8 ≈22분 추정)
- 보스 구역은 어둠이 짙어(받는 피해 약 +28%) 보스가 너무 셀 수 있음 — `data/world.json darkness`
- 상점 품절은 세션 한정(저장 안 됨, 새로고침하면 재고 복구). 아이콘은 종류별 단색 SVG(희귀도는 색)
- 지형 기복이 부드러워 위에서 내려다보면 눈에 잘 안 띔. 지역 2(숲)는 뼈대만: 전투·보스 체감 미검증, 지형/소품 차별화 부족, 통로 관문 없음

## 다음 실행이 할 일
0. **(사용자 지시: 15시 회차에 최우선) M8-1 클라이언트 마무리** — 서버(`server/`, 계정·세이브·정적 서빙, 테스트 9개)는 이미 push됨. 남은 것:
   - `src/game/account.ts`: 로그인/가입/솔로 모달(DOM은 JS로 생성), 서버 주소 = 같은 origin 또는 `?server=`/localStorage, `/api/ping` 성공 시에만 계정 버튼 표시(GitHub Pages에선 숨김)
   - `core.ts`: `savedHooks`(저장 때마다 raw 전달) 추가, 온라인이면 디바운스 5초로 `PUT /api/save`
   - 로그인 시: 서버 세이브가 있으면 로컬을 `emberlands.save.solo`로 백업 → 서버 세이브로 교체 → reload(교체 중엔 saveGame/beforeunload 저장 금지 플래그). 서버 세이브가 없으면 현재 로컬 세이브를 업로드
   - `input.ts`: 입력창(INPUT)에서 타이핑 중엔 게임 키 무시
   - Playwright 온라인 검증 스크립트(임시 서버+가입→저장→새 컨텍스트 로그인→레벨 일치), `docs/MULTIPLAYER.md`(클라우드 배포 순서: Fly.io/Render, 영구 볼륨 필수 — 임시 디스크면 계정이 사라짐)
   - 이후 M8-2(월드 동기화: WebSocket, 서버 권위 적 상태)
1. M5-2 마무리: 숲 보스 UI 점검, 숲 전용 재료·드롭, 진입 관문·권장 레벨 표시, 지형/소품 차별화
2. 밸런스 재점검(의뢰 보상·상점 가격·숲 난이도 — 사람 플레이 필요)
3. M5-3 지역 3 유리 사막 시작
4. 전문화 스킬 연출·효과 구분, 의뢰 종류 추가
