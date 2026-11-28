import * as THREE from "three";
import type { Circle } from "../logic/collision";
import { heightAt } from "../logic/terrain";
import { regionById, pointInRegion } from "../logic/regions";
import { mulberry32 } from "./world";

/** 가라앉은 숲 전용 장식: 발광 버섯 군락, 늪 웅덩이, 통로 입구 관문(기둥 2개 + 들보 + 등불). 숲은 어둡고 습한 느낌. */
export function buildForestDecor(scene: THREE.Scene, obstacles: Circle[], avoid: (x: number, z: number) => boolean) {
  const forest = regionById("sunkenForest");
  const rng = mulberry32(77);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // 발광 버섯: 줄기 + 갓(발광)을 군락으로 모아 심는다
  const N = 260;
  const stem = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 1, 5).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#c9d6c0", roughness: 1 }), N);
  const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#6fe3b4", emissive: "#2fbf8a", emissiveIntensity: 1.4, roughness: 0.6 }), N);
  let n = 0;
  for (let c = 0; c < 36 && n < N; c++) {
    const ctr = pointInRegion(forest, rng, 6, 4);
    if (avoid(ctr.x, ctr.z)) continue;
    const cnt = 4 + Math.floor(rng() * 5);
    for (let j = 0; j < cnt && n < N; j++) {
      const x = ctr.x + (rng() - 0.5) * 3.2, z = ctr.z + (rng() - 0.5) * 3.2, y = heightAt(x, z), k = 0.5 + rng() * 0.9;
      stem.setMatrixAt(n, m.compose(p.set(x, y, z), q.identity(), s.set(1, 0.35 * k, 1)));
      cap.setMatrixAt(n, m.compose(p.set(x, y + 0.35 * k, z), q.setFromAxisAngle(up, rng() * 6), s.set(k, k * 0.8, k)));
      n++;
    }
  }
  stem.count = cap.count = n;
  scene.add(stem, cap);

  // 늪 웅덩이: 납작한 어두운 원판(살짝 발광)
  const pud = new THREE.MeshStandardMaterial({ color: "#0e2a2a", emissive: "#0b3d3a", emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.2 });
  for (let i = 0; i < 18; i++) {
    const pt = pointInRegion(forest, rng, 8, 5);
    if (avoid(pt.x, pt.z)) continue;
    const r = 1.6 + rng() * 2.4;
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 14), pud);
    d.rotation.x = -Math.PI / 2;
    d.scale.set(1, 0.7 + rng() * 0.5, 1);
    d.position.set(pt.x, heightAt(pt.x, pt.z) + 0.04, pt.z);
    scene.add(d);
  }

  // 관문: 통로가 숲에 닿는 곳에 기둥 2개와 들보, 매달린 등불
  const gx = forest.x - forest.r + 2, hw = 9.5;
  const wood = new THREE.MeshStandardMaterial({ color: "#6a5240", emissive: "#2a1c10", emissiveIntensity: 0.6, roughness: 1, flatShading: true });
  const lampMat = new THREE.MeshStandardMaterial({ color: "#ffd38a", emissive: "#ff9a3c", emissiveIntensity: 2.2 });
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const y = heightAt(gx, side * hw);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 9, 6), wood);
    post.position.set(gx, y + 4.5, side * hw); post.castShadow = true; g.add(post);
    const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), lampMat);
    lamp.position.set(gx - 0.9, y + 7, side * hw); g.add(lamp);
    const l = new THREE.PointLight("#ff9a3c", 14, 14, 2); l.position.copy(lamp.position); g.add(l);
    obstacles.push({ x: gx, z: side * hw, r: 0.55 });
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, hw * 2 + 1.4), wood);
  beam.position.set(gx, heightAt(gx, 0) + 9, 0); beam.castShadow = true; g.add(beam);
  scene.add(g);
  return { gateX: gx, gateHalf: hw, mushrooms: n };
}
