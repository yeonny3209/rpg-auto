// 실시간 접속(M8-2a): 접속자 위치 공유 + 채팅. 서버가 중계만 한다(전투/적은 아직 각자 클라이언트).
import { WebSocketServer } from "ws";
import fs from "node:fs";

export const MAX_PLAYERS = 10;
export const MAX_CHAT = 120;
const LIMIT = 400; // 월드 좌표 한계(이 밖은 잘라냄)
const CLS = new Set(["vanguard", "tracker", "igniter"]);

const num = (v, lim = LIMIT) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : null);
export function cleanText(s) {
  if (typeof s !== "string") return null;
  const t = s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CHAT);
  return t || null;
}

/** @param {import("node:http").Server & {authName(t: string): string|null}} httpServer */
export function attachPresence(httpServer, opts = {}) {
  const tickMs = opts.tickMs ?? 100;
  // 공유 월드 상태: 누군가 밝힌 봉화는 모두에게 켜져 있다(파일로 보존)
  const lit = new Set();
  if (opts.worldFile && fs.existsSync(opts.worldFile)) { try { for (const id of JSON.parse(fs.readFileSync(opts.worldFile, "utf8")).lit ?? []) lit.add(String(id)); } catch { /* 깨졌으면 비움 */ } }
  const saveWorld = () => { if (opts.worldFile) fs.writeFile(opts.worldFile, JSON.stringify({ lit: [...lit] }), () => {}); };
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  /** @type {Map<string, {ws: any, p: any, lastChat: number}>} */
  const players = new Map();

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/ws") return socket.destroy();
    const name = httpServer.authName(url.searchParams.get("token") ?? "");
    if (!name) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); return socket.destroy(); }
    wss.handleUpgrade(req, socket, head, (ws) => join(ws, name));
  });

  const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const broadcast = (o, except) => { const m = JSON.stringify(o); for (const [n, c] of players) if (n !== except && c.ws.readyState === 1) c.ws.send(m); };
  const sys = (text) => broadcast({ t: "chat", from: "", text });

  function join(ws, name) {
    const old = players.get(name);
    if (old) { send(old.ws, { t: "kicked", why: "다른 곳에서 접속했다" }); old.ws.close(); players.delete(name); }
    if (players.size >= MAX_PLAYERS) { send(ws, { t: "full" }); return ws.close(); }
    const c = { ws, p: { name, x: 0, z: 0, ry: 0, cls: "", lv: 1, hp: 1 }, lastChat: 0, dirty: true };
    players.set(name, c);
    send(ws, { t: "hello", you: name, players: [...players.values()].map((o) => o.p), lit: [...lit] });
    sys(`${name}님이 들어왔다`);
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "pos") {
        const x = num(m.x), z = num(m.z), ry = num(m.ry, 7);
        if (x === null || z === null) return;
        c.p = { name, x, z, ry: ry ?? 0, cls: CLS.has(m.cls) ? m.cls : "", lv: Math.max(1, Math.min(99, Math.floor(num(m.lv, 99) ?? 1))), hp: Math.max(0, Math.min(1, num(m.hp, 1) ?? 1)) };
        c.dirty = true;
      } else if (m.t === "beacon") {
        if (typeof m.id !== "string" || !/^[A-Za-z0-9_]{1,32}$/.test(m.id) || lit.has(m.id) || lit.size >= 64) return;
        lit.add(m.id); saveWorld();
        broadcast({ t: "beacon", id: m.id, by: name }, name);
      } else if (m.t === "chat") {
        const text = cleanText(m.text), t = Date.now();
        if (!text || t - c.lastChat < 800) return; // 도배 방지
        c.lastChat = t;
        broadcast({ t: "chat", from: name, text });
      }
    });
    ws.on("close", () => { if (players.get(name) === c) { players.delete(name); sys(`${name}님이 나갔다`); broadcast({ t: "leave", name }); } });
    ws.on("error", () => ws.close());
  }

  const timer = setInterval(() => {
    const changed = [...players.values()].filter((c) => c.dirty);
    if (!changed.length) return;
    for (const c of changed) c.dirty = false;
    broadcast({ t: "snap", players: changed.map((c) => c.p) });
  }, tickMs);
  httpServer.on("close", () => { clearInterval(timer); wss.close(); });
  return { players, lit, close() { clearInterval(timer); for (const c of players.values()) c.ws.close(); wss.close(); } };
}
