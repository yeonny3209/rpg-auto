import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/app.mjs";

let base = "", srv: ReturnType<typeof createApp>, dir = "", file = "";
let t = 1_000_000;
beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ember-"));
  file = path.join(dir, "accounts.json");
  fs.mkdirSync(path.join(dir, "site"));
  fs.writeFileSync(path.join(dir, "site", "index.html"), "<h1>hi</h1>");
  srv = createApp({ dataFile: file, staticDir: path.join(dir, "site"), now: () => t });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(async () => { await srv.flush(); await new Promise((r) => srv.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });

const post = (p: string, body: unknown, token?: string) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const SAVE = JSON.stringify({ version: 8, level: 3 });

describe("계정·세이브 서버", () => {
  it("가입 → 세이브 저장/불러오기", async () => {
    const r = await post("/api/register", { name: "세윤", password: "secret1" });
    expect(r.status).toBe(201);
    const { token } = await r.json();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const get0 = await (await fetch(base + "/api/save", { headers: { authorization: `Bearer ${token}` } })).json();
    expect(get0.save).toBeNull();
    const put = await fetch(base + "/api/save", { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ save: SAVE }) });
    expect(put.status).toBe(200);
    const get1 = await (await fetch(base + "/api/save", { headers: { authorization: `Bearer ${token}` } })).json();
    expect(get1.save).toBe(SAVE);
  });
  it("닉네임 중복(대소문자 무시)·규칙 위반·짧은 비밀번호는 거부", async () => {
    await post("/api/register", { name: "Alice", password: "secret1" });
    expect((await post("/api/register", { name: "alice", password: "secret1" })).status).toBe(409);
    expect((await post("/api/register", { name: "a", password: "secret1" })).status).toBe(400);
    expect((await post("/api/register", { name: "bad name!", password: "secret1" })).status).toBe(400);
    expect((await post("/api/register", { name: "Bobby", password: "123" })).status).toBe(400);
  });
  it("로그인: 맞는 비밀번호만 통과, 비밀번호는 평문으로 저장되지 않는다", async () => {
    expect((await post("/api/login", { name: "세윤", password: "wrong!!" })).status).toBe(401);
    const ok = await post("/api/login", { name: "세윤", password: "secret1" });
    expect(ok.status).toBe(200);
    await srv.flush();
    const raw = fs.readFileSync(file, "utf8");
    expect(raw).not.toContain("secret1");
    expect(raw).toContain("세윤");
  });
  it("토큰 없이/가짜 토큰으로는 세이브 접근 불가, 로그아웃하면 토큰이 무효", async () => {
    expect((await fetch(base + "/api/save")).status).toBe(401);
    expect((await fetch(base + "/api/save", { headers: { authorization: "Bearer " + "0".repeat(64) } })).status).toBe(401);
    const { token } = await (await post("/api/login", { name: "세윤", password: "secret1" })).json();
    await post("/api/logout", {}, token);
    expect((await fetch(base + "/api/save", { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  });
  it("잘못된 세이브·너무 큰 세이브는 거부, 기존 세이브는 유지", async () => {
    const { token } = await (await post("/api/login", { name: "세윤", password: "secret1" })).json();
    const put = (body: unknown) => fetch(base + "/api/save", { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await put({ save: "not json" })).status).toBe(400);
    expect((await put({ save: JSON.stringify({ nope: 1 }) })).status).toBe(400);
    expect((await put({ save: "x".repeat(300_000) })).status).toBe(413);
    const g = await (await fetch(base + "/api/save", { headers: { authorization: `Bearer ${token}` } })).json();
    expect(g.save).toBe(SAVE);
  });
  it("세션은 30일 뒤 만료", async () => {
    const { token } = await (await post("/api/login", { name: "세윤", password: "secret1" })).json();
    t += 31 * 24 * 3600 * 1000;
    expect((await fetch(base + "/api/save", { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  });
  it("로그인 반복 실패는 잠깐 막힌다", async () => {
    for (let i = 0; i < 8; i++) await post("/api/login", { name: "세윤", password: "nope" + i });
    expect((await post("/api/login", { name: "세윤", password: "secret1" })).status).toBe(429);
    t += 61_000;
    expect((await post("/api/login", { name: "세윤", password: "secret1" })).status).toBe(200);
  });
  it("서버를 다시 켜도 계정과 세이브가 남는다", async () => {
    await srv.flush();
    const s2 = createApp({ dataFile: file, now: () => t });
    await new Promise<void>((r) => s2.listen(0, "127.0.0.1", r));
    const b2 = `http://127.0.0.1:${(s2.address() as AddressInfo).port}`;
    const { token } = await (await fetch(b2 + "/api/login", { method: "POST", body: JSON.stringify({ name: "세윤", password: "secret1" }) })).json();
    const g = await (await fetch(b2 + "/api/save", { headers: { authorization: `Bearer ${token}` } })).json();
    expect(g.save).toBe(SAVE);
    await new Promise((r) => s2.close(r));
  });
  it("정적 파일 제공 + 경로 탈출 차단 + ping", async () => {
    expect(await (await fetch(base + "/")).text()).toContain("<h1>hi</h1>");
    expect((await fetch(base + "/..%2f..%2fetc/passwd")).status).not.toBe(200);
    expect((await (await fetch(base + "/api/ping")).json()).game).toBe("emberlands");
  });
});
