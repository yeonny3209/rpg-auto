import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.mjs";
import { attachPresence, cleanText, MAX_CHAT, MAX_PLAYERS } from "../server/presence.mjs";

let srv: ReturnType<typeof createApp>, pres: ReturnType<typeof attachPresence>, port = 0;
beforeAll(async () => {
  srv = createApp({});
  pres = attachPresence(srv, { tickMs: 20 });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  port = (srv.address() as AddressInfo).port;
});
afterAll(async () => { pres.close(); await new Promise((r) => srv.close(r)); });

async function account(name: string) {
  const r = await fetch(`http://127.0.0.1:${port}/api/register`, { method: "POST", body: JSON.stringify({ name, password: "secret1" }) });
  return (await r.json()).token as string;
}
type Msg = any;
function connect(token: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
  const got: Msg[] = [];
  ws.on("message", (d) => got.push(JSON.parse(d.toString())));
  const open = new Promise<void>((res, rej) => { ws.on("open", () => res()); ws.on("error", rej); ws.on("unexpected-response", () => rej(new Error("rejected"))); });
  const until = async (f: (m: Msg) => boolean, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { const m = got.find(f); if (m) return m; await new Promise((r) => setTimeout(r, 10)); } throw new Error("timeout: " + JSON.stringify(got.slice(-4))); };
  return { ws, got, open, until };
}

describe("접속자 공유", () => {
  it("토큰이 없거나 틀리면 접속이 거부된다", async () => {
    await expect(connect("0".repeat(64)).open).rejects.toBeTruthy();
  });
  it("둘이 접속하면 서로의 위치와 채팅을 받는다", async () => {
    const a = connect(await account("가나다")), b = connect(await account("라마바"));
    await Promise.all([a.open, b.open]);
    await a.until((m) => m.t === "hello");
    const hb = await b.until((m) => m.t === "hello");
    expect(hb.players.map((p: any) => p.name)).toContain("가나다");
    a.ws.send(JSON.stringify({ t: "pos", x: 12.5, z: -3, ry: 1, cls: "tracker", lv: 7, hp: 0.5 }));
    const snap = await b.until((m) => m.t === "snap" && m.players.some((p: any) => p.name === "가나다" && p.x === 12.5));
    const p = snap.players.find((p: any) => p.name === "가나다");
    expect(p).toMatchObject({ z: -3, cls: "tracker", lv: 7, hp: 0.5 });
    a.ws.send(JSON.stringify({ t: "chat", text: "  안녕\n하세요  " }));
    expect((await b.until((m) => m.t === "chat" && m.from === "가나다")).text).toBe("안녕 하세요");
    a.ws.close();
    await b.until((m) => m.t === "leave" && m.name === "가나다");
    b.ws.close();
  });
  it("이상한 값은 걸러지고 좌표는 한계로 잘린다", async () => {
    const a = connect(await account("사아자")), b = connect(await account("차카타"));
    await Promise.all([a.open, b.open]);
    a.ws.send("not json"); a.ws.send(JSON.stringify({ t: "pos", x: "NaN", z: 1 })); a.ws.send(JSON.stringify({ t: "pos", x: 99999, z: -99999, cls: "hacker", lv: 9999 }));
    const snap = await b.until((m) => m.t === "snap" && m.players.some((p: any) => p.name === "사아자"));
    const p = snap.players.find((p: any) => p.name === "사아자");
    expect(p.x).toBe(400); expect(p.z).toBe(-400); expect(p.cls).toBe(""); expect(p.lv).toBe(99);
    a.ws.close(); b.ws.close();
  });
  it("채팅 도배는 막히고 길이는 잘린다", async () => {
    const a = connect(await account("하하하")), b = connect(await account("호호호"));
    await Promise.all([a.open, b.open]);
    a.ws.send(JSON.stringify({ t: "chat", text: "x".repeat(500) }));
    a.ws.send(JSON.stringify({ t: "chat", text: "두번째" }));
    const first = await b.until((m) => m.t === "chat" && m.from === "하하하");
    expect(first.text.length).toBe(MAX_CHAT);
    await new Promise((r) => setTimeout(r, 150));
    expect(b.got.filter((m) => m.t === "chat" && m.from === "하하하").length).toBe(1);
    a.ws.close(); b.ws.close();
  });
  it("같은 계정으로 다시 접속하면 이전 연결이 끊긴다", async () => {
    const token = await account("재접속");
    const a = connect(token); await a.open;
    const b = connect(token); await b.open;
    await a.until((m) => m.t === "kicked");
    b.ws.close();
  });
  it("정원이 차면 접속이 거절된다", async () => {
    const conns = [];
    for (let i = 0; i < MAX_PLAYERS + 1; i++) { const c = connect(await account("풀" + String(i).padStart(2, "0"))); await c.open; conns.push(c); }
    const full = conns.filter((c) => c.got.some((m) => m.t === "full"));
    await new Promise((r) => setTimeout(r, 100));
    expect(conns.filter((c) => c.got.some((m) => m.t === "full")).length + full.length).toBeGreaterThan(0);
    for (const c of conns) c.ws.close();
  });
  it("봉화 점화는 모두에게 공유되고, 나중에 들어온 사람도 받는다. 이상한 id는 무시", async () => {
    const a = connect(await account("봉화가")), b = connect(await account("봉화나"));
    await Promise.all([a.open, b.open]);
    a.ws.send(JSON.stringify({ t: "beacon", id: "mireGate" }));
    a.ws.send(JSON.stringify({ t: "beacon", id: "../etc" }));
    a.ws.send(JSON.stringify({ t: "beacon", id: 5 }));
    const m = await b.until((x) => x.t === "beacon" && x.id === "mireGate");
    expect(m.by).toBe("봉화가");
    await new Promise((r) => setTimeout(r, 100));
    expect(b.got.filter((x) => x.t === "beacon").length).toBe(1);
    const c = connect(await account("봉화다")); await c.open;
    expect((await c.until((x) => x.t === "hello")).lit).toContain("mireGate");
    a.ws.close(); b.ws.close(); c.ws.close();
  });
  it("공유 월드는 파일로 보존된다", async () => {
    const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
    const f = path.join(os.tmpdir(), "world-" + Date.now() + ".json");
    const s2 = createApp({}); const p2 = attachPresence(s2, { tickMs: 20, worldFile: f });
    await new Promise<void>((r) => s2.listen(0, "127.0.0.1", r));
    const port2 = (s2.address() as AddressInfo).port;
    const tok = (await (await fetch(`http://127.0.0.1:${port2}/api/register`, { method: "POST", body: JSON.stringify({ name: "저장자", password: "secret1" }) })).json()).token;
    const ws = new WebSocket(`ws://127.0.0.1:${port2}/ws?token=${tok}`);
    await new Promise((r) => ws.on("open", r));
    ws.send(JSON.stringify({ t: "beacon", id: "savedOne" }));
    await new Promise((r) => setTimeout(r, 150));
    ws.close(); p2.close(); await new Promise((r) => s2.close(r));
    const s3 = createApp({}); const p3 = attachPresence(s3, { worldFile: f });
    expect([...p3.lit]).toContain("savedOne");
    p3.close(); fs.rmSync(f);
  });
  it("cleanText", () => {
    expect(cleanText("")).toBeNull(); expect(cleanText(5)).toBeNull(); expect(cleanText(" a\u0001b ")).toBe("a b");
  });
});
