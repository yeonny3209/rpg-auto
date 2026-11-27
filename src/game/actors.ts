import * as THREE from "three";

export function makePlayerMesh(): { root: THREE.Group; sword: THREE.Group } {
  const root = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: "#4f6a94", roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: "#d9b38c", roughness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: "#ff7a1a", emissiveIntensity: 0.8 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.8, 4, 10), cloth);
  body.position.y = 0.85;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), skin);
  head.position.y = 1.6;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 14), accent);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.36;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), accent);
  core.position.set(0, 1.05, 0.36);

  const sword = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.06, 1.1),
    new THREE.MeshStandardMaterial({ color: "#d8dde6", metalness: 0.8, roughness: 0.3 })
  );
  blade.position.z = 0.65;
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), accent);
  hilt.position.z = 0.1;
  sword.add(blade, hilt);
  sword.position.set(0.45, 1.0, 0.1);

  for (const o of [body, head, scarf, core, blade]) o.castShadow = true;
  root.add(body, head, scarf, core, sword);
  return { root, sword };
}

export function makeEnemyMesh(color: string, eyeColor: string, size: number, ai = "melee") {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), mat);
  body.position.y = size * 0.8;
  body.scale.set(1.2, 0.8, 1.3);
  body.castShadow = true;
  const eyeMat = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: 2 });
  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.22, 0.22]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.08 * (size / 0.7), 6, 4), eyeMat);
    e.position.set(x * (size / 0.7), size * 0.95, size * 1.05);
    eyes.push(e);
    root.add(e);
  }
  // 등의 재 가시
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4), mat);
    spike.position.set((i - 2) * 0.15, size * 1.35, -0.1 + Math.abs(i - 2) * -0.05);
    spike.rotation.x = -0.4;
    root.add(spike);
  }
  if (ai === "charger") {
    const hornMat = new THREE.MeshStandardMaterial({ color: "#d8c7a8", roughness: 0.6 });
    for (const x of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12 * size, 0.7 * size, 6), hornMat);
      horn.position.set(x * 0.35 * size, size * 1.05, size * 0.9);
      horn.rotation.set(1.1, 0, -x * 0.5);
      horn.castShadow = true;
      root.add(horn);
    }
  }
  if (ai === "ranged") {
    const sacMat = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: eyeColor, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 });
    const sac = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 10, 8), sacMat);
    sac.position.set(0, size * 1.3, -size * 0.4);
    root.add(sac);
  }
  root.add(body);
  return { root, body, eyeMat, mat };
}
