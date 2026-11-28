// 온라인 계정(M8-1): 서버가 있을 때만 "☁ 계정" 버튼이 나온다. 없으면(GitHub Pages 등) 완전히 솔로로 동작한다.
// 세이브는 항상 localStorage가 1차 저장소이고, 로그인 중이면 서버에도 올린다(서버가 기준).
import { $, SAVE_KEY, saveGuard, savedHooks, toast } from "./core";

const K = { token: "emberlands.token", name: "emberlands.name", server: "emberlands.server", solo: "emberlands.save.solo" };
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 무시 */ } };

// 서버 주소: ?server=https://... 로 지정하면 기억해 둔다. 기본은 같은 주소(서버가 게임도 같이 서빙할 때).
const q = new URLSearchParams(location.search).get("server");
// 주소 바꿔치기(피싱) 방지: https 또는 로컬 주소만 받는다.
if (q && /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$))/.test(q)) set(K.server, q.replace(/\/+$/, ""));
const base = () => get(K.server) ?? "";

async function api(path: string, init: RequestInit & { token?: string | null; timeout?: number } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init.timeout ?? 8000);
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const tok = init.token === undefined ? get(K.token) : init.token;
    if (tok) headers.authorization = `Bearer ${tok}`;
    const r = await fetch(base() + path, { ...init, headers, signal: ctl.signal });
    let body: any = null;
    try { body = await r.json(); } catch { /* 본문 없음 */ }
    return { ok: r.ok, status: r.status, body };
  } catch {
    return { ok: false, status: 0, body: { error: "서버에 연결할 수 없다" } };
  } finally { clearTimeout(t); }
}

// ---------- 서버로 올리기(디바운스) ----------
let pending: string | null = null, timer: number | undefined;
async function flush() {
  timer = undefined;
  if (pending === null || !get(K.token)) return;
  const raw = pending; pending = null;
  const r = await api("/api/save", { method: "PUT", body: JSON.stringify({ save: raw }) });
  if (r.status === 401) { forgetLogin(); toast("로그인이 만료됐다. 다시 로그인해 줘"); }
  else if (!r.ok && r.status !== 0) toast("서버 저장 실패: " + (r.body?.error ?? r.status));
  else if (r.status === 0) pending = raw; // 연결 실패는 다음 저장 때 다시 시도
}
savedHooks.push((raw) => {
  if (!get(K.token)) return;
  pending = raw;
  if (timer === undefined) timer = window.setTimeout(flush, 5000);
});
addEventListener("pagehide", () => { // 창을 닫을 때 마지막 저장을 보낸다
  const tok = get(K.token);
  if (!tok || pending === null || saveGuard.locked) return;
  try { fetch(base() + "/api/save", { method: "PUT", keepalive: true, headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body: JSON.stringify({ save: pending }) }); } catch { /* 무시 */ }
});

function forgetLogin() { set(K.token, null); set(K.name, null); refreshButton(); }

// ---------- 로그인 후 처리 ----------
/** 토큰을 받은 뒤: 서버 세이브가 있으면 그것으로 교체하고 새로고침, 없으면 지금 진행을 올린다. */
async function enter(token: string, name: string): Promise<string | null> {
  const r = await api("/api/save", { token });
  if (!r.ok) return r.body?.error ?? "세이브를 불러오지 못했다";
  const serverSave: string | null = r.body.save;
  const local = get(SAVE_KEY);
  if (serverSave) {
    saveGuard.locked = true; // 교체하는 동안 현재 진행이 서버 세이브를 덮어쓰지 않게
    if (local && local !== serverSave) set(K.solo, local); // 이 기기의 솔로 진행은 백업
    set(SAVE_KEY, serverSave);
    set(K.token, token); set(K.name, name);
    location.reload();
    return null;
  }
  set(K.token, token); set(K.name, name);
  if (local) {
    const up = await api("/api/save", { method: "PUT", body: JSON.stringify({ save: local }) });
    if (!up.ok) return up.body?.error ?? "세이브를 올리지 못했다";
  }
  refreshButton(); render();
  toast(`${name}(으)로 로그인 — 진행이 서버에 저장돼`);
  return null;
}

async function logout() {
  if (pending !== null) await flush();
  await api("/api/logout", { method: "POST" });
  saveGuard.locked = true;
  const local = get(SAVE_KEY);
  if (local) set(K.solo, local); // 이 기기엔 남기지 않고(다른 계정으로 섞이지 않게) 백업만
  set(SAVE_KEY, null); set(K.token, null); set(K.name, null);
  location.reload();
}

// ---------- 화면 ----------
let online = false, busy = false, msg = "", draftName = "";
let btn: HTMLButtonElement, modal: HTMLDivElement;

function refreshButton() {
  if (!btn) return;
  btn.style.display = online ? "block" : "none";
  btn.textContent = get(K.token) ? `☁ ${get(K.name)}` : "☁ 계정";
}
const open = () => modal.classList.contains("open");
function setOpen(v: boolean) { modal.classList.toggle("open", v); if (v) { msg = ""; render(); } }

function render() {
  const logged = !!get(K.token);
  const remote = base() ? `<div class="am-sub">서버: ${esc(base())}</div>` : "";
  modal.innerHTML = logged
    ? `<div class="am-box"><h2>☁ ${esc(get(K.name) ?? "")}</h2>${remote}<p>진행이 서버에 저장되고 있어. 다른 기기에서 같은 계정으로 로그인하면 이어서 할 수 있어.</p><div class="am-msg">${esc(msg)}</div>
       <div class="am-row"><button data-a="logout">로그아웃</button><button data-a="close">닫기</button></div></div>`
    : `<div class="am-box"><h2>☁ 온라인 계정</h2>${remote}<p>로그인하면 진행이 서버에 저장돼. 서버에 이미 진행이 있으면 그걸로 불러오고, 이 기기의 솔로 진행은 백업해 둬.</p>
       <input id="amName" placeholder="닉네임 (2~12자)" maxlength="12" autocomplete="username" value="${esc(draftName)}"><input id="amPw" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="current-password"><div class="am-msg">${esc(msg)}</div>
       <div class="am-row"><button data-a="login">로그인</button><button data-a="register">가입</button><button data-a="close">솔로로 계속</button></div></div>`;
  modal.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) => (b.disabled = busy, b.onclick = () => act(b.dataset.a!)));
  modal.querySelector<HTMLInputElement>("#amPw")?.addEventListener("keydown", (e) => { if (e.key === "Enter") act("login"); });
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function act(a: string) {
  if (busy) return;
  if (a === "close") return setOpen(false);
  busy = true;
  try {
    if (a === "logout") { await logout(); return; }
    const name = (modal.querySelector("#amName") as HTMLInputElement).value.trim();
    draftName = name; // 실패해서 화면을 다시 그려도 닉네임은 남긴다
    const password = (modal.querySelector("#amPw") as HTMLInputElement).value;
    msg = "처리 중…"; render();
    const r = await api(a === "register" ? "/api/register" : "/api/login", { method: "POST", body: JSON.stringify({ name, password }), token: null });
    if (!r.ok) { msg = r.body?.error ?? "실패"; return; }
    const err = await enter(r.body.token, r.body.name);
    msg = err ?? "";
    if (!err) setOpen(false);
  } finally { busy = false; if (open()) render(); }
}

async function init() {
  btn = document.createElement("button");
  btn.id = "acct"; btn.style.display = "none";
  btn.onclick = () => setOpen(!open());
  modal = document.createElement("div");
  modal.id = "acctModal";
  modal.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  document.body.append(btn, modal);
  // 서버가 깨어나는 중(무료 클라우드 콜드 스타트)일 수 있어 몇 번 더 물어본다. Pages처럼 서버가 없으면 404로 바로 끝난다.
  for (let i = 0; i < 4 && !online; i++) {
    const ping = await api("/api/ping", { token: null, timeout: 6000 });
    online = ping.ok && ping.body?.game === "emberlands";
    if (!online && (ping.status === 404 || ping.status === 405)) break;
    if (!online) await new Promise((r) => setTimeout(r, 2000));
  }
  if (online && get(K.token)) { // 저장된 로그인이 아직 유효한지
    const me = await api("/api/save");
    if (me.status === 401) forgetLogin();
  }
  refreshButton();
}
init();
void $;
