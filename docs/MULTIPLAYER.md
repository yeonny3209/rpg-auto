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

## 다음 단계
- M8-2 접속자 표시(위치 동기화·이름표·채팅) → 적/봉화 서버 권위 동기화 → M8-3 전투/전리품 → M8-4 파티 보스
