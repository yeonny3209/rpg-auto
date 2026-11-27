import * as THREE from "three";
import { cam, camForward, camera, fx, keys, player, world } from "./core";

export function updateCamera(dt: number) {
  if (keys.has("KeyQ")) { cam.yaw += dt * 2.2; cam.target = null; }
  if (keys.has("KeyE")) { cam.yaw -= dt * 2.2; cam.target = null; }
  if (cam.target) {
    if (cam.target.state === "dead" || cam.target.pos.distanceTo(player.pos) > 22) cam.target = null;
    else {
      const to = cam.target.pos.clone().sub(player.pos);
      const want = Math.atan2(to.x, to.z);
      let diff = want - cam.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      cam.yaw += diff * Math.min(1, dt * 4);
    }
  }
  const f = camForward();
  const want = player.pos.clone().addScaledVector(f, -cam.dist * 0.74).setY(cam.height);
  camera.position.lerp(want, Math.min(1, dt * 6));
  camera.lookAt(player.pos.x, player.pos.y + 1, player.pos.z);
  fx.applyShake(camera);
}

// ---------- 카메라 가림 처리: 카메라와 플레이어 사이 물체를 반투명하게 ----------
export const raycaster = new THREE.Raycaster();
export const fadedMat = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
export const ghostMat = new THREE.MeshStandardMaterial({ color: "#6b6f75", transparent: true, opacity: 0.25, depthWrite: false });
export function updateOcclusion() {
  const target = player.pos.clone().setY(1);
  const dir = target.clone().sub(camera.position);
  const dist = dir.length();
  raycaster.set(camera.position, dir.normalize());
  raycaster.far = dist - 0.5;
  // 몸통 근처도 가리면 안 되므로 좌우로 살짝 벌린 광선 3개
  const hits = new Set<THREE.Mesh>();
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(0.5);
  for (const off of [0, 1, -1]) {
    raycaster.set(camera.position, target.clone().addScaledVector(side, off).sub(camera.position).normalize());
    for (const h of raycaster.intersectObjects(world.occluders, false)) hits.add(h.object as THREE.Mesh);
  }
  for (const [m, orig] of fadedMat) if (!hits.has(m)) { m.material = orig; fadedMat.delete(m); }
  for (const m of hits) if (!fadedMat.has(m)) { fadedMat.set(m, m.material); m.material = ghostMat; }
}
