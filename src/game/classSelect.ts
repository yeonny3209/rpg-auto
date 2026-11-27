// 시작 화면: 클래스 3종 중 하나를 고른다. 이미 클래스가 있는 저장이면 건너뛴다.
import { $, player, setClass, saveGame, toast } from "./core";
import { CLASS_IDS, classDef, classGear, type ClassId } from "../logic/classes";
import { ATTR_KEYS } from "../logic/stats";
import prog from "../../data/progression.json";
import { sfx } from "./sfx";

const ATTR_NAME = prog.attributes as Record<string, { name: string }>;

function perks(id: ClassId): string[] {
  const d = classDef(id), g = classGear(id), out: string[] = [];
  out.push(`무기 <b>${d.weapon}</b>`);
  const a = Object.entries(d.startAttrs).filter(([, v]) => v > 0).map(([k, v]) => `${ATTR_NAME[k].name} +${v}`);
  if (a.length) out.push(`시작 속성 <b>${a.join(", ")}</b>`);
  if (g.maxHp) out.push(`최대 HP <b>${g.maxHp > 0 ? "+" : ""}${g.maxHp}</b>`);
  if (g.maxStamina) out.push(`스태미나 <b>+${g.maxStamina}</b>`);
  if (g.def) out.push(`방어력 <b>${g.def > 0 ? "+" : ""}${g.def}</b>`);
  if (g.crit) out.push(`치명타 <b>+${Math.round(g.crit * 100)}%</b>`);
  if (g.atkPct) out.push(`공격력 <b>+${Math.round(g.atkPct * 100)}%</b>`);
  const at = d.attack;
  const pct = (m: number) => `${m > 1 ? "+" : ""}${Math.round((m - 1) * 100)}%`;
  if (at.rangeMul !== 1) out.push(`공격 범위 <b>${pct(at.rangeMul)}</b>`);
  if (at.arcMul !== 1) out.push(`공격 각도 <b>${pct(at.arcMul)}</b>`);
  if (at.cooldownMul !== 1) out.push(`공격 속도 <b>${at.cooldownMul < 1 ? "+" : ""}${Math.round((1 / at.cooldownMul - 1) * 100)}%</b>`);
  if (d.moveSpeedMul !== 1) out.push(`이동 속도 <b>${pct(d.moveSpeedMul)}</b>`);
  return out;
}

export function choose(id: ClassId) {
  setClass(id, true);
  $("classSelect").classList.remove("open");
  saveGame();
  sfx.levelUp();
  toast(`${classDef(id).name} — 불씨를 들고 일어난다`);
}

export function openClassSelect() {
  const el = $("classSelect");
  el.innerHTML = `<h1>잔불의 대지</h1><div class="sub">점화자의 길을 고르라 (1·2·3 키로도 선택)</div>
    <div class="cards">${CLASS_IDS.map((id, i) => {
      const d = classDef(id);
      return `<button class="class-card" data-id="${id}" style="--c:${d.color}">
        <div class="emblem"></div><h2>${d.name}</h2><div class="ttl">${d.title}</div>
        <div class="desc">${d.desc}</div><ul>${perks(id).map((p) => `<li>${p}</li>`).join("")}</ul>
        <div class="key">${i + 1}</div></button>`;
    }).join("")}</div>`;
  el.classList.add("open");
  el.querySelectorAll<HTMLElement>(".class-card").forEach((c) => c.addEventListener("click", () => choose(c.dataset.id as ClassId)));
}

addEventListener("keydown", (e) => {
  if (!$("classSelect").classList.contains("open")) return;
  const i = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
  if (i >= 0 && CLASS_IDS[i]) choose(CLASS_IDS[i]);
});

if (!player.cls) openClassSelect();
