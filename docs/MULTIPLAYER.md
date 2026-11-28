# 멀티플레이 (M8)

## 구조
- `server/app.mjs` — HTTP: 계정(`/api/register|login|logout`), 서버 세이브(`/api/save`), `/api/ping`, 그리고 `dist/` 정적 서빙. 의존성 없음.
- `server/index.mjs` — 실행 진입점. 환경변수 `PORT`(기본 8080), `DATA_DIR`(기본 `./server-data`).
- 클라이언트 `src/game/account.ts` — 서버가 응답할 때만 "☁ 계정" 버튼이 보임(GitHub Pages에선 숨김 = 솔로).
- 세이브: localStorage가 1차, 로그인 중이면 5초 디바운스로 서버에 업로드. 로그인 시 **서버 세이브가 기준**이고 이 기기의 솔로 진행은 `emberlands.save.solo`로 백업된다.

## 내 컴퓨터에서 돌려 보기
```
npm ci
npm run build
npm run server        # http://localhost:8080
```
브라우저 두 개(또는 시크릿 창)에서 열어 가입/로그인해 보면 된다. 검증 스크립트: `node scripts/online-check.mjs shots`.

## 클라우드 배포 (Fly.io 예시) — 직접 해야 하는 부분
> 이 저장소의 자동 개발 환경은 외부 서비스에 접속할 수 없어서 아래 배포는 **아직 한 번도 실행해 보지 않았다**. 막히면 에러 메시지를 알려 줘.
1. Fly.io 가입 + `flyctl` 설치 (결제 카드 등록이 필요함, 소규모는 월 몇 달러 이하).
2. `fly.toml`의 `app` 이름을 바꾼다.
3. `fly launch --no-deploy --copy-config` → 영구 볼륨 생성: `fly volumes create emberdata --size 1 --region nrt`
4. `fly deploy` → 나온 주소(`https://앱이름.fly.dev`)로 접속하면 게임과 계정이 같은 주소에서 돈다.
5. 친구들에게 그 주소를 공유.

**영구 볼륨이 필수다.** 임시 디스크만 쓰는 호스팅(예: Render 무료 플랜)은 재배포/재시작 때 `accounts.json`이 사라져 계정·세이브가 날아간다.

GitHub Pages 주소에서 쓰고 싶다면 `https://yeonny3209.github.io/rpg-auto/?server=https://앱이름.fly.dev` 로 한 번 열면 서버 주소를 기억한다(https/localhost 주소만 허용).

## 보안 메모
- 비밀번호는 scrypt(솔트)로 해시, 로그인 8회 실패 시 1분 차단, 세션 30일.
- 계정 복구/비밀번호 변경 기능은 없다(소규모 지인용). 필요하면 `accounts.json`을 직접 고친다.
- 서버는 세이브를 JSON 형식과 크기(200KB)만 검사한다. 즉 **클라이언트를 조작한 세이브를 막지 않는다** — 협동 게임이라 지금은 허용. 경쟁 요소가 생기면 서버 검증(M8-3)이 필요.

## 실시간 접속 (M8-2, 구현됨)
- `server/presence.mjs` — WebSocket `/ws?token=…`(로그인 토큰 필수). 최대 10명, 같은 계정이 다시 접속하면 이전 연결을 끊음.
- 클라→서버: `pos`(x,z,ry,cls,lv,hp — 변화가 있을 때 10Hz, 가만히 있어도 1초에 1번), `chat`(120자, 0.8초에 1번), `beacon`(내가 밝힌 봉화 id).
- 서버→클라: `hello`(내 이름·접속자·밝혀진 봉화), `snap`(바뀐 접속자 위치, 10Hz), `leave`, `chat`, `beacon`, `kicked`, `full`.
- 서버는 **중계만** 한다: 좌표는 ±400으로 자르고 값 형식만 검사. 밝힌 봉화는 `DATA_DIR/world.json`에 보존(전원이 공유).
- 클라 `src/game/net.ts` — 다른 접속자는 캡슐 + 이름표 + HP 막대. Enter로 채팅. 다른 사람이 밝힌 봉화는 내 월드에서도 켜지고 퀘스트 진행만 인정(경험치 없음). 접속 시 내가 밝힌 봉화는 서버에 알려 월드에 합쳐진다.
- 검증: `tests/presence.test.ts`, `scripts/online-check.mjs`(가입→저장→새 기기 이어하기→두 계정 위치/채팅/봉화 공유→로그아웃).

## 함께 사냥(M8-3) 설계 — 아직 구현 안 함
지금 적·전투는 각자 브라우저에서 따로 돈다. 같이 싸우려면 적 상태를 공유해야 하는데 선택지가 둘이다.
- **A. 서버 권위**: 적 AI/전투 판정을 Three.js 없이 `src/logic`으로 뽑아 서버(Node)에서 20Hz로 돌리고, 클라는 스냅샷만 그린다. 정확하고 치팅에 강하지만 `enemies.ts`(AI·투사체·보스 패턴)를 크게 리팩터링해야 한다.
- **B. 담당 클라이언트(owner) 방식**: 적마다 가까운 접속자 한 명이 AI를 돌리고 상태를 서버로 스트리밍, 다른 사람은 보간해서 보여 주며 공격은 담당자에게 전달. 리팩터링이 작지만 담당자가 나가면 인계 순간 튀고, 클라이언트 조작에 열려 있다.
- **추천: B로 먼저 만들고**(5~10명 지인용이라 치팅 위험이 낮음), 보스전·경쟁 요소가 생기면 A로 옮긴다. 전리품은 각자 따로(분배 다툼 없음), 경험치는 처치에 기여한 파티원 모두에게.

## 다음 단계
- M8-3 적 상태 공유(B안) → 피해/경험치 분배 → M8-4 파티 보스, 실제 클라우드 배포 점검
