// 사용법: npm run build && node scripts/screenshot.mjs <출력폴더>
// dist/를 미리보기 서버로 띄우고 헤드리스 Chromium으로 플레이 장면 스크린샷을 찍는다.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2] || "shots";
mkdirSync(outDir, { recursive: true });

// 이 클라우드 환경엔 브라우저가 /opt/pw-browsers 에 미리 설치돼 있다. 없으면 playwright 기본값 사용.
function findChrome() {
  const root = "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  for (const d of readdirSync(root).filter((n) => n.startsWith("chromium-")).sort().reverse()) {
    const p = join(root, d, "chrome-linux64", "chrome");
    if (existsSync(p)) return p;
  }
}

const port = 4173;
const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { stdio: "ignore", detached: true });
await new Promise((r) => setTimeout(r, 2500));

const errors = [];
const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const shot = (page, name) => page.screenshot({ path: join(outDir, name) });
// 가장 가까운 적(종류 지정 가능) 옆으로 다가가 바라본다
const approach = (page, id, gap = 1.6) =>
  page.evaluate(([id, gap]) => {
    const g = window.__game;
    const e = g.nearest(id || undefined);
    if (!e) return false;
    const dir = g.player.pos.clone().sub(e.pos).setY(0).normalize();
    g.player.pos.copy(e.pos).addScaledVector(dir, gap + e.def.size * 0.6);
    const to = e.pos.clone().sub(g.player.pos);
    g.player.facing = Math.atan2(to.x, to.z);
    return true;
  }, [id, gap]);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForTimeout(2000);
  await shot(page, "01-start.png");

  // 약공격으로 기어다니는 것 처치
  for (let i = 0; i < 8; i++) {
    await approach(page, "ashCrawler");
    await page.evaluate(() => window.__game.attack());
    await page.waitForTimeout(i === 5 ? 90 : 500);
    if (i === 5) await shot(page, "02-light-attack.png");
  }

  // 돌진자에게 고정 후 강공격 차지 (장면 재현을 위해 돌진자는 공격하지 않게 묶어 둔다)
  const pacify = () => page.evaluate(() => { const g = window.__game; for (const e of g.enemies) e.attackCd = 99; });
  await page.evaluate(() => {
    const g = window.__game, e = g.nearest("ashCharger");
    e.pos.set(-18, 0, -18); g.player.pos.set(-18, 0, -21);
    for (const o of g.enemies) if (o !== e && o.state !== "dead" && o.pos.distanceTo(e.pos) < 10) o.pos.set(40, 0, 40);
  });
  await pacify();
  await approach(page, "ashCharger", 2.0);
  await page.evaluate(() => { const g = window.__game; g.cam.target = g.nearest("ashCharger"); });
  await page.waitForTimeout(700);
  await approach(page, "ashCharger", 2.0);
  await page.evaluate(() => window.__game.startCharge());
  await page.waitForTimeout(800);
  await shot(page, "03-heavy-charge.png");
  await approach(page, "ashCharger", 1.8);
  await page.evaluate(() => window.__game.releaseCharge());
  await page.waitForTimeout(80);
  await shot(page, "04-heavy-hit.png");
  // 연속 강공격으로 그로기
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(700);
    await pacify();
    await approach(page, "ashCharger", 1.8);
    await page.evaluate(() => window.__game.startCharge());
    await page.waitForTimeout(700);
    await approach(page, "ashCharger", 1.8);
    await page.evaluate(() => window.__game.releaseCharge());
  }
  await page.waitForTimeout(250);
  await shot(page, "05-stagger.png");
  const staggerState = await page.evaluate(() => window.__game.enemies.find((e) => e.id === "ashCharger" && e.hp < e.def.hp)?.state);
  console.log("charger after heavies:", staggerState);
  await page.evaluate(() => { for (const e of window.__game.enemies) e.attackCd = 0; });

  // 회피 구르기
  await page.evaluate(() => { window.__game.cam.target = null; });
  await page.keyboard.down("KeyD");
  await page.keyboard.press("Space");
  await page.waitForTimeout(140);
  await shot(page, "06-dodge.png");
  await page.keyboard.up("KeyD");

  // 원거리 적과 투사체
  await approach(page, "ashSpitter", 6);
  await page.evaluate(() => { window.__game.cam.target = window.__game.nearest("ashSpitter"); });
  await page.waitForTimeout(1500);
  await shot(page, "07-spitter.png");

  // 캐릭터 창: 포인트 배분
  await page.evaluate(() => { const g = window.__game; g.cam.target = null; g.toggleCharPanel(); });
  await page.click('#charPanel button[data-k="str"]');
  await page.click('#charPanel button[data-k="vit"]');
  await page.waitForTimeout(200);
  await shot(page, "08-character.png");
  await page.evaluate(() => window.__game.toggleCharPanel());

  // 전리품: 희귀·영웅 아이템을 바닥에 떨어뜨리고 줍기
  await page.evaluate(() => { const g = window.__game; g.spawnLoot("rare"); g.spawnLoot("epic", "emberBlade"); g.spawnLoot("legendary"); });
  await page.waitForTimeout(300);
  await shot(page, "09-loot.png");
  await page.evaluate(() => { const g = window.__game; g.player.pos.x += 1.2; g.player.pos.z += 1.2; });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__game.toggleInvPanel());
  const invCount = await page.evaluate(() => window.__game.player.inventory.length);
  console.log("inventory after pickup:", invCount);
  await page.hover("#invPanel .cell.item");
  await page.waitForTimeout(150);
  await shot(page, "10-inventory.png");
  const atkBefore = await page.evaluate(() => window.__game.player.atk);
  // 무기가 있으면 장착
  await page.evaluate(() => {
    const g = window.__game, i = g.player.inventory.findIndex((it) => it.kind === "weapon");
    if (i >= 0) document.querySelectorAll("#invPanel .cell.item")[i].click();
  });
  const atkAfter = await page.evaluate(() => window.__game.player.atk);
  console.log("atk before/after equip:", atkBefore, atkAfter);
  await page.evaluate(() => window.__game.toggleInvPanel());

  // 저장/불러오기: 새로고침 후 레벨·속성 유지 확인
  const before = await page.evaluate(() => { window.__game.save(); const p = window.__game.player; return { level: p.lv.level, attrs: p.attrs, gold: p.gold, inv: p.inventory.length, eq: Object.keys(p.equipment).sort() }; });
  await page.reload();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => { const p = window.__game.player; return { level: p.lv.level, attrs: p.attrs, gold: p.gold, inv: p.inventory.length, eq: Object.keys(p.equipment).sort() }; });
  console.log("save/load", JSON.stringify(before) === JSON.stringify(after) ? "OK" : `MISMATCH ${JSON.stringify(before)} vs ${JSON.stringify(after)}`);

  const state = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const ch = g.enemies.find((e) => e.id === "ashCharger" && e.hp < e.def.hp);
    return { level: p.lv.level, gold: p.gold, hp: Math.round(p.hp), stamina: Math.round(p.stamina.value), chargerState: ch && ch.state, chargerHp: ch && ch.hp };
  });
  console.log("state", JSON.stringify(state));
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch {}
}
console.log(errors.length ? "console errors:\n" + errors.join("\n") : "console errors: none");
process.exit(0);
