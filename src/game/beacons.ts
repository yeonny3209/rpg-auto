import * as THREE from "three";
import wdata from "../../data/world.json";
import type { Circle } from "../logic/collision";

export interface BeaconDef { id: string; name: string; x: number; z: number; litAtStart: boolean; major?: boolean }
export interface Beacon {
  def: BeaconDef;
  lit: boolean;
  flame: THREE.Mesh;
  light: THREE.PointLight;
  flameMat: THREE.MeshStandardMaterial;
  pos: THREE.Vector3;
  igniteT: number; // 점화 연출 시간
}

export function buildBeacons(scene: THREE.Scene, stoneMat: THREE.Material, obstacles: Circle[]): Beacon[] {
  return (wdata.beacons as BeaconDef[]).map((def) => {
    const s = def.major ? 1 : 0.75;
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * s, 1.2 * s, 1 * s, 8), stoneMat);
    base.position.y = 0.5 * s;
    base.castShadow = base.receiveShadow = true;
    g.add(base);
    // 받침 돌기둥 네 개
    for (let i = 0; i < 4; i++) {
      const th = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.25 * s, 1.6 * s, 0.25 * s), stoneMat);
      p.position.set(Math.cos(th) * 1.05 * s, 0.8 * s, Math.sin(th) * 1.05 * s);
      p.castShadow = true;
      g.add(p);
    }
    const flameMat = new THREE.MeshStandardMaterial({ color: "#3a3f48", emissive: "#000000", emissiveIntensity: 0 });
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.45 * s, 0), flameMat);
    flame.position.y = 1.6 * s;
    g.add(flame);
    const light = new THREE.PointLight("#ff9a3c", 0, wdata.beacon.lightRadius, 1.6);
    light.position.y = 2.2 * s;
    g.add(light);
    g.position.set(def.x, 0, def.z);
    scene.add(g);
    obstacles.push({ x: def.x, z: def.z, r: 1.25 * s });
    const b: Beacon = { def, lit: false, flame, light, flameMat, pos: new THREE.Vector3(def.x, 0, def.z), igniteT: 0 };
    setLit(b, def.litAtStart, false);
    return b;
  });
}

export function setLit(b: Beacon, lit: boolean, animate = true) {
  b.lit = lit;
  b.igniteT = lit && animate ? 1.2 : 0;
  if (lit) {
    b.flameMat.color.set("#ffb347");
    b.flameMat.emissive.set("#ff8a2a");
    b.flameMat.emissiveIntensity = 2.5;
  } else {
    b.flameMat.color.set("#3a3f48");
    b.flameMat.emissive.set("#000000");
    b.flameMat.emissiveIntensity = 0;
    b.light.intensity = 0;
  }
}

export function updateBeacons(bs: Beacon[], t: number, dt: number) {
  for (const b of bs) {
    const baseY = b.def.major ? 1.6 : 1.2;
    if (!b.lit) {
      b.flame.rotation.y = 0;
      b.flame.position.y = baseY;
      continue;
    }
    b.igniteT = Math.max(0, b.igniteT - dt);
    const burst = b.igniteT > 0 ? 1 + b.igniteT * 2 : 1;
    b.flame.rotation.y = t * 1.2;
    b.flame.position.y = baseY + Math.sin(t * 2 + b.pos.x) * 0.08;
    b.flame.scale.setScalar(burst);
    b.light.intensity = (38 + Math.sin(t * 7 + b.pos.z) * 3 + Math.sin(t * 13) * 2) * (b.def.major ? 1 : 0.7) * burst;
  }
}
