// 잔불의 대지 서버 (M8-1): 계정 + 서버 세이브 + 정적 파일. (실시간 접속은 presence.mjs)
// 저장소는 JSON 파일 하나(DATA_DIR/accounts.json). 무료 클라우드의 임시 디스크는 재배포 때 지워질 수 있으니 영구 볼륨을 붙일 것(docs/MULTIPLAYER.md).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const NAME_RE = /^[A-Za-z0-9_가-힣]{2,12}$/;
export const MIN_PW = 6;
export const MAX_SAVE_BYTES = 200_000;
const SESSION_MS = 30 * 24 * 3600 * 1000;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".map": "application/json" };

function hashPw(pw, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(pw, salt, 32).toString("hex") };
}
function checkPw(pw, rec) {
  const a = Buffer.from(crypto.scryptSync(pw, rec.salt, 32).toString("hex")), b = Buffer.from(rec.hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** @param {{dataFile?: string, staticDir?: string, now?: () => number}} opts */
export function createApp(opts = {}) {
  const now = opts.now ?? Date.now;
  const dataFile = opts.dataFile ?? null;
  /** @type {{accounts: Record<string, any>, sessions: Record<string, {name: string, exp: number}>}} */
  let db = { accounts: {}, sessions: {} };
  if (dataFile && fs.existsSync(dataFile)) { try { db = JSON.parse(fs.readFileSync(dataFile, "utf8")); } catch { /* 깨진 파일이면 새로 시작 */ } }
  let writing = false, dirty = false;
  function persist() {
    if (!dataFile) return;
    dirty = true;
    if (writing) return;
    writing = true; dirty = false;
    const tmp = dataFile + ".tmp";
    fs.writeFile(tmp, JSON.stringify(db), (e) => {
      if (!e) fs.renameSync(tmp, dataFile);
      writing = false;
      if (dirty) persist();
    });
  }
  const fails = new Map(); // ip -> {n, until}
  const tooMany = (ip) => { const f = fails.get(ip); return !!f && f.n >= 8 && f.until > now(); };
  const noteFail = (ip) => { const f = fails.get(ip); const t = now(); if (!f || f.until < t) fails.set(ip, { n: 1, until: t + 60_000 }); else f.n++; };

  function send(res, code, body, extra = {}) {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, PUT, OPTIONS", ...extra });
    res.end(data);
  }
  function readJson(req, limit) {
    return new Promise((resolve, reject) => {
      let size = 0, over = false; const chunks = [];
      // 한도를 넘어도 응답을 보낼 수 있게 끝까지 읽어 버린다(너무 크면 연결을 끊는다)
      req.on("data", (c) => { size += c.length; if (size > 5_000_000) req.destroy(); else if (size > limit) over = true; else chunks.push(c); });
      req.on("end", () => {
        if (over) return reject(Object.assign(new Error("too big"), { code: 413 }));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(Object.assign(new Error("bad json"), { code: 400 })); }
      });
      req.on("error", reject);
    });
  }
  function newSession(name) {
    const token = crypto.randomBytes(32).toString("hex");
    db.sessions[token] = { name, exp: now() + SESSION_MS };
    // 만료된 세션 청소
    for (const [t, s] of Object.entries(db.sessions)) if (s.exp < now()) delete db.sessions[t];
    return token;
  }
  function authed(req) {
    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization ?? "");
    const s = m && db.sessions[m[1]];
    return s && s.exp > now() ? s.name : null;
  }

  async function api(req, res, url) {
    const ip = req.socket.remoteAddress ?? "?";
    if (req.method === "OPTIONS") return send(res, 204, "");
    if (url.pathname === "/api/ping") return send(res, 200, { ok: true, game: "emberlands", players: Object.keys(db.accounts).length });
    if (url.pathname === "/api/register" && req.method === "POST") {
      const b = await readJson(req, 2000);
      if (typeof b.name !== "string" || !NAME_RE.test(b.name)) return send(res, 400, { error: "닉네임은 2~12자(한글·영문·숫자·_)" });
      if (typeof b.password !== "string" || b.password.length < MIN_PW || b.password.length > 100) return send(res, 400, { error: `비밀번호는 ${MIN_PW}자 이상` });
      const key = b.name.toLowerCase();
      if (db.accounts[key]) return send(res, 409, { error: "이미 있는 닉네임" });
      db.accounts[key] = { name: b.name, ...hashPw(b.password), save: null, savedAt: 0, created: now() };
      const token = newSession(key); persist();
      return send(res, 201, { token, name: b.name });
    }
    if (url.pathname === "/api/login" && req.method === "POST") {
      if (tooMany(ip)) return send(res, 429, { error: "잠시 후 다시 시도" });
      const b = await readJson(req, 2000);
      const rec = typeof b.name === "string" ? db.accounts[b.name.toLowerCase()] : null;
      if (!rec || typeof b.password !== "string" || !checkPw(b.password, rec)) { noteFail(ip); return send(res, 401, { error: "닉네임 또는 비밀번호가 틀림" }); }
      const token = newSession(b.name.toLowerCase()); persist();
      return send(res, 200, { token, name: rec.name });
    }
    if (url.pathname === "/api/logout" && req.method === "POST") {
      const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization ?? "");
      if (m && db.sessions[m[1]]) { delete db.sessions[m[1]]; persist(); }
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/save") {
      const key = authed(req);
      if (!key) return send(res, 401, { error: "로그인이 필요" });
      const rec = db.accounts[key];
      if (req.method === "GET") return send(res, 200, { name: rec.name, save: rec.save, savedAt: rec.savedAt });
      if (req.method === "PUT") {
        const b = await readJson(req, MAX_SAVE_BYTES + 200);
        if (typeof b.save !== "string" || b.save.length > MAX_SAVE_BYTES) return send(res, 413, { error: "세이브가 너무 큼" });
        let o; try { o = JSON.parse(b.save); } catch { return send(res, 400, { error: "세이브 형식 오류" }); }
        if (!o || typeof o !== "object" || !Number.isInteger(o.version)) return send(res, 400, { error: "세이브 형식 오류" });
        rec.save = b.save; rec.savedAt = now(); persist();
        return send(res, 200, { ok: true, savedAt: rec.savedAt });
      }
    }
    return send(res, 404, { error: "없는 경로" });
  }

  function serveStatic(req, res, url) {
    const root = opts.staticDir;
    if (!root || (req.method !== "GET" && req.method !== "HEAD")) { res.writeHead(404); return res.end(); }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(path.resolve(root))) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (e, data) => {
      if (e) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache" });
      res.end(data);
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      serveStatic(req, res, url);
    } catch (e) {
      const code = e && e.code && Number.isInteger(e.code) ? e.code : 500;
      if (!res.headersSent) send(res, code, { error: code === 500 ? "서버 오류" : String(e.message) });
    }
  });
  server.authName = (token) => { const se = db.sessions[token]; return se && se.exp > now() ? db.accounts[se.name]?.name ?? null : null; };
  server.flush = () => new Promise((r) => { const t = setInterval(() => { if (!writing) { clearInterval(t); r(); } }, 5); });
  return server;
}
