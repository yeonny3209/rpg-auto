import { describe, it, expect } from "vitest";
import { weightedPick } from "../src/logic/spawn";
import enemies from "../data/enemies.json";

describe("weightedPick", () => {
  const w = { a: 1, b: 3, c: 0 };
  it("구간에 따라 선택", () => {
    expect(weightedPick(w, 0)).toBe("a");
    expect(weightedPick(w, 0.24)).toBe("a");
    expect(weightedPick(w, 0.26)).toBe("b");
    expect(weightedPick(w, 1)).toBe("b");
  });
  it("가중치 0은 선택되지 않음", () => {
    for (let i = 0; i < 100; i++) expect(weightedPick(w, i / 100)).not.toBe("c");
  });
});

describe("enemies.json 데이터 무결성", () => {
  it("필수 필드와 양수 값", () => {
    for (const [id, e] of Object.entries(enemies) as [string, any][]) {
      for (const k of ["hp", "atk", "exp", "poise", "moveSpeed", "aggroRange", "attackRange", "windup", "size", "spawnWeight"])
        expect(e[k], `${id}.${k}`).toBeGreaterThan(0);
      expect(["melee", "ranged", "charger"]).toContain(e.ai);
      if (e.ai === "ranged") expect(e.projectileSpeed).toBeGreaterThan(0);
      if (e.ai === "charger") expect(e.chargeSpeed * e.chargeTime).toBeGreaterThan(e.attackRange * 0.8);
    }
  });
});
