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
  await page.goto(`http://localhost:${port}/?demo`);
  await page.waitForTimeout(1500);
  await shot(page, "00-class-select.png");
  await page.click('.class-card[data-id="vanguard"]');
  await page.waitForTimeout(800);
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

  // 스킬: 잔불 게이지 소모·쿨타임·버프·돌진
  await page.evaluate(() => { const g = window.__game; g.cam.target = null; for (const e of g.enemies) e.attackCd = 99; g.player.hp = g.player.maxHp; g.player.stamina.value = g.player.stamina.max; g.player.attackCd = 0; g.player.sk.ember = 100; g.player.sk.cds.fill(0); });
  await approach(page, "ashCrawler", 2);
  await page.waitForTimeout(100);
  const sk1 = await page.evaluate(() => {
    const g = window.__game, e = g.nearest("ashCrawler"), hp0 = e.hp, em0 = g.player.sk.ember;
    g.cast(0);
    const r = { dmg: hp0 - e.hp, killed: e.state === "dead", ember: [em0, g.player.sk.ember], cd: +g.player.sk.cds[0].toFixed(2) };
    g.cast(0); // 쿨타임 중 재시전: 변화 없어야 함
    r.ember2 = g.player.sk.ember;
    return r;
  });
  console.log("skill cleave:", JSON.stringify(sk1));
  await page.waitForTimeout(450);
  await page.evaluate(() => { const g = window.__game; g.player.attackCd = 0; g.cast(3); });
  await page.waitForTimeout(300);
  console.log("skill buff:", JSON.stringify(await page.evaluate(() => { const p = window.__game.player; return { buff: p.buff.t > 7, atkMul: p.buff.atkMul, hp: Math.round(p.hp) }; })));
  await page.evaluate(() => { const g = window.__game; g.player.attackCd = 0; g.player.pos.set(0, 0, 3); });
  const d0 = await page.evaluate(() => window.__game.player.pos.clone());
  await page.evaluate(() => window.__game.cast(2));
  await page.waitForTimeout(500);
  console.log("skill dash moved:", await page.evaluate((d0) => +window.__game.player.pos.distanceTo(d0).toFixed(1), d0));
  await page.evaluate(() => { const g = window.__game; g.player.sk.ember = 60; g.player.attackCd = 0; });
  await approach(page, "ashCharger", 2.5);
  await page.evaluate(() => { window.__game.cast(1); });
  await page.waitForTimeout(120);
  await shot(page, "07b-skill.png");
  await page.evaluate(() => { const p = window.__game.player; p.buff.t = 0; p.buff.atkMul = 1; p.dash = null; p.sk.cds.fill(0); p.attackCd = 0; });
  await page.waitForTimeout(600);

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

  // 봉화: 북쪽 폐허 봉화로 이동해 점화
  await page.evaluate(() => {
    const g = window.__game;
    for (const e of g.enemies) e.attackCd = 99;
    g.player.pos.set(4, 0, 36);
    g.player.facing = 0;
  });
  await page.waitForTimeout(1200);
  await shot(page, "11-beacon-unlit.png");
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(450);
  await shot(page, "12-beacon-lit.png");
  const lit = await page.evaluate(() => window.__game.beacons.filter((b) => b.lit).map((b) => b.def.id));
  console.log("lit beacons:", lit.join(","));

  // 잔불 각인
  await page.evaluate(() => { window.__game.player.embers.held = 25; });
  await page.keyboard.press("KeyF");
  const emb = await page.evaluate(() => window.__game.player.embers);
  console.log("after engrave:", JSON.stringify(emb));

  // 사망 → 흔적 → 부활 → 회수
  await page.evaluate(() => { const g = window.__game; g.player.embers.held = 20; g.player.pos.set(20, 0, 30); g.hurt(99999); });
  await page.waitForTimeout(600);
  await shot(page, "13-death.png");
  await page.waitForTimeout(2400);
  const afterDeath = await page.evaluate(() => { const p = window.__game.player; return { held: p.embers.held, trace: p.trace, pos: [Math.round(p.pos.x), Math.round(p.pos.z)] }; });
  console.log("after respawn:", JSON.stringify(afterDeath));
  await page.evaluate(() => { const p = window.__game.player; p.pos.set(p.trace.x + 4, 0, p.trace.z - 4); });
  await page.waitForTimeout(700);
  await shot(page, "14-trace.png");
  await page.evaluate(() => { const p = window.__game.player; p.pos.set(p.trace.x, 0, p.trace.z); });
  await page.waitForTimeout(300);
  console.log("trace recovered:", JSON.stringify(await page.evaluate(() => ({ held: window.__game.player.embers.held, trace: window.__game.player.trace }))));
  await page.evaluate(() => { for (const e of window.__game.enemies) e.attackCd = 0; });

  // 저장/불러오기: 새로고침 후 레벨·속성 유지 확인
  const before = await page.evaluate(() => { window.__game.save(); const p = window.__game.player; return { cls: p.cls, level: p.lv.level, attrs: p.attrs, gold: p.gold, inv: p.inventory.length, eq: Object.keys(p.equipment).sort(), embers: p.embers, lit: window.__game.beacons.filter((b) => b.lit).length }; });
  await page.reload();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => { const p = window.__game.player; return { cls: p.cls, level: p.lv.level, attrs: p.attrs, gold: p.gold, inv: p.inventory.length, eq: Object.keys(p.equipment).sort(), embers: p.embers, lit: window.__game.beacons.filter((b) => b.lit).length }; });
  console.log("save/load", JSON.stringify(before) === JSON.stringify(after) ? "OK" : `MISMATCH ${JSON.stringify(before)} vs ${JSON.stringify(after)}`);

  // 클래스 3종: ?fresh&class= 로 시작해 능력치·공격 특성·보이는 색을 확인
  for (const id of ["tracker", "igniter"]) {
    await page.goto(`http://localhost:${port}/?fresh&class=${id}`);
    await page.waitForTimeout(1500);
    console.log(`class ${id}:`, JSON.stringify(await page.evaluate(() => { const p = window.__game.player; return { cls: p.cls, hp: p.maxHp, atk: p.atk, def: p.def, st: p.stamina.max, crit: +p.crit.toFixed(3), move: p.moveMul, mod: p.atkMod, attrs: p.attrs }; })));
    await shot(page, `15-class-${id}.png`);
  }
  await page.goto(`http://localhost:${port}/?fresh`);
  await page.waitForTimeout(800);
  console.log("select overlay without class:", await page.evaluate(() => document.getElementById("classSelect").classList.contains("open")));
  await page.keyboard.press("Digit2");
  await page.waitForTimeout(300);
  console.log("pressed 2 ->", await page.evaluate(() => window.__game.player.cls));

  // 지형: 가장 높은 언덕 근처로 이동해 굴곡과 발 높이 확인
  const hill = await page.evaluate(() => {
    const g = window.__game; let best = { h: -9, x: 0, z: 0 };
    for (let x = -50; x <= 50; x += 2) for (let z = -50; z <= 50; z += 2) { const h = g.heightAt(x, z); if (h > best.h) best = { h, x, z }; }
    g.player.pos.set(best.x - 5, 0, best.z - 5);
    for (const e of g.enemies) e.attackCd = 99;
    g.cam.yaw = Math.atan2(5, 5);
    return best;
  });
  await page.waitForTimeout(2200);
  console.log("hill:", JSON.stringify(hill), "player y:", await page.evaluate(() => +window.__game.player.pos.y.toFixed(2)));
  await shot(page, "19-terrain.png");
  await page.evaluate(() => { window.__game.cam.yaw = 0; });

  // 튜토리얼: 이동 → 공격 → 회피 → 강공격 → 스킬 → 대화 → 봉화
  const tut = () => page.evaluate(() => { const t = window.__game.tutorial(); return `${t.index}:${Math.floor(t.count)}`; });
  const tutSteps = [`start ${await tut()}`];
  await page.evaluate(() => { const g = window.__game; g.player.pos.set(0, 0, 3); for (const e of g.enemies) e.attackCd = 99; });
  await page.keyboard.down("KeyW"); await page.waitForTimeout(5000); await page.keyboard.up("KeyW");
  tutSteps.push(`moved ${await tut()}`);
  for (let i = 0; i < 2; i++) { await page.evaluate(() => { window.__game.player.attackCd = 0; window.__game.attack(); }); await page.waitForTimeout(250); }
  tutSteps.push(`attacked ${await tut()}`);
  await shot(page, "20-tutorial.png");
  await page.evaluate(() => window.__game.dodge()); await page.waitForTimeout(1800);
  tutSteps.push(`dodged ${await tut()}`);
  await page.evaluate(() => { window.__game.player.attackCd = 0; window.__game.player.stamina.value = 100; window.__game.startCharge(); }); await page.waitForTimeout(600);
  await page.evaluate(() => window.__game.releaseCharge()); await page.waitForTimeout(500);
  tutSteps.push(`heavy ${await tut()}`);
  await page.evaluate(() => { const g = window.__game; g.player.attackCd = 0; g.player.sk.ember = 100; g.cast(0); }); await page.waitForTimeout(500);
  tutSteps.push(`skill ${await tut()}`);
  await page.evaluate(() => { window.__game.talk("smith"); }); await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  tutSteps.push(`talk ${await tut()}`);
  await page.evaluate(() => { const g = window.__game; g.player.pos.set(1.5, 0, 0); g.interact(); }); await page.waitForTimeout(200);
  tutSteps.push(`beacon ${await tut()}`);
  console.log("tutorial:", tutSteps.join(" | "));

  // 보스: 접근 → 패턴(돌진/내려찍기/투척) 관찰 → 2페이즈 → 처치 → 드롭
  await page.evaluate(() => { const g = window.__game, b = g.boss(); g.player.pos.set(b.pos.x + 10, 0, b.pos.z + 3); g.player.hp = g.player.maxHp = 5000; for (const e of g.enemies) e.attackCd = e.boss ? 0 : 99; });
  const seen = new Set(), states = new Set(); let slamShot = false, phase2 = false;
  for (let i = 0; i < 160 && seen.size < 3; i++) {
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => { const b = window.__game.boss(); return { st: b.state, p: b.boss.pattern, ring: b.boss.ring.visible, ph: b.boss.phase }; });
    states.add(`${r.st}/${r.p}`);
    if (r.st === "windup" && r.p) seen.add(r.p);
    if (r.ring && !slamShot) { slamShot = true; await shot(page, "21-boss-slam.png"); }
  }
  console.log("boss patterns seen:", [...seen].join(","), "| states:", [...states].join(" "));
  await page.evaluate(() => { const b = window.__game.boss(); b.hp = b.def.hp * 0.45; });
  await page.waitForTimeout(500);
  console.log("boss phase2:", await page.evaluate(() => window.__game.boss().boss.phase), "bar:", await page.evaluate(() => document.getElementById("bossBar").style.display));
  await shot(page, "22-boss-phase2.png");
  await page.evaluate(() => { const g = window.__game, b = g.boss(); g.player.hp = g.player.maxHp; g.kill(b); });
  await page.waitForTimeout(400);
  console.log("boss dead:", JSON.stringify(await page.evaluate(() => { const g = window.__game, b = g.boss(); return { state: b.state, respawn: b.respawnT, bar: document.getElementById("bossBar").style.display, loot: g.player.inventory.length }; })));
  // 미니보스(재티 파수꾼): 패턴 관찰 → 처치 → 재료·드롭
  await page.evaluate(() => { const g = window.__game, b = g.bosses().find((x) => x.id === "cinderWarden"); g.player.pos.set(b.pos.x + 9, 0, b.pos.z + 3); g.player.hp = g.player.maxHp = 5000; for (const e of g.enemies) e.attackCd = e.boss ? 0 : 99; g.player.bag = {}; });
  const mseen = new Set(); let mshot = false;
  for (let i = 0; i < 200 && mseen.size < 2; i++) {
    await page.waitForTimeout(100);
    const r = await page.evaluate(() => { const b = window.__game.bosses().find((x) => x.id === "cinderWarden"); return { p: b.boss.pattern, st: b.state, ring: b.boss.ring.visible }; });
    if (r.p) mseen.add(r.p);
    if (r.ring && !mshot) { mshot = true; await shot(page, "27-miniboss-slam.png"); }
  }
  console.log("miniboss patterns seen:", [...mseen].join(","));
  const mbar = await page.evaluate(() => ({ display: document.getElementById("bossBar").style.display, name: document.getElementById("bossName").textContent }));
  await page.evaluate(() => { const g = window.__game, b = g.bosses().find((x) => x.id === "cinderWarden"); g.player.hp = g.player.maxHp; g.kill(b); });
  await page.waitForTimeout(400);
  console.log("miniboss dead:", JSON.stringify({ mbar, ...(await page.evaluate(() => { const g = window.__game, b = g.bosses().find((x) => x.id === "cinderWarden"); return { state: b.state, respawn: Math.round(b.respawnT), bag: g.player.bag, boarAlive: g.bosses().find((x) => x.id === "boarKing").state !== "dead" }; })) }));
  await page.evaluate(() => { const g = window.__game; g.player.hp = g.player.maxHp = 100; g.player.pos.set(0, 0, 3); });

  // 퀘스트 흐름: 사제 대화(수락) → 처치 5 → 보고(보상) → 다음 퀘스트 제안
  const near = (id) => page.evaluate((id) => { const g = window.__game, n = g.npcs.find((x) => x.def.id === id); g.player.pos.set(n.pos.x - 1.8, 0, n.pos.z - 0.6); }, id);
  await near("priest");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  await shot(page, "16-dialog-offer.png");
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  console.log("quest accepted:", JSON.stringify(await page.evaluate(() => window.__game.player.quests)));
  for (let i = 0; i < 5; i++) await page.evaluate((i) => { const g = window.__game; g.kill(g.spawn("ashCrawler", 20 + i, 20)); }, i);
  await page.waitForTimeout(300);
  await near("priest");
  await page.waitForTimeout(500);
  await shot(page, "17-quest-ready.png");
  const exp0 = await page.evaluate(() => { const p = window.__game.player; return { lv: p.lv.level, exp: p.lv.exp, gold: p.gold }; });
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(250);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  console.log("quest turned in:", JSON.stringify({ before: exp0, after: await page.evaluate(() => { const p = window.__game.player; return { lv: p.lv.level, exp: p.lv.exp, gold: p.gold, done: p.quests.done, active: Object.keys(p.quests.active) }; }) }));
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(250);
  await shot(page, "18-dialog-next.png");
  await page.keyboard.press("Escape");
  console.log("dialog closed by Esc:", await page.evaluate(() => !document.getElementById("dialog").classList.contains("open")));

  // 상점: 상인 대화 → 거래 → 구매 → 판매
  await page.evaluate(() => { const p = window.__game.player; p.gold = 500; });
  await near("merchant");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  await page.click('#dialog button[data-act="shop"]');
  await page.waitForTimeout(300);
  const shopBefore = await page.evaluate(() => ({ gold: window.__game.player.gold, inv: window.__game.player.inventory.length }));
  await page.click('#dialog .shop-row[data-act="buy"]');
  await page.waitForTimeout(200);
  const afterBuy = await page.evaluate(() => ({ gold: window.__game.player.gold, inv: window.__game.player.inventory.length }));
  await page.hover('#dialog .shop-row[data-act="buy"] >> nth=2');
  await shot(page, "23-shop.png");
  await page.click('#dialog .shop-row[data-act="sell"]');
  await page.waitForTimeout(200);
  const afterSell = await page.evaluate(() => ({ gold: window.__game.player.gold, inv: window.__game.player.inventory.length }));
  console.log("shop:", JSON.stringify({ shopBefore, afterBuy, afterSell }));
  await page.click('#dialog .shop-row[data-act="buy"]');
  await page.waitForTimeout(150);
  await page.keyboard.press("Escape");

  // 강화: 대장장이 → 강화 → 반복 시도
  await page.evaluate(() => { window.__game.player.gold = 3000; });
  await near("smith");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  await page.click('#dialog button[data-act="enh"]');
  await page.waitForTimeout(300);
  const enhBefore = await page.evaluate(() => ({ gold: window.__game.player.gold, plus: window.__game.player.inventory[0]?.plus ?? 0 }));
  for (let i = 0; i < 6; i++) { await page.click('#dialog .shop-row >> nth=0'); await page.waitForTimeout(120); }
  const enhAfter = await page.evaluate(() => ({ gold: window.__game.player.gold, plus: window.__game.player.inventory[0]?.plus ?? 0, eqPlus: Object.values(window.__game.player.equipment).map((i) => i && (i.plus ?? 0)) }));
  console.log("enhance:", JSON.stringify({ enhBefore, enhAfter }));
  await page.hover('#dialog .shop-row >> nth=0');
  await shot(page, "25-enhance.png");
  await page.keyboard.press("Escape");

  // 제작 + 물약: 대장장이 → 제작(물약, 단조 무기) → H로 마시기
  await page.evaluate(() => { const p = window.__game.player; p.bag = { ashLump: 20, emberCore: 2, mireSap: 12, mireHeart: 1 }; p.gold = 1000; });
  await near("smith");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  await page.click('#dialog button[data-act="craft"]');
  await page.waitForTimeout(300);
  const craftBefore = await page.evaluate(() => ({ inv: window.__game.player.inventory.length, bag: { ...window.__game.player.bag }, gold: window.__game.player.gold }));
  await page.click('#dialog .shop-row >> nth=0'); // 물약 ×3
  await page.waitForTimeout(150);
  await page.click('#dialog .shop-row >> nth=1'); // 단조 무기
  await page.waitForTimeout(150);
  const craftAfter = await page.evaluate(() => ({ inv: window.__game.player.inventory.length, bag: { ...window.__game.player.bag }, gold: window.__game.player.gold }));
  console.log("craft:", JSON.stringify({ craftBefore, craftAfter }));
  await shot(page, "26-craft.png");
  await page.evaluate(() => { const c = document.querySelector("#dialog .shop-cols"); if (c) c.scrollTop = 99999; for (const el of document.querySelectorAll("#dialog *")) if (el.scrollHeight > el.clientHeight + 20) el.scrollTop = 99999; });
  await page.waitForTimeout(150);
  await shot(page, "26b-craft-forest.png");
  await page.keyboard.press("Escape");
  await page.evaluate(() => { const p = window.__game.player; p.hp = Math.floor(p.maxHp * 0.3); });
  const hpBefore = await page.evaluate(() => window.__game.player.hp);
  await page.keyboard.press("KeyH");
  await page.waitForTimeout(200);
  const potion = await page.evaluate(() => ({ hp: window.__game.player.hp, max: window.__game.player.maxHp, potions: window.__game.player.bag.potion, cd: window.__game.player.potionCd }));
  await page.keyboard.press("KeyH");
  await page.waitForTimeout(200);
  const potion2 = await page.evaluate(() => ({ hp: window.__game.player.hp, potions: window.__game.player.bag.potion }));
  console.log("potion:", JSON.stringify({ hpBefore, potion, secondDrinkBlockedByCd: potion2.potions === potion.potions }));
  await page.evaluate(() => { const p = window.__game.player; p.hp = p.maxHp; });

  // 스킬 수련: 사제 → 수련 → 첫 스킬 두 번
  await page.evaluate(() => { const p = window.__game.player; p.bag = { skillBook: 5 }; p.gold = 1000; });
  await near("priest");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  await page.click('#dialog button[data-act="train"]');
  await page.waitForTimeout(300);
  await page.click('#dialog .shop-row >> nth=0'); await page.waitForTimeout(150);
  await page.click('#dialog .shop-row >> nth=0'); await page.waitForTimeout(150);
  await shot(page, "28-train.png");
  console.log("train:", JSON.stringify(await page.evaluate(() => ({ lv: window.__game.player.skillLv, bag: window.__game.player.bag, gold: window.__game.player.gold, bar: document.querySelector("#skillbar .lv")?.textContent }))));
  await page.keyboard.press("Escape");

  // 클래스 변경: 사제 → 클래스 변경 → 두 번 눌러 확정(첫 클릭은 확인 단계)
  await page.evaluate(() => { const p = window.__game.player; p.gold = 2000; });
  await near("priest");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  await page.click('#dialog button[data-act="class"]');
  await page.waitForTimeout(200);
  const clsBefore = await page.evaluate(() => ({ cls: window.__game.player.cls, atk: window.__game.player.atk, gold: window.__game.player.gold }));
  await page.click('#dialog .shop-row >> nth=0'); await page.waitForTimeout(150);
  const midCls = await page.evaluate(() => window.__game.player.cls);
  await page.click('#dialog .shop-row >> nth=0'); await page.waitForTimeout(250);
  const clsAfter = await page.evaluate(() => ({ cls: window.__game.player.cls, atk: window.__game.player.atk, gold: window.__game.player.gold, bar: [...document.querySelectorAll("#skillbar .n")].map((e) => e.textContent) }));
  console.log("class change:", JSON.stringify({ clsBefore, midCls, clsAfter }));
  await page.keyboard.press("Escape");

  // 전문화: 레벨 15로 올리고 사제 → 전문화 → 첫 갈래 선택 (스킬바가 바뀌어야 함)
  await page.evaluate(() => { const p = window.__game.player; p.lv = { ...p.lv, level: 15 }; p.gold = 2000; });
  await near("priest");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  await page.click('#dialog button[data-act="spec"]');
  await page.waitForTimeout(250);
  const specBefore = await page.evaluate(() => ({ spec: window.__game.player.spec, bar: [...document.querySelectorAll("#skillbar .n")].map((e) => e.textContent), gold: window.__game.player.gold }));
  await page.click('#dialog .shop-row >> nth=0'); await page.waitForTimeout(300);
  const specAfter = await page.evaluate(() => ({ spec: window.__game.player.spec, bar: [...document.querySelectorAll("#skillbar .n")].map((e) => e.textContent), gold: window.__game.player.gold, maxHp: window.__game.player.maxHp }));
  console.log("spec:", JSON.stringify({ specBefore, specAfter }));
  await shot(page, "29-spec.png");
  await page.keyboard.press("Escape");
  // 전문화 스킬 시전 확인: 3·4번 슬롯(교체된 스킬)을 쏴서 쿨다운/에러 없는지
  const castRes = await page.evaluate(async () => {
    const g = window.__game; g.player.resource = 999; const out = [];
    for (const slot of [2, 3]) { g.cast(slot); await new Promise((r) => setTimeout(r, 120)); out.push(slot); }
    return { cast: out, hp: g.player.hp };
  });
  console.log("spec cast:", JSON.stringify(castRes));
  await page.waitForTimeout(600);

  // 의뢰 게시판: 경비대장 → 수락 → 처치 보고 → 완료
  await near("captain");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  await page.click('#dialog button[data-act="board"]');
  await page.waitForTimeout(250);
  await shot(page, "30-board.png");
  const offerTexts = await page.evaluate(() => [...document.querySelectorAll("#dialog .shop-row")].map((e) => e.textContent));
  const goldB = await page.evaluate(() => window.__game.player.gold);
  await page.click('#dialog .shop-row[data-act="accept"] >> nth=0'); await page.waitForTimeout(200);
  const acc = await page.evaluate(() => window.__game.player.bounty.active && { type: window.__game.player.bounty.active.type, target: window.__game.player.bounty.active.target, goal: window.__game.player.bounty.active.goal });
  await page.keyboard.press("Escape");
  if (acc && acc.type === "kill") {
    await page.evaluate(() => { const g = window.__game; const e = g.enemies.find((x) => !x.boss && x.state !== "dead"); g.kill(e); });
    await page.waitForTimeout(200);
  }
  const prog = await page.evaluate(() => window.__game.player.bounty.active && window.__game.player.bounty.active.progress);
  // 목표를 채운 상태로 만들어 보고 흐름을 확인한다(처치/납품 판정 자체는 단위 테스트가 검증)
  await page.evaluate(() => { const b = window.__game.player.bounty; b.active.progress = b.active.goal; if (b.active.type === "collect") window.__game.player.bag = { ...window.__game.player.bag, ashLump: b.active.goal }; });
  await near("captain");
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF");
  await page.waitForTimeout(300);
  await page.click('#dialog button[data-act="board"]');
  await page.waitForTimeout(250);
  await page.click('#dialog .shop-row[data-act="turnin"]'); await page.waitForTimeout(250);
  const doneB = await page.evaluate(() => ({ gold: window.__game.player.gold, bounty: window.__game.player.bounty }));
  console.log("board:", JSON.stringify({ offers: offerTexts.length, acc, prog, goldB, doneB }));
  await page.keyboard.press("Escape");

  // 어둠: 마을에서는 0, 먼 곳(남서쪽)에서는 올라감
  const darkHome = await page.evaluate(() => { const g = window.__game; g.player.pos.set(0, 0, 3); return g.env ? g.env.dark : null; });
  await page.evaluate(() => { const g = window.__game; g.player.pos.set(-30, 0, -30); g.player.hp = g.player.maxHp = 500; g.enemies.forEach((e) => (e.attackCd = 99)); });
  await page.waitForTimeout(2500);
  const darkFar = await page.evaluate(() => ({ dark: window.__game.env.dark, tag: document.getElementById("darkTag").textContent, fogFar: window.__game.scene.fog.far }));
  console.log("darkness:", JSON.stringify({ darkHome, darkFar }));
  await shot(page, "24-darkness.png");
  await page.evaluate(() => window.__game.player.pos.set(0, 0, 3));

  // 지역 2: 이동 제한, 지역별 적, 숲 분위기
  const out = await page.evaluate(async () => {
    const g = window.__game; g.player.pos.set(0, 0, 400); await new Promise((r) => setTimeout(r, 300));
    const lim = { x: Math.round(g.player.pos.x), z: Math.round(g.player.pos.z) };
    const forestIds = g.enemies.filter((e) => e.pos.x > 100 && !e.boss).map((e) => e.id);
    const mm = g.enemies.find((e) => e.id === "mireMother");
    return { lim, forest: forestIds.length, kinds: [...new Set(forestIds)], boss: mm && { hp: mm.hp, x: Math.round(mm.pos.x), z: Math.round(mm.pos.z) } };
  });
  await page.evaluate(() => { const g = window.__game; g.player.hp = g.player.maxHp = 900; g.enemies.forEach((e) => (e.attackCd = 99)); g.player.pos.set(125, 0, -6); });
  await page.waitForTimeout(3500);
  const forestToast = await page.evaluate(() => [...document.querySelectorAll("#toasts *, .toast")].map((e) => e.textContent).filter((t) => t.includes("권장")).slice(-1)[0] ?? null);
  await page.evaluate(() => { const g = window.__game; g.player.bag = { ...g.player.bag, mireSap: 7, emberCore: 2 }; g.player.gold = Math.max(g.player.gold, 600); });
  await page.waitForTimeout(400);
  const forestInfo = await page.evaluate(() => ({ matTag: document.getElementById("matTag").textContent, zone: document.getElementById("zoneTag").textContent, fog: window.__game.scene.fog.color.getHexString(), pos: [Math.round(window.__game.player.pos.x), Math.round(window.__game.player.pos.z)] }));
  console.log("forest:", JSON.stringify({ out, forestInfo, forestToast }));
  await shot(page, "31-forest.png");
  await page.evaluate(() => { const g = window.__game; g.player.pos.set(101, 0, 0); g.cam.yaw = Math.PI / 2; g.cam.dist = 20; g.cam.height = 12; });
  await page.waitForTimeout(1800);
  await shot(page, "32-forest-gate.png");
  await page.evaluate(() => { const g = window.__game; g.cam.dist = 15.5; g.cam.height = 10.5; });
  const mush = await page.evaluate(async () => {
    const g = window.__game; let found = null;
    g.scene.traverse((o) => { if (!found && o.isInstancedMesh && o.material.emissive && o.material.emissive.getHexString() === "2fbf8a" && o.count > 0) { const e = o.instanceMatrix.array; found = { n: o.count, x: e[12], z: e[14] }; } });
    if (found) { g.player.pos.set(found.x - 3, 0, found.z); g.cam.yaw = Math.PI / 2; await new Promise((r) => setTimeout(r, 1500)); }
    return found;
  });
  console.log("mushrooms:", JSON.stringify(mush));
  await shot(page, "33-forest-mushrooms.png");
  await page.evaluate(() => { const g = window.__game; g.player.pos.set(250, 0, 0); g.cam.yaw = Math.PI / 2; g.cam.dist = 20; g.cam.height = 12; });
  await page.waitForTimeout(1800);
  await shot(page, "34-desert-gate.png");
  const shards = await page.evaluate(async () => {
    const g = window.__game; let found = null;
    g.scene.traverse((o) => { if (!found && o.isInstancedMesh && o.material.emissive && o.material.emissive.getHexString() === "2aa6b8" && o.count > 0) { const e = o.instanceMatrix.array; found = { n: o.count, x: e[12], z: e[14] }; } });
    g.cam.dist = 15.5; g.cam.height = 10.5;
    if (found) { g.player.pos.set(found.x - 3, 0, found.z); g.cam.yaw = Math.PI / 2; await new Promise((r) => setTimeout(r, 1500)); }
    return found;
  });
  console.log("shards:", JSON.stringify(shards));
  await shot(page, "35-desert-shards.png");
  const desertOut = await page.evaluate(async () => {
    const g = window.__game; g.player.pos.set(999, 0, 0); await new Promise((r) => setTimeout(r, 300));
    const lim = { x: Math.round(g.player.pos.x), z: Math.round(g.player.pos.z) };
    const gc = g.enemies.find((e) => e.id === "glassColossus");
    const kinds = [...new Set(g.enemies.filter((e) => e.pos.x > 258 && !e.boss).map((e) => e.id))];
    g.player.hp = g.player.maxHp = 1500; g.enemies.forEach((e) => (e.attackCd = 99));
    g.player.pos.set(gc.pos.x - 9, 0, gc.pos.z); g.cam.yaw = Math.PI / 2; g.cam.dist = 20; g.cam.height = 12;
    await new Promise((r) => setTimeout(r, 2500));
    return { lim, kinds, boss: gc && { hp: gc.hp, state: gc.state, x: Math.round(gc.pos.x), z: Math.round(gc.pos.z) } };
  });
  console.log("desert:", JSON.stringify(desertOut));
  await shot(page, "36-desert-boss.png");
  // 빠른이동: 숲 어귀 봉화 점화 → T → 마지막 등불로
  const trav = await page.evaluate(async () => {
    const g = window.__game, b = g.beacons.find((x) => x.def.id === "bridgeLamp"), home = g.beacons.find((x) => x.def.id === "lastLight");
    b.lit = true; g.player.gold = 500; g.player.pos.set(b.pos.x + 1.5, 0, b.pos.z);
    return { gold: g.player.gold };
  });
  await page.keyboard.press("KeyT"); await page.waitForTimeout(300);
  await shot(page, "32-travel.png");
  const rows = await page.evaluate(() => [...document.querySelectorAll("#dialog .shop-row")].map((e) => e.textContent));
  await page.click('#dialog .shop-row[data-id="lastLight"]'); await page.waitForTimeout(300);
  const afterTravel = await page.evaluate(() => ({ gold: window.__game.player.gold, x: Math.round(window.__game.player.pos.x), z: Math.round(window.__game.player.pos.z), open: document.getElementById("dialog").classList.contains("open") }));
  console.log("travel:", JSON.stringify({ trav, rows, afterTravel }));
  await page.evaluate(() => window.__game.player.pos.set(0, 0, 3));

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
