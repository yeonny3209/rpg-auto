import type { Server } from "node:http";
export const NAME_RE: RegExp;
export const MIN_PW: number;
export const MAX_SAVE_BYTES: number;
export function createApp(opts?: { dataFile?: string; staticDir?: string; now?: () => number }): Server & { flush(): Promise<void> };
