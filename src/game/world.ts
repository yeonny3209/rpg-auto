import * as THREE from "three";
import type { Circle } from "../logic/collision";

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

  // 잿빛 초원 바닥 (정점 색으로 얼룩)
  const groundGeo = new THREE.CircleGeometry(WORLD_RADIUS + 30, 96);
  groundGeo.rotateX(-Math.PI / 2);
  const rng = mulberry32(7);
  const colors: number[] = [];
  const pos = groundGeo.attributes.position;
  const a = new THREE.Color("#5a6150"), b = new THREE.Color("#706a56"), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    tmp.copy(a).lerp(b, rng());
    colors.push(tmp.r, tmp.g, tmp.b);
  }
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
    p.set(Math.cos(th) * r, 0, Math.sin(th) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
    const k = 0.6 + rng() * 0.9;
    s.set(k, k * (0.7 + rng() * 0.8), k);
    grass.setMatrixAt(i, m.compose(p, q, s));
  }
  scene.add(grass);

  // 바위와 폐허 기둥
  const rockMat = new THREE.MeshStandardMaterial({ color: "#6b6f75", roughness: 0.95, flatShading: true });
  for (let i = 0; i < 40; i++) {
    const r = 13 + rng() * WORLD_RADIUS, th = rng() * Math.PI * 2;
    const size = 0.4 + rng() * 1.2;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat);
    rock.position.set(Math.cos(th) * r, 0.2, Math.sin(th) * r);
    if (size > 0.6) occluders.push(rock);
    if (size > 0.6) obstacles.push({ x: rock.position.x, z: rock.position.z, r: size * 0.85 });
    rock.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
  }
  const ruinMat = new THREE.MeshStandardMaterial({ color: "#8a8270", roughness: 0.9 });
  for (let i = 0; i < 9; i++) {
    const th = (i / 9) * Math.PI * 2;
    const h = 1.2 + rng() * 2.5;
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, h, 0.8), ruinMat);
    col.position.set(Math.cos(th) * 11, h / 2, Math.sin(th) * 11);
    obstacles.push({ x: col.position.x, z: col.position.z, r: 0.6 });
    col.rotation.z = (rng() - 0.5) * 0.2;
    col.castShadow = col.receiveShadow = true;
    scene.add(col);
    occluders.push(col);
  }

  return { obstacles, ruinMat, occluders };
}
