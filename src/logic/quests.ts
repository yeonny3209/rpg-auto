// 퀘스트 진행 로직 (렌더링 무관). 데이터는 data/quests.json, NPC는 data/npcs.json.
import qdata from "../../data/quests.json";
import ndata from "../../data/npcs.json";

export interface Objective { type: "kill" | "beacon"; target: string; count: number; label: string }
export interface Rewards { exp?: number; gold?: number; item?: { rarity: string } }
export interface QuestDef {
  id: string; chapter: string; name: string; giver: string; turnIn: string; requires: string[];
  objectives: Objective[]; rewards: Rewards; text: { offer: string; progress: string; done: string };
}
export interface NpcDef { id: string; name: string; role: string; x: number; z: number; color: string; style: string; idle: string }
export interface QuestState { active: Record<string, number[]>; done: string[] }

export const QUESTS = qdata.quests as QuestDef[];
export const NPCS = ndata.npcs as NpcDef[];
export const questDef = (id: string) => QUESTS.find((q) => q.id === id);
export const emptyQuests = (): QuestState => ({ active: {}, done: [] });

export const isDone = (qs: QuestState, id: string) => qs.done.includes(id);
export const isActive = (qs: QuestState, id: string) => Object.prototype.hasOwnProperty.call(qs.active, id);
export const isAvailable = (qs: QuestState, q: QuestDef) => !isDone(qs, q.id) && !isActive(qs, q.id) && q.requires.every((r) => isDone(qs, r));
export const isReady = (qs: QuestState, q: QuestDef) => isActive(qs, q.id) && q.objectives.every((o, i) => qs.active[q.id][i] >= o.count);

export function accept(qs: QuestState, id: string): QuestState | null {
  const q = questDef(id);
  if (!q || !isAvailable(qs, q)) return null;
  return { ...qs, active: { ...qs.active, [id]: q.objectives.map(() => 0) } };
}

/** 이벤트(처치/봉화)로 목표 진행. 진행도가 바뀐 퀘스트 id와 새로 완료(보고 가능)된 id를 함께 반환. */
export function progress(qs: QuestState, type: Objective["type"], target: string): { qs: QuestState; changed: string[]; completed: string[] } {
  const active = { ...qs.active };
  const changed: string[] = [], completed: string[] = [];
  for (const id of Object.keys(active)) {
    const q = questDef(id);
    if (!q) continue;
    const before = isReady(qs, q);
    let touched = false;
    const prog = active[id].slice();
    q.objectives.forEach((o, i) => {
      if (o.type === type && o.target === target && prog[i] < o.count) { prog[i]++; touched = true; }
    });
    if (!touched) continue;
    active[id] = prog;
    changed.push(id);
    const next = { ...qs, active };
    if (!before && isReady(next, q)) completed.push(id);
  }
  return { qs: changed.length ? { ...qs, active } : qs, changed, completed };
}

/** 보고(완료) 처리: 활성에서 빼고 완료 목록에 넣는다. 보상은 호출 쪽에서 지급. */
export function turnIn(qs: QuestState, id: string): { qs: QuestState; rewards: Rewards } | null {
  const q = questDef(id);
  if (!q || !isReady(qs, q)) return null;
  const { [id]: _drop, ...rest } = qs.active;
  return { qs: { active: rest, done: [...qs.done, id] }, rewards: q.rewards };
}

export type DialogKind = "turnin" | "progress" | "offer" | "idle";
export interface Dialog { kind: DialogKind; quest?: QuestDef; text: string }
/** NPC와 대화했을 때 보여줄 내용: 보고 > 진행 중 > 새 퀘스트 > 잡담 */
export function dialogFor(npc: NpcDef, qs: QuestState): Dialog {
  const ready = QUESTS.find((q) => q.turnIn === npc.id && isReady(qs, q));
  if (ready) return { kind: "turnin", quest: ready, text: ready.text.done };
  const doing = QUESTS.find((q) => q.giver === npc.id && isActive(qs, q.id));
  if (doing) return { kind: "progress", quest: doing, text: doing.text.progress };
  const offer = QUESTS.find((q) => q.giver === npc.id && isAvailable(qs, q));
  if (offer) return { kind: "offer", quest: offer, text: offer.text.offer };
  return { kind: "idle", text: npc.idle };
}

/** 머리 위 표식: 보고 가능 '?', 새 퀘스트 '!', 없으면 null */
export function markerFor(npc: NpcDef, qs: QuestState): "turnin" | "offer" | null {
  const d = dialogFor(npc, qs);
  return d.kind === "turnin" ? "turnin" : d.kind === "offer" ? "offer" : null;
}

/** 저장 데이터 검증: 알 수 없는 퀘스트·잘못된 진행도는 버리고 값은 목표치로 제한 */
export function sanitize(raw: unknown): QuestState {
  const out = emptyQuests();
  const o = raw as any;
  if (!o || typeof o !== "object") return out;
  if (Array.isArray(o.done)) out.done = [...new Set<string>(o.done.filter((d: unknown): d is string => typeof d === "string" && !!questDef(d)))];
  if (o.active && typeof o.active === "object") {
    for (const [id, arr] of Object.entries(o.active)) {
      const q = questDef(id);
      if (!q || out.done.includes(id) || !Array.isArray(arr)) continue;
      out.active[id] = q.objectives.map((ob, i) => {
        const v = (arr as unknown[])[i];
        return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(ob.count, Math.floor(v)) : 0;
      });
    }
  }
  return out;
}
