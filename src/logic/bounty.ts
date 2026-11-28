// 반복 의뢰 게시판: 시드로 3개 의뢰를 제안 → 하나를 수락 → 처치/납품 → 보상 후 새 의뢰. 수치는 data/bounties.json.
import cfg from "../../data/bounties.json";
import enemies from "../../data/enemies.json";
import { bagTake, countOf, type Bag, type MatId, isMatId, MATS } from "./bag";

export interface Offer {
  tpl: string; type: "kill" | "collect"; target: string; name: string; text: string; goal: number;
  gold: number; exp: number; skillBook: number;
}
export interface Active extends Offer { progress: number }
export interface BountyState { seed: number; active: Active | null; done: number }
export const emptyBounty = (): BountyState => ({ seed: 1, active: null, done: 0 });
export const BOUNTY = cfg;

function rngOf(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 이 시드·레벨의 제안 목록(같은 입력이면 항상 같다). 서로 다른 템플릿으로 뽑는다. */
export function makeOffers(seed: number, level: number): Offer[] {
  const r = rngOf(seed);
  const pool = cfg.templates.filter((t) => ((t as { minLevel?: number }).minLevel ?? 1) <= level);
  const out: Offer[] = [];
  for (let i = 0; i < cfg.offers && pool.length; i++) {
    const t = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const goal = Math.max(1, Math.round((t.base + t.perLevel * level) * (0.9 + r() * 0.3)));
    const lvMul = 1 + cfg.goldLevelMul * level;
    out.push({
      tpl: t.id, type: t.type as Offer["type"], target: t.target, name: t.name, text: t.text.replace("{goal}", String(goal)), goal,
      gold: Math.round(goal * t.goldPer * lvMul), exp: Math.round(goal * t.expPer * lvMul),
      skillBook: (seed + i) % cfg.bookEvery === 0 ? 1 : 0,
    });
  }
  return out;
}

export function accept(s: BountyState, offer: Offer): BountyState {
  if (s.active) return s;
  return { ...s, active: { ...offer, progress: 0 } };
}
/** 포기: 진행도는 사라지고 새 의뢰 목록으로 넘어간다 */
export function abandon(s: BountyState): BountyState { return s.active ? { ...s, active: null, seed: s.seed + 1 } : s; }

/** 처치 보고. 일반 적만 센다("*")·특정 적은 id 일치 */
export function reportKill(s: BountyState, enemyId: string): BountyState {
  const a = s.active;
  if (!a || a.type !== "kill" || a.progress >= a.goal) return s;
  const def = (enemies as Record<string, { ai: string }>)[enemyId];
  const ok = a.target === "*" ? def && def.ai !== "boss" : a.target === enemyId;
  return ok ? { ...s, active: { ...a, progress: a.progress + 1 } } : s;
}
export function progressOf(s: BountyState, bag: Bag): { cur: number; goal: number; ready: boolean } | null {
  const a = s.active;
  if (!a) return null;
  const cur = a.type === "collect" ? Math.min(a.goal, isMatId(a.target) ? countOf(bag, a.target) : 0) : a.progress;
  return { cur, goal: a.goal, ready: cur >= a.goal };
}

export type TurnIn = { ok: true; state: BountyState; bag: Bag; gold: number; exp: number; skillBook: number } | { ok: false };
export function turnIn(s: BountyState, bag: Bag): TurnIn {
  const a = s.active, p = progressOf(s, bag);
  if (!a || !p?.ready) return { ok: false };
  let b = bag;
  if (a.type === "collect") { const nb = bagTake(bag, a.target as MatId, a.goal); if (!nb) return { ok: false }; b = nb; }
  return { ok: true, state: { seed: s.seed + 1, active: null, done: s.done + 1 }, bag: b, gold: a.gold, exp: a.exp, skillBook: a.skillBook };
}

export function sanitizeBounty(raw: unknown): BountyState {
  const base = emptyBounty();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, any>;
  const seed = Number.isFinite(o.seed) && o.seed >= 1 ? Math.floor(o.seed) : 1;
  const done = Number.isFinite(o.done) && o.done >= 0 ? Math.floor(o.done) : 0;
  const a = o.active;
  const tpl = a && cfg.templates.find((t) => t.id === a.tpl);
  const valid = a && tpl && Number.isFinite(a.goal) && a.goal >= 1 && a.goal <= 999 && Number.isFinite(a.progress) && a.progress >= 0 &&
    Number.isFinite(a.gold) && Number.isFinite(a.exp) && (a.type === "kill" || (a.type === "collect" && isMatId(a.target) && MATS[a.target as MatId]));
  if (!valid) return { seed, active: null, done };
  return { seed, done, active: { tpl: a.tpl, type: a.type, target: String(a.target), name: String(a.name), text: String(a.text), goal: Math.floor(a.goal), gold: Math.max(0, Math.floor(a.gold)), exp: Math.max(0, Math.floor(a.exp)), skillBook: a.skillBook ? 1 : 0, progress: Math.min(Math.floor(a.progress), Math.floor(a.goal)) } };
}
