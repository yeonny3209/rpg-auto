import * as THREE from "three";
import { sfx } from "./sfx";
import { rarityOf, ITEM_CFG, type Item } from "../logic/items";
import { $, floater, player, saveGame, scene } from "./core";
import { renderInvPanel } from "./panels";

// ---------- 바닥 전리품 ----------
export interface Loot { item: Item; group: THREE.Group; t: number }
export const loots: Loot[] = [];
export const lootBoxGeo = new THREE.OctahedronGeometry(0.22, 0);
export const beamGeo = new THREE.CylinderGeometry(0.05, 0.12, 3, 8, 1, true);
beamGeo.translate(0, 1.5, 0);
export function spawnLoot(item: Item, at: THREE.Vector3) {
  const color = rarityOf(item.rarity).color;
  const g = new THREE.Group();
  const gem = new THREE.Mesh(lootBoxGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }));
  gem.position.y = 0.5;
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(gem, beam);
  g.position.set(at.x + (Math.random() - 0.5), 0, at.z + (Math.random() - 0.5));
  scene.add(g);
  loots.push({ item, group: g, t: 0 });
}
export function updateLoot(dt: number) {
  for (let i = loots.length - 1; i >= 0; i--) {
    const l = loots[i];
    l.t += dt;
    const gem = l.group.children[0];
    gem.rotation.y += dt * 2;
    gem.position.y = 0.5 + Math.sin(l.t * 3) * 0.1;
    if (player.dead || l.t < 0.4) continue;
    const dx = l.group.position.x - player.pos.x, dz = l.group.position.z - player.pos.z;
    if (dx * dx + dz * dz < 1.6 * 1.6) {
      if (player.inventory.length >= ITEM_CFG.inventorySize) {
        if (l.t % 2 < dt) floater(player.pos.clone().setY(2.3), "가방이 가득 찼다", "hurt");
        continue;
      }
      player.inventory.push(l.item);
      const r = rarityOf(l.item.rarity);
      floater(l.group.position.clone().setY(1.4), `${l.item.name} [${r.name}]`, `loot r-${l.item.rarity}`);
      sfx.pickup();
      scene.remove(l.group);
      loots.splice(i, 1);
      saveGame();
      renderInvPanel();
    }
  }
}
