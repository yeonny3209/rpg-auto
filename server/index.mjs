import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 8080);
const dataDir = process.env.DATA_DIR ?? path.join(root, "server-data");
fs.mkdirSync(dataDir, { recursive: true });
const server = createApp({ dataFile: path.join(dataDir, "accounts.json"), staticDir: path.join(root, "dist") });
server.listen(port, "0.0.0.0", () => console.log(`잔불의 대지 서버: http://localhost:${port} (데이터: ${dataDir})`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, async () => { await server.flush(); process.exit(0); });
