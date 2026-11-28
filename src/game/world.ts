import * as THREE from "three";
import type { Circle } from "../logic/collision";
import { heightAt } from "../logic/terrain";
import { scatterSpots, SCATTER } from "../logic/scatter";
import { REGIONS, regionAt, regionById, pointInRegion } from "../logic/regions";
import wdata from "../../data/world.json";
import { buildForestDecor } from "./forestDecor";
import { buildDesertDecor } from "./desertDecor";

/** 결정론적 난수 (월드 배치 재현용) */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WORLD_RADIUS = 60;

export interface World {
  obstacles: Circle[];
  ruinMat: THREE.Material;
  occluders: THREE.Mesh[]; // 카메라를 가릴 수 있는 큰 물체
}

export function buildWorld(scene: THREE.Scene): World {
  const obstacles: Circle[] = [];
  const occluders: THREE.Mesh[] = [];
  scene.background = new THREE.Color("#1a2230");
  scene.fog = new THREE.Fog("#1a2230", 18, 70);

  const hemi = new THREE.HemisphereLight("#9fb3d2", "#3a3228", 1.5);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight("#b9c8e6", 0.9);
  moon.position.set(-20, 30, 10);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera as THREE.OrthographicCamera;
  sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30;
  scene.add(moon);

  // 잿빛 초원 바닥: 높이 지도(heightAt)로 굴곡을 주고, 정점 색은 얼룩 + 높이에 따라 살짝 밝게
  // 두 지역과 통로를 한 장의 바닥으로 덮는다(가로로 긴 판). 정점 색은 가까운 지역의 팔레트.
  const minX = Math.min(...REGIONS.map((r) => r.x - r.r)) - 30, maxX = Math.max(...REGIONS.map((r) => r.x + r.r)) + 30;
  const minZ = Math.min(...REGIONS.map((r) => r.z - r.r)) - 30, maxZ = Math.max(...REGIONS.map((r) => r.z + r.r)) + 30;
  const gw = maxX - minX, gh = maxZ - minZ;
  const groundGeo = new THREE.PlaneGeometry(gw, gh, Math.round(gw / 1.2), Math.round(gh / 1.2));
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const rng = mulberry32(7);
  const colors: number[] = [];
  const pos = groundGeo.attributes.position;
  const tmp = new THREE.Color(), pal = new Map(REGIONS.map((r) => [r.id, r.ground.map((c) => new THREE.Color(c))]));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
    pos.setY(i, h);
    const [a, b, hi] = pal.get(regionAt(x, z).id)!;
    tmp.copy(a).lerp(b, rng()).lerp(hi, Math.max(0, h) * 0.12);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  groundGeo.computeVertexNormals();
  groundGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // 풀 덤불 (인스턴싱)
  const grassGeo = new THREE.ConeGeometry(0.15, 0.7, 4);
  grassGeo.translate(0, 0.35, 0);
  const grass = new THREE.InstancedMesh(grassGeo, new THREE.MeshStandardMaterial({ color: "#7a7a52", roughness: 1 }), 1800);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < grass.count; i++) {
    const r = 4 + Math.sqrt(rng()) * WORLD_RADIUS, th = rng() * Math.PI * 2;
    p.set(Math.cos(th) * r, heightAt(Math.cos(th) * r, Math.sin(th) * r), Math.sin(th) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
    const k = 0.6 + rng() * 0.9;
    s.set(k, k * (0.7 + rng() * 0.8), k);
    grass.setMatrixAt(i, m.compose(p, q, s));
  }
  scene.add(grass);

  // 가라앉은 숲: 낮은 덤불(초록)과 키 큰 나무를 지역 안에 흩뿌린다. 봉화·통로 입구 근처는 비운다.
  const forest = regionById("sunkenForest");
  const frng = mulberry32(31);
  const bushGeo = new THREE.ConeGeometry(0.25, 0.9, 5);
  bushGeo.translate(0, 0.45, 0);
  const bush = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ color: "#3f6a4a", roughness: 1 }), 1500);
  for (let i = 0; i < bush.count; i++) {
    const pt = pointInRegion(forest, frng, 2, 1);
    const k = 0.7 + frng() * 1.1;
    bush.setMatrixAt(i, m.compose(p.set(pt.x, heightAt(pt.x, pt.z), pt.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), frng() * 6.28), s.set(k, k * (0.7 + frng() * 0.9), k)));
  }
  scene.add(bush);
  const clearR = (x: number, z: number) => wdata.beacons.some((b) => Math.hypot(b.x - x, b.z - z) < 7) || Math.hypot(x - (forest.x - forest.r), z) < 10 || Math.hypot(x - (forest.x + forest.r), z) < 12; // 숲 양쪽 통로 입구
  const treeCount = 70;
  const fTrunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.34, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#4a3a2c", roughness: 1, flatShading: true }), treeCount);
  const fCrown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.1, 3.2, 7).translate(0, 1.6, 0), new THREE.MeshStandardMaterial({ color: "#25402f", roughness: 1, flatShading: true }), treeCount);
  let placed = 0;
  for (let tries = 0; placed < treeCount && tries < treeCount * 30; tries++) {
    const pt = pointInRegion(forest, frng, 8, 3);
    if (clearR(pt.x, pt.z)) continue;
    const h = 3 + frng() * 2.5, y = heightAt(pt.x, pt.z), k = 0.8 + frng() * 0.6;
    fTrunk.setMatrixAt(placed, m.compose(p.set(pt.x, y, pt.z), q.identity(), s.set(1, h, 1)));
    fCrown.setMatrixAt(placed, m.compose(p.set(pt.x, y + h * 0.7, pt.z), q.identity(), s.set(k, k * 0.9, k)));
    obstacles.push({ x: pt.x, z: pt.z, r: 0.45 });
    placed++;
  }
  fTrunk.count = fCrown.count = placed;
  fTrunk.castShadow = fCrown.castShadow = true;
  scene.add(fTrunk, fCrown);

  buildForestDecor(scene, obstacles, clearR);
  const dRg = regionById("glassDesert");
  buildDesertDecor(scene, obstacles, (x, z) => clearR(x, z) || Math.hypot(x - (dRg.x - dRg.r), z) < 10);

  // 바위와 폐허 기둥
  const rockMat = new THREE.MeshStandardMaterial({ color: "#6b6f75", roughness: 0.95, flatShading: true });
  const rockSpots = scatterSpots(rng, SCATTER.rocks);
  for (const sp of rockSpots) {
    const size = 0.4 + rng() * 1.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat);
    rock.position.set(sp.x, heightAt(sp.x, sp.z) + 0.2, sp.z);
    if (size > 0.6) occluders.push(rock);
    if (size > 0.6) obstacles.push({ x: sp.x, z: sp.z, r: size * 0.85 });
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
  }
  // 고목: 줄기와 가지를 각각 인스턴싱 (바위 자리를 피해서 배치)
  const treeSpots = scatterSpots(rng, SCATTER.deadTrees, rockSpots);
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.26, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const branchGeo = new THREE.CylinderGeometry(0.03, 0.1, 1, 5);
  branchGeo.translate(0, 0.5, 0);
  const barkMat = new THREE.MeshStandardMaterial({ color: "#3e3630", roughness: 1, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, treeSpots.length);
  const branches = new THREE.InstancedMesh(branchGeo, barkMat, treeSpots.length * 2);
  const up = new THREE.Vector3(0, 1, 0);
  treeSpots.forEach((sp, i) => {
    const h = 2.4 + rng() * 2.2, y = heightAt(sp.x, sp.z);
    q.setFromAxisAngle(up, rng() * 6.28);
    trunks.setMatrixAt(i, m.compose(p.set(sp.x, y, sp.z), q, s.set(1, h, 1)));
    for (let b = 0; b < 2; b++) {
      const ay = rng() * 6.28, lean = 0.7 + rng() * 0.5, len = h * (0.35 + rng() * 0.25);
      q.setFromEuler(new THREE.Euler(lean, ay, 0, "YXZ"));
      branches.setMatrixAt(i * 2 + b, m.compose(p.set(sp.x, y + h * (0.55 + b * 0.2), sp.z), q, s.set(1, len, 1)));
    }
    obstacles.push({ x: sp.x, z: sp.z, r: 0.35 });
  });
  trunks.castShadow = branches.castShadow = true;
  scene.add(trunks, branches);
  const ruinMat = new THREE.MeshStandardMaterial({ color: "#8a8270", roughness: 0.9 });
  for (let i = 0; i < 9; i++) {
    const th = (i / 9) * Math.PI * 2;
    const h = 1.2 + rng() * 2.5;
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), ruinMat);
    col.position.set(Math.cos(th) * 11, heightAt(Math.cos(th) * 11, Math.sin(th) * 11) + h / 2, Math.sin(th) * 11);
    obstacles.push({ x: col.position.x, z: col.position.z, r: 0.6 });
    col.rotation.z = (rng() - 0.5) * 0.2;
    col.castShadow = col.receiveShadow = true;
    scene.add(col);
    occluders.push(col);
  }

  return { obstacles, ruinMat, occluders };
}
