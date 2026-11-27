import * as THREE from "three";
import { cam, keys, renderer } from "./core";
import { releaseCharge, startCharge, toggleLockOn, tryAttack, tryDodge } from "./player";
import { interact } from "./sanctuary";
import { toggleCharPanel, toggleInvPanel } from "./panels";

addEventListener("keydown", (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === "KeyJ") tryAttack();
  if (e.code === "KeyK") startCharge();
  if (e.code === "Space") { e.preventDefault(); tryDodge(); }
  if (e.code === "Tab") { e.preventDefault(); toggleLockOn(); }
  if (e.code === "KeyC") toggleCharPanel();
  if (e.code === "KeyI") toggleInvPanel();
  if (e.code === "KeyF" || e.code === "KeyR") interact();
});
addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "KeyK") releaseCharge();
});
export const canvas = renderer.domElement;
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
export let dragging = false;
canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) tryAttack();
  if (e.button === 2) startCharge();
  if (e.button === 1) { dragging = true; e.preventDefault(); }
});
addEventListener("mouseup", (e) => {
  if (e.button === 2) releaseCharge();
  if (e.button === 1) dragging = false;
});
addEventListener("mousemove", (e) => {
  if (dragging) { cam.yaw -= e.movementX * 0.006; cam.target = null; }
});
canvas.addEventListener("wheel", (e) => {
  cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.01, 9, 24);
  cam.height = cam.dist * 0.68;
});
