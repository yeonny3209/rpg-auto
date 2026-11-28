# 현재 상태

마지막 실행: 2026-11-28 09:00 KST (5번째 실행) — 상세: `docs/runs/2026-11-28_0900/summary.md`

## 완료된 것
- 기획 문서 3종, 프로젝트 뼈대, 테스트·스크린샷 스크립트
- ROADMAP M0·M1 전부, M2 전부(클래스 3종, 잔불 게이지·스킬, 인벤토리·장비·저장), M3 전부(M3-2·M3-9 포함), M4-1~M4-6, M5-1
- 이번 실행: 전문화 6갈래(저장 v8), 의뢰 게시판(경비대장 오르카), 아이템 SVG 아이콘, 상점 품절
- 이전 실행: 소모품·재료 가방(저장 v7), 물약(H), 대장장이 제작, 미니보스 재티 파수꾼(보스 일반화), 스킬 수련, 클래스 변경, 소품 배치+고목

## 코드 구조
- `src/logic/` — 렌더링 무관 로직 (테스트 대상): progression, combat, stamina, collision, poise, spawn, stats, items, embers, save(v8), classes, skills, quests, terrain, tutorial, boss, shop, darkness, enhance, bag, crafting, skillLevel, scatter, specs, bounty
- `src/game/` — Three.js·DOM 쪽
  - `core.ts` 렌더러·씬·플레이어 상태·저장/불러오기·토스트/떠오르는 글자 (다른 모듈이 모두 여기서 가져감)
  - `player.ts` 입력 동작·공격·스킬 시전·피격/사망, `enemies.ts` 적 AI·투사체, `input.ts` 키/마우스
  - `sanctuary.ts` 봉화·잔불 각인·사망 흔적, `loot.ts` 바닥 전리품, `camera.ts` 추적·가림 처리
  - `hud.ts` HUD·미니맵·스킬바, `panels.ts` 능력치/장비 창, `classSelect.ts` 시작 화면
  - `npcs.ts` 마을 NPC, `dialog.ts` 대화창(+거래·강화·제작·수련·클래스 변경 화면), `questflow.ts` 퀘스트 보고·보상·목록, `tutorial.ts` 안내 상자
  - `world.ts` 지형·장식, `beacons.ts`, `actors.ts`(메시), `fx.ts`, `sfx.ts`
- `src/main.ts` — 프레임 루프 + `window.__game` 디버그 핸들 (약 90줄)
- `data/*.json` — 밸런스·콘텐츠 수치 (progression, combat, enemies, items, world[지형 포함], classes, skills, quests, npcs, tutorial, bosses, shop, enhance, materials, recipes, skillLevels, specs, bounties)

## 알려진 문제 / 미검증
- 실제 GPU 성능, 사람 손 조작감, 효과음은 미검증 (헤드리스 소프트웨어 렌더링으로만 확인). 헤드리스는 프레임이 느려 시간 의존 검증이 흔들릴 수 있음
- 스킬·클래스·보스·드롭·제작·수련 비용 수치는 모두 첫 값. 밸런스 테스트는 단순 모델(레벨5 ≈6분, 레벨8 ≈22분 추정)
- 보스 구역은 어둠이 짙어(받는 피해 약 +28%) 보스가 너무 셀 수 있음 — `data/world.json darkness`
- 상점 품절은 세션 한정(저장 안 됨, 새로고침하면 재고 복구). 아이콘은 종류별 단색 SVG(희귀도는 색)
- 지형 기복이 부드러워 위에서 내려다보면 눈에 잘 안 띔. 지역은 1개뿐

## 다음 실행이 할 일
1. M5-2 지역 2 "가라앉은 숲" 시작(지형 프리셋·적 3종·봉화) — 여러 실행으로 쪼갬
2. 밸런스 재점검(드롭률·비용·의뢰 보상), 보스 난이도(어둠 포함)
3. 전문화 스킬 연출·효과 구분, 의뢰 종류 추가(보스 처치 등)
4. M5-3 이후
