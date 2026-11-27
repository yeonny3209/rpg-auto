// 사용법: npm run build && node scripts/screenshot.mjs <출력폴더>
// dist/를 미리보기 서버로 띄우고 헤드리스 Chromium으로 장면 스크린샷을 찍는다.
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
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(outDir, "01-start.png") });

  // 앞으로 걸어가 적에게 접근하고 공격
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyW");
  for (let i = 0; i < 14; i++) {
    const d = await page.evaluate(() => window.__game.faceNearest());
    if (d > 2) {
      await page.evaluate(() => {
        const g = window.__game;
        let best, bd = Infinity;
        for (const e of g.enemies) if (e.state !== "dead") { const d = e.pos.distanceTo(g.player.pos); if (d < bd) { bd = d; best = e; } }
        if (best) g.player.pos.lerp(best.pos, 0.5);
      });
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => { window.__game.faceNearest(); window.__game.attack(); });
    await page.waitForTimeout(i === 9 ? 120 : 480);
    if (i === 9) await page.screenshot({ path: join(outDir, "02-combat.png") });
  }
  await page.waitForTimeout(300);
  // 회피 구르기 중간 장면
  await page.keyboard.down("KeyD");
  await page.keyboard.press("Space");
  await page.waitForTimeout(140);
  await page.screenshot({ path: join(outDir, "03-dodge.png") });
  await page.keyboard.up("KeyD");
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(outDir, "04-after.png") });
  const state = await page.evaluate(() => ({ level: window.__game.player.lv.level, gold: window.__game.player.gold, hp: window.__game.player.hp, stamina: Math.round(window.__game.player.stamina.value) }));
  console.log("state", JSON.stringify(state));
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch {}
}
console.log(errors.length ? "console errors:\n" + errors.join("\n") : "console errors: none");
process.exit(0);
