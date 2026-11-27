# 현재 상태

마지막 실행: 2026-11-28 03:00 KST (3번째 실행) — 상세: `docs/runs/2026-11-28_0300/summary.md`

## 완료된 것
- 기획 문서 3종, 프로젝트 뼈대, 테스트·스크린샷 스크립트
- ROADMAP M0·M1 전부, M2 전부(클래스 3종, 잔불 게이지·스킬, 인벤토리·장비·저장), M3-1·M3-3·M3-4·M3-5~M3-8·M3-10~M3-12, M4-1·M4-2
- 이번 실행: 지역 보스 재뿔 멧돼지왕(패턴 3·2페이즈), 시작 지점 약한 적, 상점(거래), 어둠 수치, 밸런스 시뮬 테스트, 장비 강화 +0~+10

## 코드 구조
- `src/logic/` — 렌더링 무관 로직 (테스트 대상): progression, combat, stamina, collision, poise, spawn, stats, items, embers, save(v5), classes, skills, quests, terrain, tutorial, boss, shop, darkness, enhance
- `src/game/` — Three.js·DOM 쪽
  - `core.ts` 렌더러·씬·플레이어 상태·저장/불러오기·토스트/떠오르는 글자 (다른 모듈이 모두 여기서 가져감)
  - `player.ts` 입력 동작·공격·스킬 시전·피격/사망, `enemies.ts` 적 AI·투사체, `input.ts` 키/마우스
  - `sanctuary.ts` 봉화·잔불 각인·사망 흔적, `loot.ts` 바닥 전리품, `camera.ts` 추적·가림 처리
  - `hud.ts` HUD·미니맵·스킬바, `panels.ts` 능력치/장비 창, `classSelect.ts` 시작 화면
  - `npcs.ts` 마을 NPC, `dialog.ts` 대화창(+거래·강화 화면), `questflow.ts` 퀘스트 보고·보상·목록, `tutorial.ts` 안내 상자
  - `world.ts` 지형·장식, `beacons.ts`, `actors.ts`(메시), `fx.ts`, `sfx.ts`
- `src/main.ts` — 프레임 루프 + `window.__game` 디버그 핸들 (약 90줄)
- `data/*.json` — 밸런스·콘텐츠 수치 (progression, combat, enemies, items, world[지형 포함], classes, skills, quests, npcs, tutorial, bosses, shop, enhance)

## 알려진 문제 / 미검증
- 실제 GPU 성능, 사람 손 조작감, 효과음은 미검증 (헤드리스 소프트웨어 렌더링으로만 확인). 헤드리스는 프레임이 느려 시간 의존 검증이 흔들릴 수 있음
- 스킬·클래스·보스 수치는 첫 값. 밸런스 테스트는 단순 모델(레벨5 ≈6분, 레벨8 ≈22분 추정)이라 실제와 다를 수 있음
- 보스 구역은 어둠이 짙어(받는 피해 약 +28%) 보스가 너무 셀 수 있음 — 플레이 후 `data/world.json darkness` 조정
- 판매가에 강화 단계 미반영, 상점 재고 무한, 보스 HP바와 토스트 약간 겹침
- 인벤토리 칸 아이콘이 이름 앞 두 글자 텍스트뿐. 제작(M4-3)·스킬 서적·의뢰 게시판 없음. 미니보스(M3-9) 없음
- 포션 없음 — 회복은 봉화뿐
- 지형 기복이 부드러워 위에서 내려다보면 눈에 잘 안 띔

## 다음 실행이 할 일
1. M4-3 대장장이 제작(재 덩어리 재료) + 드롭 재료 아이템
2. M3-9 미니보스(보스 시스템 재사용, 북쪽 폐허) + 포션/회복 소모품
3. M4-4 스킬 레벨업, M4-6 클래스 변경
4. M3-2 풀·바위·폐허 절차적 배치(인스턴싱)로 월드 밀도 올리기
5. 판매가에 강화 반영·재고 제한 등 상점 다듬기, 보스 난이도 재조정
