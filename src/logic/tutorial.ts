// 첫 30분 안내: 순서대로 한 단계씩, 해당 이벤트를 충분히 하면 다음으로. (렌더링 무관)
import cfg from "../../data/tutorial.json";

export interface TutorialStep { id: string; event: string; text: string; need: number }
export const STEPS = cfg.steps as TutorialStep[];
export interface TutorialState { index: number; count: number }
export const startTutorial = (): TutorialState => ({ index: 0, count: 0 });
export const tutorialDone = (s: TutorialState) => s.index >= STEPS.length;
export const currentStep = (s: TutorialState): TutorialStep | null => STEPS[s.index] ?? null;

/** 이벤트 amount만큼 진행. 현재 단계와 다른 이벤트는 무시. 단계가 끝나면 completed에 그 단계를 담는다. */
export function advance(s: TutorialState, event: string, amount = 1): { state: TutorialState; completed: TutorialStep | null } {
  const step = currentStep(s);
  if (!step || step.event !== event || !(amount > 0)) return { state: s, completed: null };
  const count = s.count + amount;
  if (count >= step.need) return { state: { index: s.index + 1, count: 0 }, completed: step };
  return { state: { index: s.index, count }, completed: null };
}
/** 저장된 값 복원(이상하면 처음부터) */
export function restore(raw: unknown): TutorialState {
  const o = raw as any;
  if (o && Number.isInteger(o.index) && o.index >= 0 && o.index <= STEPS.length && Number.isFinite(o.count) && o.count >= 0) return { index: o.index, count: o.index >= STEPS.length ? 0 : o.count };
  return startTutorial();
}
