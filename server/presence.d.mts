import type { Server } from "node:http";
export const MAX_PLAYERS: number;
export const MAX_CHAT: number;
export function cleanText(s: unknown): string | null;
export function attachPresence(s: Server, opts?: { tickMs?: number; worldFile?: string }): { players: Map<string, unknown>; lit: Set<string>; owners: Map<number, string>; close(): void };
