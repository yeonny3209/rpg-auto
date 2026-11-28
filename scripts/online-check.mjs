// 사용법: npm run build && node scripts/online-check.mjs <출력폴더>
// 임시 서버를 띄우고 가입 → 서버 저장 → 새 브라우저에서 로그인(이어하기) → 로그아웃을 헤드리스로 검증한다.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const outDir = process.argv[2] || "shots";
mkdirSync(outDir, { recursive: true });
function findChrome() {
  const root = "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  for (const d of readdirSync(root).filter((n) => n.startsWith("chromium-")).sort().reverse()) {
    const p = join(root, d, "chrome-linux64", "chrome");
    if (existsSync(p)) return p;
  }
}
const port = 8099, url = `http://127.0.0.1:${port}/`;
const server = spawn("node", ["server/index.mjs"], { env: { ...process.env, PORT: String(port), DATA_DIR: mkdtempSync(join(tmpdir(), "ember-srv-")) }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: findChrome(), args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
const errors = [], report = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srvSave = async (token) => (await (await fetch(url + "api/save", { headers: { authorization: `Bearer ${token}` } })).json()).save;
try {
  // 1) 기기 A: 가입 → 업로드
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  a.on("pageerror", (e) => errors.push(String(e))); a.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await a.goto(url + "?class=vanguard&fresh");
  await a.waitForSelector("#acct", { state: "visible", timeout: 20000 });
  await a.evaluate(() => { window.__game.player.gold = 777; window.__game.save(); });
  await a.click("#acct"); await a.waitForSelector("#amName");
  await a.fill("#amName", "테스터"); await a.fill("#amPw", "pw12345");
  await a.screenshot({ path: join(outDir, "40-login.png") });
  await a.click('button[data-a="register"]');
  await a.waitForFunction(() => localStorage.getItem("emberlands.token"), null, { timeout: 15000 });
  const token = await a.evaluate(() => localStorage.getItem("emberlands.token"));
  report.uploadedGold = JSON.parse(await srvSave(token)).gold;
  await a.evaluate(() => { window.__game.player.gold = 1234; window.__game.save(); });
  await sleep(6000);
  report.autoSyncGold = JSON.parse(await srvSave(token)).gold;
  report.buttonText = await a.textContent("#acct");
  await a.screenshot({ path: join(outDir, "41-online.png") });

  // 1.5) 실시간: 두 번째 계정이 같은 서버에 접속 → A가 움직이면 B에 보이고, 채팅이 오간다
  const c = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  c.on("pageerror", (e) => errors.push(String(e)));
  await c.goto(url + "?class=tracker&fresh");
  await c.waitForSelector("#acct", { state: "visible", timeout: 30000 });
  await c.click("#acct"); await c.fill("#amName", "친구"); await c.fill("#amPw", "pw12345");
  await c.click('button[data-a="register"]');
  await c.waitForFunction(() => window.__game.net.onlineCount() >= 2, null, { timeout: 20000 });
  await a.evaluate(() => window.__game.player.pos.set(20, 0, 14));
  await c.waitForFunction(() => window.__game.net.remoteInfo().some((r) => r.name === "테스터" && Math.abs(r.x - 20) < 1), null, { timeout: 15000 });
  report.seenByFriend = await c.evaluate(() => window.__game.net.remoteInfo());
  await a.keyboard.press("Enter"); await a.keyboard.type("안녕 친구야"); await a.keyboard.press("Enter");
  await c.waitForFunction(() => [...document.querySelectorAll("#chatLog .cl")].some((e) => e.textContent.includes("테스터: 안녕 친구야")), null, { timeout: 10000 });
  report.chat = "ok";
  // 봉화 공유: A가 숲 어귀 봉화를 밝히면 C의 월드에서도 켜진다
  report.beaconBefore = await c.evaluate(() => window.__game.beacons.find((b) => b.def.id === "bridgeLamp").lit);
  await a.evaluate(() => { const b = window.__game.beacons.find((x) => x.def.id === "bridgeLamp"); window.__game.player.pos.set(b.pos.x + 1.5, 0, b.pos.z); });
  await sleep(500); await a.keyboard.press("KeyF");
  await c.waitForFunction(() => window.__game.beacons.find((b) => b.def.id === "bridgeLamp").lit, null, { timeout: 10000 });
  report.beaconShared = true;
  await c.screenshot({ path: join(outDir, "43-friend-view.png") });
  await c.close();

  // 2) 기기 B(새 브라우저): 틀린 비밀번호 → 로그인 → 이어하기
  const b = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  b.on("pageerror", (e) => errors.push(String(e)));
  await b.goto(url);
  await b.waitForSelector("#acct", { state: "visible", timeout: 20000 });
  await b.click("#acct"); await b.fill("#amName", "테스터"); await b.fill("#amPw", "wrongpw");
  await b.click('button[data-a="login"]');
  await b.waitForFunction(() => document.querySelector(".am-msg")?.textContent?.includes("틀림"), null, { timeout: 10000 });
  report.wrongPw = await b.textContent(".am-msg");
  await b.fill("#amPw", "pw12345");
  await b.click('button[data-a="login"]');
  await b.waitForFunction(() => localStorage.getItem("emberlands.token"), null, { timeout: 20000 });
  await sleep(4000); // 새로고침이 끝나길 기다린다
  await b.waitForSelector("#acct", { state: "visible", timeout: 30000 });
  await sleep(1500);
  report.resumedGold = await b.evaluate(() => window.__game.player.gold);
  report.stage = "resumed";
  report.resumedClass = await b.evaluate(() => window.__game.player.cls);

  // 3) 로그아웃 → 토큰/세이브 제거, 새 캐릭터 선택 화면
  await b.click("#acct"); await b.waitForSelector('button[data-a="logout"]');
  report.stage = "logout-click";
  await b.click('button[data-a="logout"]');
  await b.waitForFunction(() => !localStorage.getItem("emberlands.token"), null, { timeout: 20000 });
  await sleep(4000);
  await b.screenshot({ path: join(outDir, "42-after-logout.png") });
  report.afterLogout = await b.evaluate(() => ({ token: localStorage.getItem("emberlands.token"), save: localStorage.getItem("emberlands.save"), solo: !!localStorage.getItem("emberlands.save.solo") }));
} catch (e) { report.failure = String(e); }
await browser.close(); server.kill();
console.log("online:", JSON.stringify(report));
console.log("console errors:", errors.length ? errors.slice(0, 5).join(" | ") : "none");
