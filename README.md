# 잔불의 대지 (Emberlands)

웹 브라우저에서 돌아가는 3D 성장형 액션 RPG. AI가 기획부터 개발까지 자율로 진행하는 프로젝트다.

- 기획: [`docs/GDD.md`](docs/GDD.md) · 결정 기록: [`docs/DECISIONS.md`](docs/DECISIONS.md) · 로드맵: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- 현재 상태: [`docs/STATE.md`](docs/STATE.md) · 실행별 기록과 스크린샷: [`docs/runs/`](docs/runs/)

## 실행 방법
Node.js 20 이상 필요.

```bash
npm install
npm run dev        # 개발 서버 → 브라우저에서 표시되는 주소(보통 http://localhost:5173) 열기
```

빌드해서 확인하려면:

```bash
npm run build
npm run preview    # http://localhost:4173
```

처음부터 다시 하려면 주소 뒤에 `?fresh`를 붙인다(저장은 브라우저 localStorage에 자동으로 됨). 테스트용: `?class=tracker`(선택 화면 건너뛰기), `?demo`(시작 지점 근처에 적 배치).

## 조작
| 키 | 동작 |
|---|---|
| WASD | 이동 (카메라 기준) |
| 좌클릭 / J | 공격 |
| 우클릭 / K 길게 | 강공격 차지 (놓으면 공격, 적 경직을 크게 깎음) |
| Space | 회피 구르기 (짧은 무적) |
| Tab | 가까운 적 고정 |
| Q / E, 휠클릭 드래그 | 카메라 회전 · 휠: 거리 |
| 1~4 | 클래스 스킬 (잔불 게이지 소모) |
| H | 물약 마시기 (재사용 8초) |
| T | 밝힌 봉화 곁에서 빠른이동(거리 비례 골드) |
| Enter | 채팅(온라인 접속 중) |
| F | 봉화 점화 / 쉬기 / 잔불 각인 · NPC 대화 |
| C | 능력치 창 |
| I | 장비·가방 창 |

## 개발 명령
```bash
npm test           # 로직 단위 테스트 (Vitest)
npm run typecheck  # 타입 검사
npm run build && node scripts/screenshot.mjs shots   # 헤드리스 브라우저로 플레이 장면 스크린샷 + 기능 검증
```

## 에셋
모든 그래픽은 코드로 만든 도형, 효과음은 WebAudio로 절차 생성한다. 외부 에셋 없음.
