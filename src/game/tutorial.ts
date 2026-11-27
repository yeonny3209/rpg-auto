// 첫 플레이 안내 상자 (상단 중앙). 진행도는 브라우저에 따로 저장한다.
import { $, loaded } from "./core";
import { advance, currentStep, restore, startTutorial, STEPS, tutorialDone, type TutorialState } from "../logic/tutorial";

const KEY = "emberlands.tutorial";
let st: TutorialState = startTutorial();
if (loaded) {
  try { st = restore(JSON.parse(localStorage.getItem(KEY) ?? "null")); } catch { /* 저장 불가/손상 → 처음부터 */ }
}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* 무시 */ } };

function render() {
  const el = $("tutorial");
  const step = currentStep(st);
  if (!step || tutorialDone(st)) { el.style.display = "none"; return; }
  el.style.display = "block";
  el.innerHTML = `<span class="tn">${st.index + 1}/${STEPS.length}</span> ${step.text}${step.need > 1 ? ` <span class="tc">(${Math.min(step.need, Math.floor(st.count))}/${step.need})</span>` : ""}`;
}

export function tutorialEvent(event: string, amount = 1) {
  const r = advance(st, event, amount);
  if (r.state === st) return;
  const stepChanged = r.state.index !== st.index;
  st = r.state;
  if (stepChanged) { persist(); $("tutorial").classList.add("flash"); setTimeout(() => $("tutorial").classList.remove("flash"), 500); }
  render();
}
export const tutorialState = () => st;
render();
persist();
