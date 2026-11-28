import * as THREE from "three";
import type { Circle } from "../logic/collision";
import { heightAt } from "../logic/terrain";
import { regionById, pointInRegion } from "../logic/regions";
import { mulberry32 } from "./world";
import { buildGate } from "./forestDecor";

/** 유리 사막 전용 장식: 솟은 유리 결정, 모래 둔덕, 하얗게 바랜 갈비뼈, 통로 관문. */
export function buildDesertDecor(scene: THREE.Scene, obstacles: Circle[], avoid: (x: number, z: number) => boolean) {
  const desert = regionById("glassDesert");
  const rng = mulberry32(131);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // 유리 결정: 뾰족한 반투명 기둥(살짝 기울임), 일부는 충돌 있음
  const N = 140;
  const shard = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#8fe3ee", emissive: "#2aa6b8", emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.8, flatShading: true }), N);
  let n = 0;
  for (let tries = 0; n < N && tries < N * 20; tries++) {
    const pt = pointInRegion(desert, rng, 5, 3);
    if (avoid(pt.x, pt.z)) continue;
    const h = 1.2 + rng() * 3.4, k = 0.5 + rng() * 0.9, y = heightAt(pt.x, pt.z);
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(rng() * 6.28), 0, Math.sin(rng() * 6.28)), (rng() - 0.5) * 0.5);
    shard.setMatrixAt(n, m.compose(p.set(pt.x, y - 0.1, pt.z), tilt, s.set(k, h, k)));
    if (h > 2.4) obstacles.push({ x: pt.x, z: pt.z, r: 0.4 * k });
    n++;
  }
  shard.count = n;
  scene.add(shard);

  // 모래 둔덕: 납작한 반구
  const dune = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#b39c70", roughness: 1, flatShading: true }), 60);
  let dn = 0;
  for (let tries = 0; dn < 60 && tries < 600; tries++) {
    const pt = pointInRegion(desert, rng, 10, 4);
    if (avoid(pt.x, pt.z)) continue;
    const r = 2 + rng() * 3.5;
    dune.setMatrixAt(dn, m.compose(p.set(pt.x, heightAt(pt.x, pt.z) - 0.1, pt.z), q.setFromAxisAngle(up, rng() * 6), s.set(r, r * 0.22, r * (0.7 + rng() * 0.6))));
    dn++;
  }
  dune.count = dn;
  scene.add(dune);

  // 바랜 갈비뼈: 땅에 박힌 휜 기둥 여러 개
  const bone = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#d9d2bd", roughness: 1 }), 80);
  let bn = 0;
  for (let c = 0; c < 8; c++) {
    const ctr = pointInRegion(desert, rng, 12, 6);
    if (avoid(ctr.x, ctr.z)) continue;
    const yaw = rng() * 6;
    for (let j = 0; j < 8 && bn < 80; j++) {
      const off = (j - 3.5) * 0.7, x = ctr.x + Math.cos(yaw) * off, z = ctr.z - Math.sin(yaw) * off, h = 2.2 - Math.abs(j - 3.5) * 0.22;
      const lean = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), 0.22 * (j < 4 ? 1 : -1));
      bone.setMatrixAt(bn, m.compose(p.set(x, heightAt(x, z), z), lean, s.set(1, h, 1)));
      bn++;
    }
  }
  bone.count = bn;
  scene.add(bone);

  const gate = buildGate(scene, obstacles, desert.x - desert.r + 2, 9.5, { wood: "#8a7658", glow: "#2a2010" });
  return { shards: n, dunes: dn, bones: bn, gateX: gate.gateX };
}
