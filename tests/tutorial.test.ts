import { describe, it, expect } from "vitest";
import { STEPS, startTutorial, advance, currentStep, tutorialDone, restore } from "../src/logic/tutorial";

describe("tutorial", () => {
  it("단계 id 중복 없음, need는 양수", () => {
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
    for (const s of STEPS) expect(s.need).toBeGreaterThan(0);
  });
  it("현재 단계의 이벤트만 진행시킨다", () => {
    let s = startTutorial();
    expect(advance(s, "attack").state).toBe(s); // 아직 이동 단계
    s = advance(s, "move", 3).state;
    expect(s).toEqual({ index: 0, count: 3 });
    const r = advance(s, "move", 3);
    expect(r.completed?.id).toBe("move");
    expect(currentStep(r.state)?.id).toBe("attack");
  });
  it("끝까지 진행하면 완료, 그 뒤 이벤트는 무시", () => {
    let s = startTutorial();
    for (const st of STEPS) s = advance(s, st.event, st.need).state;
    expect(tutorialDone(s)).toBe(true);
    expect(advance(s, "move", 99).state).toBe(s);
  });
  it("0 이하·NaN 양은 무시", () => {
    const s = startTutorial();
    expect(advance(s, "move", 0).state).toBe(s);
    expect(advance(s, "move", NaN).state).toBe(s);
    expect(advance(s, "move", -3).state).toBe(s);
  });
  it("저장 복원은 이상한 값을 처음으로 되돌린다", () => {
    expect(restore(null)).toEqual({ index: 0, count: 0 });
    expect(restore({ index: -1, count: 0 })).toEqual({ index: 0, count: 0 });
    expect(restore({ index: 999, count: 0 })).toEqual({ index: 0, count: 0 });
    expect(restore({ index: 2, count: 0 })).toEqual({ index: 2, count: 0 });
    expect(restore({ index: STEPS.length, count: 5 })).toEqual({ index: STEPS.length, count: 0 });
  });
});
