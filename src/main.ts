import * as THREE from "three";
import { castSkill } from "./game/player";
import { updateBeacons } from "./game/beacons";
import { generateItem } from "./logic/items";
import { $, beacons, cam, camForward, camera, fx, loaded, player, renderer, saveGame, scene, toast, world } from "./game/core";
import { enemies, type Enemy, updateEnemies, updateProjectiles } from "./game/enemies";
import { hurtPlayer, releaseCharge, startCharge, toggleLockOn, tryAttack, tryDodge, updatePlayer } from "./game/player";
import { interact, updateBeacon, updateTrace } from "./game/sanctuary";
import { spawnLoot, updateLoot } from "./game/loot";
import { spendPoint, toggleCharPanel, toggleInvPanel } from "./game/panels";
import { drawMinimap, updateFloaters, updateHud } from "./game/hud";
import { fadedMat, updateCamera, updateOcclusion } from "./game/camera";
import "./game/input";
import "./game/hud";
import "./game/panels";
import "./game/classSelect";

const clock = new THREE.Clock();
function frame() {
  const realDt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  // 히트스톱: 잠깐 게임 시간을 멈춘다 (카메라·이펙트는 계속)
  let dt = realDt;
  const paused = document.querySelector("#charPanel.open, #invPanel.open, #classSelect.open") !== null;
  if (paused) dt = 0; // 창을 열면 게임 시간 정지
  else if (fx.hitstop > 0) {
    fx.hitstop -= realDt;
    dt = realDt * 0.05;
  }
  updatePlayer(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateLoot(dt);
  updateBeacon(dt);
  updateBeacons(beacons, t, realDt);
  updateTrace(dt, t);
  fx.update(realDt);
  updateCamera(realDt);
  updateOcclusion();

  renderer.render(scene, camera);
  updateFloaters(realDt);
  updateHud();
  drawMinimap();
  requestAnimationFrame(frame);
}
// 첫 프레임 카메라 위치
camera.position.copy(player.pos).addScaledVector(camForward(), -cam.dist * 0.74).setY(cam.height);
frame();
if (loaded) toast(`이어하기 — Lv ${player.lv.level}`);

// 테스트·스크린샷용 디버그 핸들 (게임 플레이에 영향 없음)
(window as any).__game = {
  player,
  enemies,
  cam,
  attack: tryAttack,
  cast: castSkill,
  dodge: tryDodge,
  startCharge,
  releaseCharge,
  lockOn: toggleLockOn,
  toggleCharPanel,
  toggleInvPanel,
  spawnLoot: (rarity: string, baseId?: string) => spawnLoot(generateItem(Math.random, player.lv.level, { rarity: rarity as any, baseId }), player.pos.clone().add(new THREE.Vector3(1.2, 0, 1.2))),
  spendPoint,
  save: saveGame,
  beacons,
  interact,
  hurt: hurtPlayer,
  fadedCount: () => fadedMat.size,
  obstacles: world.obstacles,
  occluders: world.occluders,
  nearest(filter?: string) {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of enemies) {
      if (e.state === "dead" || (filter && e.id !== filter)) continue;
      const d = e.pos.distanceTo(player.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },
  faceNearest() {
    const best = (window as any).__game.nearest();
    if (!best) return Infinity;
    const to = best.pos.clone().sub(player.pos);
    player.facing = Math.atan2(to.x, to.z);
    return to.length();
  },
};

