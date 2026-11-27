# 현재 상태

마지막 실행: 2026-11-27 15:20 KST (첫 실행) — 상세: `docs/runs/2026-11-27_1520/summary.md`

## 완료된 것
- 기획 문서 3종, 프로젝트 뼈대, 테스트·스크린샷 스크립트
- ROADMAP M0 전부, M1 전부, M2-1·M2-6·M2-7·M2-8, M3-3·M3-5, 미니맵(M3-11 일부), 카메라 가림 시 기둥·바위 반투명, 적 HP 바 왼쪽 기준, C/I 창을 열면 게임 일시정지

## 코드 구조
- `src/logic/` — 렌더링 무관 로직 (테스트 대상): progression, combat, stamina, collision, poise, spawn, stats, items, embers, save
- `src/game/` — Three.js 쪽: world(지형·장식), beacons, actors(메시), fx(파티클·흔들림·히트스톱), sfx(WebAudio)
- `src/main.ts` — 게임 루프, 입력, 적 AI, HUD, 패널. **약 1150줄로 커짐 → 다음에 손댈 때 enemies/player/hud로 분리 권장**
- `data/*.json` — 밸런스 수치 (progression, combat, enemies, items, world)
- `window.__game` — 테스트용 디버그 핸들(스크린샷 스크립트가 사용)

## 알려진 문제 / 미검증
- 시작 지점 근처에 적이 몰려 있어 첫 화면이 복잡함
- 인벤토리 칸 아이콘이 이름 앞 두 글자 텍스트뿐
- 실제 GPU·사람 손 조작감·효과음은 미검증 (헤드리스 소프트웨어 렌더링으로만 확인)

## 다음 실행이 할 일
1. `src/main.ts`를 player / enemies / hud 모듈로 분리 (동작 변화 없이, 스크린샷 스크립트로 회귀 확인)
2. M2-2 클래스 3종 데이터 + 시작 선택 화면
3. M2-3 잔불 게이지 + 선봉 스킬 4개(1~4키, 쿨타임)
4. M3-1 노이즈 하이트맵 지형
5. M3-6 마을 NPC 3명 + 대화창
