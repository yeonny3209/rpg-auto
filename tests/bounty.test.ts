import { describe, it, expect } from "vitest";
import { makeOffers, accept, abandon, reportKill, progressOf, turnIn, sanitizeBounty, emptyBounty, BOUNTY } from "../src/logic/bounty";
import enemies from "../data/enemies.json";

describe("의뢰 제안", () => {
  it("같은 시드·레벨이면 같은 목록, 서로 다른 템플릿 3개", () => {
    const a = makeOffers(5, 4), b = makeOffers(5, 4);
    expect(a).toEqual(b);
    expect(a.length).toBe(BOUNTY.offers);
    expect(new Set(a.map((o) => o.tpl)).size).toBe(a.length);
    expect(makeOffers(6, 4)).not.toEqual(a);
  });
  it("레벨이 높을수록 목표와 보상이 크다", () => {
    const lo = makeOffers(7, 8), hi = makeOffers(7, 20); // 같은 템플릿 풀(숲 의뢰 해금 레벨 이상)에서 비교
    for (let i = 0; i < lo.length; i++) { expect(hi[i].tpl).toBe(lo[i].tpl); expect(hi[i].goal).toBeGreaterThan(lo[i].goal); expect(hi[i].gold).toBeGreaterThan(lo[i].gold); }
  });
  it("처치 대상은 실제 적이고 보상은 양수, 비급은 가끔만", () => {
    let books = 0;
    for (let seed = 1; seed <= 60; seed++) for (const o of makeOffers(seed, 6)) {
      if (o.type === "kill" && o.target !== "*") expect((enemies as any)[o.target]).toBeTruthy();
      expect(o.gold).toBeGreaterThan(0); expect(o.exp).toBeGreaterThan(0); expect(o.goal).toBeGreaterThan(0);
      books += o.skillBook;
    }
    expect(books).toBeGreaterThan(10); expect(books).toBeLessThan(80);
  });
});

describe("진행", () => {
  const kill = (id: string) => makeOffers(1, 3).concat(makeOffers(2, 3), makeOffers(3, 3)).find((o) => o.type === "kill" && o.target === id)!;
  it("하나만 수락할 수 있다", () => {
    const o = makeOffers(1, 3);
    const s = accept(emptyBounty(), o[0]);
    expect(accept(s, o[1])).toBe(s);
  });
  it("일반 처치는 보스를 세지 않고, 특정 처치는 일치하는 적만 센다", () => {
    const any = makeOffers(1, 3).concat(makeOffers(2, 3), makeOffers(3, 3), makeOffers(4, 3)).find((o) => o.target === "*")!;
    let s = accept(emptyBounty(), any);
    s = reportKill(s, "boarKing"); expect(s.active!.progress).toBe(0);
    s = reportKill(s, "ashCrawler"); expect(s.active!.progress).toBe(1);
    const spec = kill("ashCrawler");
    if (spec) { let t = accept(emptyBounty(), spec); t = reportKill(t, "ashSpitter"); expect(t.active!.progress).toBe(0); t = reportKill(t, "ashCrawler"); expect(t.active!.progress).toBe(1); }
  });
  it("목표를 채우면 보고 가능, 보상과 함께 새 목록(시드+1)·완료 횟수 증가", () => {
    const o = { ...makeOffers(1, 3)[0], type: "kill" as const, target: "ashCrawler", goal: 2, tpl: "huntCrawler" };
    let s = accept(emptyBounty(), o);
    expect(turnIn(s, {}).ok).toBe(false);
    s = reportKill(reportKill(s, "ashCrawler"), "ashCrawler");
    s = reportKill(s, "ashCrawler"); // 목표 초과는 세지 않음
    expect(progressOf(s, {})).toEqual({ cur: 2, goal: 2, ready: true });
    const r = turnIn(s, {});
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.state).toEqual({ seed: 2, active: null, done: 1 }); expect(r.gold).toBe(o.gold); }
  });
  it("납품 의뢰: 재료가 모자라면 불가, 충분하면 재료를 정확히 차감", () => {
    const o = { ...makeOffers(1, 3)[0], type: "collect" as const, target: "ashLump", goal: 5, tpl: "gatherLump" };
    const s = accept(emptyBounty(), o);
    expect(turnIn(s, { ashLump: 4 }).ok).toBe(false);
    expect(progressOf(s, { ashLump: 99 })!.cur).toBe(5);
    const r = turnIn(s, { ashLump: 7 });
    expect(r.ok && r.bag.ashLump).toBe(2);
  });
  it("포기하면 진행도는 사라지고 새 목록", () => {
    const s = abandon(accept(emptyBounty(), makeOffers(1, 3)[0]));
    expect(s.active).toBeNull(); expect(s.seed).toBe(2);
    expect(abandon(s)).toBe(s);
  });
});

describe("저장 정리", () => {
  it("잘못된 값은 기본값으로, 유효한 진행은 유지", () => {
    expect(sanitizeBounty(null)).toEqual(emptyBounty());
    expect(sanitizeBounty({ seed: -3, done: "x", active: { tpl: "nope" } })).toEqual(emptyBounty());
    const o = makeOffers(3, 5)[0];
    const s = sanitizeBounty({ seed: 3, done: 2, active: { ...o, progress: 999 } });
    expect(s.active!.progress).toBe(o.goal);
    expect(s.seed).toBe(3); expect(s.done).toBe(2);
    expect(sanitizeBounty({ seed: 3, active: { ...o, type: "collect", target: "junk" } }).active).toBeNull();
  });
});

describe("숲 의뢰 (minLevel)", () => {
  it("낮은 레벨에는 숲 의뢰가 나오지 않는다", async () => {
    const { makeOffers } = await import("../src/logic/bounty");
    for (let seed = 1; seed < 60; seed++) for (const o of makeOffers(seed, 3)) expect(["huntLeech", "huntSpore", "huntBrute", "gatherSap"]).not.toContain(o.tpl);
  });
  it("레벨 8이면 숲 의뢰가 나올 수 있다", async () => {
    const { makeOffers } = await import("../src/logic/bounty");
    const seen = new Set<string>();
    for (let seed = 1; seed < 80; seed++) for (const o of makeOffers(seed, 8)) seen.add(o.tpl);
    expect(seen.has("gatherSap") || seen.has("huntLeech")).toBe(true);
  });
});
