// 마을 NPC: 모형 배치, 머리 위 퀘스트 표식, 가까이 서면 플레이어를 바라본다.
import * as THREE from "three";
import { makeNpcMesh } from "./actors";
import { player, scene, world } from "./core";
import { NPCS, markerFor, type NpcDef } from "../logic/quests";

export interface Npc { def: NpcDef; root: THREE.Group; marker: THREE.Mesh; markerMat: THREE.MeshStandardMaterial; pos: THREE.Vector3 }
export const NPC_RANGE = 2.8;

export const npcs: Npc[] = NPCS.map((def) => {
  const root = makeNpcMesh(def.color, def.style);
  root.position.set(def.x, 0, def.z);
  root.rotation.y = Math.atan2(-def.x, 2 - def.z); // 처음엔 마을 광장 쪽을 본다
  const markerMat = new THREE.MeshStandardMaterial({ color: "#ffd23c", emissive: "#ffb000", emissiveIntensity: 1.6 });
  const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), markerMat);
  marker.scale.set(0.8, 1.4, 0.8);
  marker.visible = false;
  scene.add(root, marker);
  world.obstacles.push({ x: def.x, z: def.z, r: 0.75 });
  return { def, root, marker, markerMat, pos: new THREE.Vector3(def.x, 0, def.z) };
});

export function nearNpc(range = NPC_RANGE): Npc | null {
  let best: Npc | null = null, bd = range;
  for (const n of npcs) {
    const d = n.pos.distanceTo(player.pos);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

export function updateNpcs(dt: number, t: number) {
  for (const n of npcs) {
    const kind = markerFor(n.def, player.quests);
    n.marker.visible = kind !== null;
    if (kind) {
      const c = kind === "turnin" ? "#7dff9a" : "#ffd23c";
      n.markerMat.color.set(c);
      n.markerMat.emissive.set(kind === "turnin" ? "#22cc55" : "#ffb000");
      n.marker.position.set(n.pos.x, 2.75 + Math.sin(t * 3 + n.pos.x) * 0.12, n.pos.z);
      n.marker.rotation.y += dt * 2;
    }
    // 가까워지면 플레이어 쪽으로 천천히 몸을 돌린다
    const to = player.pos.clone().sub(n.pos).setY(0);
    if (to.lengthSq() < 7 * 7 && !player.dead) {
      const want = Math.atan2(to.x, to.z);
      let diff = want - n.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      n.root.rotation.y += diff * Math.min(1, dt * 4);
    }
  }
}
