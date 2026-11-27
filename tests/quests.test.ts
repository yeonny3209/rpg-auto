import { describe, it, expect } from "vitest";
import { QUESTS, NPCS, emptyQuests, accept, progress, turnIn, isAvailable, isReady, dialogFor, markerFor, sanitize, questDef, type QuestState } from "../src/logic/quests";
import enemyData from "../data/enemies.json";
import world from "../data/world.json";

describe("퀘스트 데이터 무결성", () => {
  it("id 중복 없음, 의뢰인·보고 NPC·선행 퀘스트가 실제로 존재", () => {
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const q of QUESTS) {
      expect(NPCS.some((n) => n.id === q.giver)).toBe(true);
      expect(NPCS.some((n) => n.id === q.turnIn)).toBe(true);
      for (const r of q.requires) expect(ids).toContain(r);
      expect(q.objectives.length).toBeGreaterThan(0);
    }
  });
  it("목표 대상은 실제 적/봉화, 목표 수는 양수", () => {
    for (const q of QUESTS) for (const o of q.objectives) {
      expect(o.count).toBeGreaterThan(0);
      if (o.type === "kill") expect(Object.keys(enemyData)).toContain(o.target);
      else expect(world.beacons.map((b) => b.id)).toContain(o.target);
    }
  });
  it("선행 퀘스트가 순환하지 않는다(모두 시작→완료 가능)", () => {
    let qs: QuestState = emptyQuests();
    for (let guard = 0; guard < 20; guard++) {
      const q = QUESTS.find((x) => isAvailable(qs, x));
      if (!q) break;
      qs = { active: {}, done: [...qs.done, q.id] };
    }
    expect(qs.done.length).toBe(QUESTS.length);
  });
});

describe("퀘스트 진행", () => {
  it("수락 → 처치 진행 → 완료 → 보고", () => {
    let qs = accept(emptyQuests(), "main1")!;
    expect(qs.active.main1).toEqual([0]);
    for (let i = 0; i < 4; i++) qs = progress(qs, "kill", "ashCrawler").qs;
    expect(isReady(qs, questDef("main1")!)).toBe(false);
    const r = progress(qs, "kill", "ashCrawler");
    expect(r.completed).toEqual(["main1"]);
    expect(progress(r.qs, "kill", "ashCrawler").qs.active.main1).toEqual([5]); // 초과 집계 없음
    const t = turnIn(r.qs, "main1")!;
    expect(t.rewards.exp).toBe(50);
    expect(t.qs.done).toEqual(["main1"]);
    expect(t.qs.active.main1).toBeUndefined();
  });
  it("다른 대상은 집계하지 않고, 수락 안 한 퀘스트는 진행되지 않는다", () => {
    const qs = accept(emptyQuests(), "main1")!;
    expect(progress(qs, "kill", "ashSpitter").changed).toEqual([]);
    expect(progress(emptyQuests(), "kill", "ashCrawler").changed).toEqual([]);
  });
  it("선행 퀘스트 없이는 수락 불가, 중복 수락 불가", () => {
    expect(accept(emptyQuests(), "main2")).toBeNull();
    const qs = accept(emptyQuests(), "main1")!;
    expect(accept(qs, "main1")).toBeNull();
    expect(accept(emptyQuests(), "nope")).toBeNull();
  });
  it("미완료 상태에서 보고 불가", () => {
    expect(turnIn(accept(emptyQuests(), "main1")!, "main1")).toBeNull();
  });
  it("여러 목표 퀘스트는 모두 채워야 완료", () => {
    let qs: QuestState = { active: { main3: [0, 0] }, done: ["main1", "main2"] };
    for (let i = 0; i < 3; i++) qs = progress(qs, "kill", "ashSpitter").qs;
    expect(isReady(qs, questDef("main3")!)).toBe(false);
    qs = progress(qs, "kill", "ashCharger").qs;
    const r = progress(qs, "kill", "ashCharger");
    expect(r.completed).toEqual(["main3"]);
  });
  it("한 번의 처치가 여러 퀘스트에 동시에 반영", () => {
    const qs: QuestState = { active: { main1: [0], side1: [0] }, done: [] };
    expect(progress(qs, "kill", "ashCrawler").changed.sort()).toEqual(["main1", "side1"]);
  });
  it("봉화 목표", () => {
    const qs: QuestState = { active: { main2: [0] }, done: ["main1"] };
    expect(progress(qs, "beacon", "eastFields").changed).toEqual([]);
    expect(progress(qs, "beacon", "northRuins").completed).toEqual(["main2"]);
  });
});

describe("대화·표식", () => {
  const priest = NPCS.find((n) => n.id === "priest")!;
  const smith = NPCS.find((n) => n.id === "smith")!;
  it("처음엔 제안 → 진행 중 → 보고 → (다음 퀘스트 제안)", () => {
    let qs = emptyQuests();
    expect(dialogFor(priest, qs).kind).toBe("offer");
    expect(dialogFor(priest, qs).quest?.id).toBe("main1");
    expect(markerFor(priest, qs)).toBe("offer");
    qs = accept(qs, "main1")!;
    expect(dialogFor(priest, qs).kind).toBe("progress");
    expect(markerFor(priest, qs)).toBeNull();
    for (let i = 0; i < 5; i++) qs = progress(qs, "kill", "ashCrawler").qs;
    expect(dialogFor(priest, qs).kind).toBe("turnin");
    expect(markerFor(priest, qs)).toBe("turnin");
    qs = turnIn(qs, "main1")!.qs;
    expect(dialogFor(priest, qs).quest?.id).toBe("main2");
  });
  it("줄 퀘스트가 없는 NPC는 잡담", () => {
    expect(dialogFor(smith, emptyQuests()).kind).toBe("idle");
    expect(markerFor(smith, emptyQuests())).toBeNull();
  });
});

describe("저장 검증", () => {
  it("알 수 없는 퀘스트·이상한 값 정리", () => {
    const s = sanitize({ done: ["main1", "ghost", 3, "main1"], active: { main2: [99], ghost: [1], main1: [2] } });
    expect(s.done).toEqual(["main1"]);
    expect(s.active.main2).toEqual([1]); // 목표치로 제한
    expect(s.active.ghost).toBeUndefined();
    expect(s.active.main1).toBeUndefined(); // 이미 완료된 퀘스트는 활성에서 제거
  });
  it("쓰레기 입력은 빈 상태", () => {
    expect(sanitize(null)).toEqual(emptyQuests());
    expect(sanitize("x")).toEqual(emptyQuests());
    expect(sanitize({ active: { main1: "no" }, done: "no" })).toEqual(emptyQuests());
  });
});
