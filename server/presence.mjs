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
  /** 적 담당자: 적 번호(0~999) -> 담당 접속자 이름. 담당자가 그 적의 AI를 돌리고 상태를 스트리밍한다. */
  const owners = new Map();
  const kills = new Map(); // 적 인덱스 → 처치 횟수(늦게 들어온 사람의 리스폰 시드 맞춤)
  const isIdx = (i) => Number.isInteger(i) && i >= 0 && i < 1000;
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
    if (old) { send(old.ws, { t: "kicked", why: "다른 곳에서 접속했다" }); old.ws.close(); players.delete(name); for (const [i, o] of [...owners]) if (o === name) { owners.delete(i); broadcast({ t: "free", i }); } }
    if (players.size >= MAX_PLAYERS) { send(ws, { t: "full" }); return ws.close(); }
    const c = { ws, p: { name, x: 0, z: 0, ry: 0, cls: "", lv: 1, hp: 1 }, lastChat: 0, dirty: true };
    players.set(name, c);
    send(ws, { t: "hello", you: name, players: [...players.values()].map((o) => o.p), lit: [...lit], owners: Object.fromEntries(owners), kills: Object.fromEntries(kills) });
    sys(`${name}님이 들어왔다`);
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "pos") {
        const x = num(m.x), z = num(m.z), ry = num(m.ry, 7);
        if (x === null || z === null) return;
        c.p = { name, x, z, ry: ry ?? 0, cls: CLS.has(m.cls) ? m.cls : "", lv: Math.max(1, Math.min(99, Math.floor(num(m.lv, 99) ?? 1))), hp: Math.max(0, Math.min(1, num(m.hp, 1) ?? 1)) };
        c.dirty = true;
      } else if (m.t === "claim") {
        if (!isIdx(m.i)) return;
        const cur = owners.get(m.i);
        if (cur && cur !== name && players.has(cur)) return; // 이미 다른 사람이 담당 중
        owners.set(m.i, name);
        broadcast({ t: "own", i: m.i, by: name });
      } else if (m.t === "free") {
        if (!isIdx(m.i) || owners.get(m.i) !== name) return;
        owners.delete(m.i);
        broadcast({ t: "free", i: m.i });
      } else if (m.t === "es") { // 담당자가 보내는 적 상태 스트림
        if (!Array.isArray(m.list) || m.list.length > 60) return;
        const list = [];
        for (const e of m.list) {
          if (!Array.isArray(e) || (e.length !== 6 && e.length !== 7) || !isIdx(e[0]) || owners.get(e[0]) !== name) continue;
          const [i, x, z, hp, st, ry] = e;
          const nx = num(x), nz = num(z), nh = num(hp, 1e6), nr = num(ry, 7);
          if (nx === null || nz === null || nh === null || typeof st !== "string" || st.length > 10) continue;
          const pat = typeof e[6] === "string" && /^[a-z]{1,10}$/.test(e[6]) ? e[6] : null; // 보스 패턴(전조 표시용)
          list.push(pat ? [i, nx, nz, nh, st, nr ?? 0, pat] : [i, nx, nz, nh, st, nr ?? 0]);
        }
        if (list.length) broadcast({ t: "es", list }, name);
      } else if (m.t === "hit") { // 담당이 아닌 사람의 공격 → 담당자에게 전달
        const owner = owners.get(m.i), amount = num(m.amount, 100000);
        if (!isIdx(m.i) || !owner || owner === name || amount === null || amount <= 0) return;
        const oc = players.get(owner);
        if (oc) send(oc.ws, { t: "hit", i: m.i, amount: Math.round(amount), broke: !!m.broke, by: name });
      } else if (m.t === "kill") { // 담당자가 처치를 알림 → 전원에게. by = 보상을 받을 기여자들
        if (!isIdx(m.i) || owners.get(m.i) !== name || !Array.isArray(m.by)) return;
        owners.delete(m.i); kills.set(m.i, (kills.get(m.i) ?? 0) + 1);
        broadcast({ t: "kill", i: m.i, by: m.by.filter((n) => typeof n === "string" && players.has(n)).slice(0, MAX_PLAYERS) });
      } else if (m.t === "phit") { // 담당자의 적이 다른 접속자를 때림 → 맞은 사람에게 전달(회피 판정은 맞은 쪽에서)
        const amount = num(m.amount, 5000), target = typeof m.to === "string" ? players.get(m.to) : null;
        if (target && amount !== null && amount > 0 && m.to !== name) send(target.ws, { t: "phit", amount: Math.round(amount), enemy: typeof m.enemy === "string" ? m.enemy.slice(0, 20) : "" });
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
    ws.on("close", () => { if (players.get(name) === c) { players.delete(name);
      for (const [i, o] of [...owners]) if (o === name) { owners.delete(i); broadcast({ t: "free", i }); } sys(`${name}님이 나갔다`); broadcast({ t: "leave", name }); } });
    ws.on("error", () => ws.close());
  }

  const timer = setInterval(() => {
    const changed = [...players.values()].filter((c) => c.dirty);
    if (!changed.length) return;
    for (const c of changed) c.dirty = false;
    broadcast({ t: "snap", players: changed.map((c) => c.p) });
  }, tickMs);
  httpServer.on("close", () => { clearInterval(timer); wss.close(); });
  return { players, lit, owners, close() { clearInterval(timer); for (const c of players.values()) c.ws.close(); wss.close(); } };
}
