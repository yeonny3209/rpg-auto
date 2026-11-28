// 실시간 접속(M8-2a): 로그인 중이면 서버에 연결해 내 위치를 보내고, 다른 접속자를 보여 준다. 채팅 포함.
// 전투/적은 아직 각자 클라이언트에서 돈다(서버는 위치·채팅 중계만). 서버가 없거나 로그아웃이면 아무것도 하지 않는다.
import * as THREE from "three";
import { $, player, scene, toast } from "./core";
import { heightAt } from "../logic/terrain";

const COLORS: Record<string, string> = { vanguard: "#c0583a", tracker: "#5aa07a", igniter: "#ffb347", "": "#9aa3b2" };
interface Remote { group: THREE.Group; tx: number; tz: number; try: number; name: string }
const remotes = new Map<string, Remote>();
let ws: WebSocket | null = null, me = "", wantOn = false, retry: number | undefined, posTimer: number | undefined;
let auth = { token: "", base: "" };
let lastSent = { x: 1e9, z: 1e9, ry: 0, t: 0 };

function nameSprite(text: string): THREE.Sprite {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 30px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 6; g.strokeStyle = "#000c"; g.strokeText(text, 128, 32);
  g.fillStyle = "#ffe9b8"; g.fillText(text, 128, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  sp.scale.set(2.6, 0.65, 1); sp.position.y = 2.3; sp.renderOrder = 10;
  return sp;
}
function makeRemote(p: { name: string; x: number; z: number; ry: number; cls: string }): Remote {
  const group = new THREE.Group();
  const col = new THREE.Color(COLORS[p.cls] ?? COLORS[""]);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.8, 4, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 }));
  body.position.y = 0.9; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshStandardMaterial({ color: "#e8c9a0", roughness: 0.9 }));
  head.position.y = 1.7;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: col }));
  nose.position.set(0, 1.0, 0.42); // 바라보는 방향 표시
  group.add(body, head, nose, nameSprite(p.name));
  group.position.set(p.x, heightAt(p.x, p.z), p.z);
  group.rotation.y = p.ry;
  scene.add(group);
  return { group, tx: p.x, tz: p.z, try: p.ry, name: p.name };
}
function applyPlayers(list: any[]) {
  for (const p of list) {
    if (p.name === me) continue;
    const r = remotes.get(p.name);
    if (!r) remotes.set(p.name, makeRemote(p));
    else { r.tx = p.x; r.tz = p.z; r.try = p.ry; }
  }
}
function drop(name: string) {
  const r = remotes.get(name); if (!r) return;
  scene.remove(r.group); r.group.traverse((o: any) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); });
  remotes.delete(name);
}
function clearAll() { for (const n of [...remotes.keys()]) drop(n); }

// ---------- 채팅 ----------
const log = document.createElement("div"); log.id = "chatLog";
const input = document.createElement("input"); input.id = "chatInput"; input.maxLength = 120; input.placeholder = "채팅 (Enter 전송, Esc 취소)";
document.body.append(log, input);
function addChat(from: string, text: string) {
  const line = document.createElement("div");
  line.className = from ? "cl" : "cl sys";
  line.textContent = from ? `${from}: ${text}` : text;
  log.append(line);
  while (log.children.length > 7) log.firstChild!.remove();
  setTimeout(() => line.classList.add("old"), 12000);
}
function openChat() { if (!ws || ws.readyState !== 1) return; input.classList.add("open"); input.focus(); }
function closeChat() { input.classList.remove("open"); input.value = ""; input.blur(); }
addEventListener("keydown", (e) => {
  if (e.target === input) {
    if (e.key === "Enter") { const t = input.value.trim(); if (t && ws?.readyState === 1) ws.send(JSON.stringify({ t: "chat", text: t })); closeChat(); }
    else if (e.key === "Escape") closeChat();
    return;
  }
  if (e.code === "Enter" && ws?.readyState === 1 && !(e.target as HTMLElement | null)?.closest?.("input")
      && !$("classSelect").classList.contains("open") && !$("dialog").classList.contains("open") && !document.getElementById("acctModal")?.classList.contains("open")) {
    e.preventDefault(); openChat();
  }
});

// ---------- 연결 ----------
function connect() {
  if (!wantOn || ws) return;
  const url = (auth.base || location.origin).replace(/^http/, "ws") + "/ws?token=" + auth.token;
  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = () => {
    posTimer = window.setInterval(sendPos, 100);
  };
  sock.onmessage = (ev) => {
    let m: any; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === "hello") { me = m.you; applyPlayers(m.players); addChat("", `접속자 ${m.players.length}명 — Enter로 채팅`); }
    else if (m.t === "snap") applyPlayers(m.players);
    else if (m.t === "leave") drop(m.name);
    else if (m.t === "chat") addChat(m.from, m.text);
    else if (m.t === "kicked") { wantOn = false; toast(`접속 종료: ${m.why}`); }
    else if (m.t === "full") { wantOn = false; toast("서버가 가득 찼다 (최대 10명)"); }
  };
  sock.onclose = () => {
    if (ws === sock) ws = null;
    window.clearInterval(posTimer); clearAll(); me = "";
    if (wantOn) { window.clearTimeout(retry); retry = window.setTimeout(connect, 3000); }
  };
  sock.onerror = () => sock.close();
}
function sendPos() {
  if (!ws || ws.readyState !== 1 || !player.cls) return;
  const t = performance.now(), x = player.pos.x, z = player.pos.z, ry = player.facing;
  const moved = Math.abs(x - lastSent.x) > 0.02 || Math.abs(z - lastSent.z) > 0.02 || Math.abs(ry - lastSent.ry) > 0.05;
  if (!moved && t - lastSent.t < 1000) return; // 가만히 있어도 1초에 한 번은 알린다
  lastSent = { x, z, ry, t };
  ws.send(JSON.stringify({ t: "pos", x: +x.toFixed(2), z: +z.toFixed(2), ry: +ry.toFixed(2), cls: player.cls, lv: player.lv.level, hp: +(player.hp / Math.max(1, player.maxHp)).toFixed(2) }));
}
addEventListener("ember-auth", (e) => {
  const d = (e as CustomEvent).detail as { online: boolean; token: string | null; base: string };
  const on = !!(d.online && d.token);
  auth = { token: d.token ?? "", base: d.base };
  if (!on) { wantOn = false; const s = ws; ws = null; s?.close(); clearAll(); return; }
  if (wantOn && ws) return;
  wantOn = true; connect();
});

export function updateRemotes(dt: number) {
  const k = Math.min(1, dt * 10);
  for (const r of remotes.values()) {
    const g = r.group;
    g.position.x += (r.tx - g.position.x) * k;
    g.position.z += (r.tz - g.position.z) * k;
    g.position.y = heightAt(g.position.x, g.position.z);
    let d = r.try - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * k;
  }
}
export const onlineCount = () => (ws?.readyState === 1 ? remotes.size + 1 : 0);
export const remoteInfo = () => [...remotes.values()].map((r) => ({ name: r.name, x: +r.group.position.x.toFixed(1), z: +r.group.position.z.toFixed(1) }));
