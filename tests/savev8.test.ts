import { describe, it, expect } from "vitest";
import { serialize, deserialize } from "../src/logic/save";

const base: any = {
  level: 20, exp: 0, statPoints: 0, attrs: { str: 5, agi: 5, wis: 5, vit: 5 }, gold: 10,
  inventory: [], equipment: {}, embers: { held: 0, banked: 0 }, litBeacons: [], respawnBeacon: "lastLight",
  trace: null, classId: "vanguard", quests: { active: {}, done: [] }, bag: {}, skillLv: {},
};

describe("save v8", () => {
  it("v7 저장은 spec null / 빈 의뢰로 이전된다", () => {
    const raw = JSON.stringify({ version: 7, savedAt: 1, ...base });
    const d = deserialize(raw);
    expect(d).not.toBeNull();
    expect(d!.spec).toBeNull();
    expect(d!.bounty.active).toBeNull();
    expect(d!.bounty.done).toBe(0);
  });
  it("다른 직업의 전문화는 버려진다", () => {
    const raw = serialize({ ...base, spec: "sniper", bounty: { seed: 1, active: null, done: 0 } });
    expect(deserialize(raw)!.spec).toBeNull();
  });
  it("올바른 전문화는 유지된다", () => {
    const raw = serialize({ ...base, spec: "guardian", bounty: { seed: 3, active: null, done: 2 } });
    const d = deserialize(raw)!;
    expect(d.spec).toBe("guardian");
    expect(d.bounty.done).toBe(2);
  });
});
