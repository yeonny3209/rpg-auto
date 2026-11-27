import * as THREE from "three";
import { addGear, classGear, classAttack, classMoveMul, classDef, classStartAttrs, isClassId, NEUTRAL_ATTACK, type ClassId, type ClassAttack } from "../logic/classes";
import prog from "../../data/progression.json";
import combatCfg from "../../data/combat.json";
import { buildWorld } from "./world";
import { makePlayerMesh } from "./actors";
import { Fx } from "./fx";
import { buildBeacons, setLit, type Beacon } from "./beacons";
import wdata from "../../data/world.json";
import { engraveBonus, type Trace } from "../logic/embers";
import { type LevelState } from "../logic/progression";
import { derive, emptyAttrs, ATTR_KEYS, type Attrs } from "../logic/stats";
import { serialize, deserialize } from "../logic/save";
import { generateItem, equipmentStats, ITEM_CFG, type Item, type Equipment } from "../logic/items";
import { makeStamina, isInvulnerable } from "../logic/stamina";
import { emptyQuests, type QuestState } from "../logic/quests";
import { makeSkillState, noBuff, type SkillDef } from "../logic/skills";
import { type Enemy } from "./enemies";

// ---------- 기본 세팅 ----------
export const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById("app")!.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
export const world = buildWorld(scene);
export const env = { dark: 0 }; // 어둠 정도(0~1), 매 프레임 hud에서 갱신
export const beacons: Beacon[] = buildBeacons(scene, world.ruinMat, world.obstacles);
export const BC = wdata.beacon, EC = wdata.embers;
export const fx = new Fx(scene);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

export const AC = combatCfg.attack, HC = combatCfg.heavy, DC = combatCfg.dodge, PC = combatCfg.poise;


// ---------- 플레이어 ----------
export const { root: playerMesh, sword, cloth: playerCloth } = makePlayerMesh();
scene.add(playerMesh);
export const playerLight = new THREE.PointLight("#ffb366", 6, 7, 1.5);
playerLight.position.y = 1.4;
playerMesh.add(playerLight);

export const player = {
  pos: new THREE.Vector3(0, 0, 3),
  facing: 0,
  lv: { level: 1, exp: 0, statPoints: 0 } as LevelState,
  hp: prog.base.hp,
  maxHp: prog.base.hp,
  atk: prog.base.atk,
  def: prog.base.def,
  gold: 0,
  attackT: 0, // 공격 모션 남은 시간
  attackKind: "light" as "light" | "heavy",
  attackCd: 0,
  charging: false,
  chargeT: 0,
  hurtT: 0,
  dead: false,
  stamina: makeStamina(combatCfg.stamina),
  dodgeT: null as number | null, // 회피 시작 후 경과 시간 (null = 회피 중 아님)
  dodgeDir: new THREE.Vector3(),
  dodgeCd: 0,
  attrs: emptyAttrs() as Attrs,
  inventory: [] as Item[],
  equipment: {} as Equipment,
  embers: { held: 0, banked: 0 },
  respawnBeacon: "lastLight",
  trace: null as Trace | null,
  cls: null as ClassId | null,
  quests: emptyQuests() as QuestState,
  sk: makeSkillState(),
  buff: noBuff(),
  skillPower: 1,
  skillInvT: 0, // 스킬로 얻은 무적 시간
  dash: null as null | { dir: THREE.Vector3; t: number; speed: number; skill: SkillDef },
  moveMul: 1,
  atkMod: NEUTRAL_ATTACK as ClassAttack,
  crit: AC.critChance,
  dodgeCostMul: 1,
};
export const PLAYER_RADIUS = 0.4;
/** 회피 무적 프레임 또는 스킬 무적 */
export const playerInvulnerable = () => isInvulnerable(player.dodgeT, DC.iframe) || player.skillInvT > 0;

// 클래스 지정 (몸 색 + 능력치). 새로 고른 것이면 시작 속성도 배분한다.
export function setClass(id: ClassId | null, fresh: boolean) {
  player.cls = id;
  if (id) {
    playerCloth.color.set(classDef(id).color);
    sword.scale.z = classDef(id).attack.rangeMul; // 단검은 짧게, 지팡이는 길게
    if (fresh && ATTR_KEYS.every((k) => player.attrs[k] === 0)) player.attrs = classStartAttrs(id);
  }
  applyDerived(fresh);
}

// 레벨·속성 → 능력치 반영
export function applyDerived(fullHeal: boolean) {
  const gear = addGear(equipmentStats(player.equipment), classGear(player.cls));
  const eb = engraveBonus(player.embers.banked);
  gear.atkPct += eb.atkPct;
  gear.maxHp += eb.maxHp;
  const d = derive(player.lv.level, player.attrs, gear);
  const hpRatio = player.hp / player.maxHp;
  player.maxHp = d.maxHp;
  player.atk = d.atk;
  player.def = d.def;
  player.crit = d.critChance;
  player.dodgeCostMul = d.dodgeCostMul;
  player.skillPower = d.skillPower;
  player.moveMul = classMoveMul(player.cls);
  player.atkMod = classAttack(player.cls);
  player.stamina.max = d.maxStamina;
  player.hp = fullHeal ? d.maxHp : Math.max(1, Math.round(d.maxHp * hpRatio));
}

// ---------- 저장/불러오기 ----------
export const SAVE_KEY = "emberlands.save";
export function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, serialize({ level: player.lv.level, exp: player.lv.exp, statPoints: player.lv.statPoints, attrs: player.attrs, gold: player.gold, inventory: player.inventory, equipment: player.equipment,
      embers: player.embers, litBeacons: beacons.filter((b) => b.lit).map((b) => b.def.id), respawnBeacon: player.respawnBeacon, trace: player.trace, classId: player.cls, quests: player.quests }));
  } catch { /* 저장 불가 환경(시크릿 모드 등)은 무시 */ }
}
export function loadGame(): boolean {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return false; }
  const d = deserialize(raw, prog.maxLevel, ITEM_CFG.inventorySize);
  if (!d) return false;
  player.inventory = d.inventory;
  player.equipment = d.equipment;
  player.embers = d.embers;
  player.respawnBeacon = d.respawnBeacon;
  player.trace = d.trace;
  for (const b of beacons) if (d.litBeacons.includes(b.def.id)) setLit(b, true, false);
  player.lv = { level: d.level, exp: d.exp, statPoints: d.statPoints };
  player.attrs = d.attrs;
  player.gold = d.gold;
  player.quests = d.quests;
  setClass(d.classId, false);
  return true;
}
export const loaded = new URLSearchParams(location.search).has("fresh") ? false : loadGame();
if (!loaded) player.equipment = { weapon: generateItem(Math.random, 1, { baseId: "rustySword", rarity: "common" }) };
applyDerived(true);
{ // 테스트·스크린샷용: ?class=tracker 로 선택 화면을 건너뛴다
  const q = new URLSearchParams(location.search).get("class");
  if (!player.cls && isClassId(q)) setClass(q, true);
}
export const rb = beacons.find((b) => b.def.id === player.respawnBeacon && b.lit);
if (rb) player.pos.copy(rb.pos).add(new THREE.Vector3(0, 0, 3));
setInterval(saveGame, 10000);
addEventListener("beforeunload", saveGame);

// ---------- 카메라 ----------
export const cam = { yaw: 0, dist: 15.5, height: 10.5, target: null as Enemy | null };
export const camForward = () => new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));

export const ui = { stFlash: 0 };
export const keys = new Set<string>();

export const $ = (id: string) => document.getElementById(id)!;

let toastTimer = 0;
export function toast(msg: string) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 1600);
}
export interface Floater { el: HTMLElement; pos: THREE.Vector3; t: number }
export const floaters: Floater[] = [];
export function floater(pos: THREE.Vector3, text: string, cls: string) {
  const el = document.createElement("div");
  el.className = `dmg ${cls}`;
  el.textContent = text;
  $("floaters").appendChild(el);
  floaters.push({ el, pos, t: 0 });
}
export function flashStamina() { ui.stFlash = 0.4; }

