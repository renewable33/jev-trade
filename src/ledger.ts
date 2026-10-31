import { mkdirSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Side } from "./types";

/** Closed trades and open paper size stay on disk for one week. */
export const PAPER_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const PAPER_BOOK_PATH = "/workspace/jev-trade/data/paper-book.json";

export type PaperFill = {
  ts: number;
  side: Side;
  price: number;
  size: number;
  dir?: "open" | "close" | "flip";
  hash?: string;
  closedPnl?: number;
  feeUsd?: number;
};

export type PaperSleeve = {
  sz: number;
  costUsd: number;
  realizedUsd: number;
  gasUsd: number;
  leverage: number | null;
  fills: PaperFill[];
};

export type PaperBookFile = {
  savedAt: number;
  sleeves: Record<string, PaperSleeve>;
};

const empty = (): PaperBookFile => ({ savedAt: 0, sleeves: {} });

export function pruneFills(fills: PaperFill[], now = Date.now()): PaperFill[] {
  const cut = now - PAPER_WEEK_MS;
  return fills.filter((f) => f.ts >= cut && f.size > 0 && f.price > 0);
}

function num(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function readFill(raw: unknown): PaperFill | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const ts = num(o.ts);
  const price = num(o.price);
  const size = num(o.size);
  const side = o.side === "buy" || o.side === "sell" ? o.side : null;
  if (ts == null || price == null || size == null || !side || !(ts > 0) || !(price > 0) || !(size > 0)) return null;
  const dir = o.dir === "open" || o.dir === "close" || o.dir === "flip" ? o.dir : undefined;
  const closedPnl = num(o.closedPnl);
  const feeUsd = num(o.feeUsd);
  const hash = typeof o.hash === "string" && o.hash ? o.hash : undefined;
  return {
    ts, side, price, size,
    ...(dir ? { dir } : {}),
    ...(hash ? { hash } : {}),
    ...(closedPnl != null ? { closedPnl } : {}),
    ...(feeUsd != null ? { feeUsd } : {}),
  };
}

function readSleeve(raw: unknown): PaperSleeve | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sz = num(o.sz) ?? 0;
  const costUsd = num(o.costUsd) ?? 0;
  const fills = Array.isArray(o.fills) ? o.fills.map(readFill).filter((f): f is PaperFill => f != null) : [];
  const leverage = num(o.leverage);
  return {
    sz,
    costUsd,
    realizedUsd: num(o.realizedUsd) ?? 0,
    gasUsd: num(o.gasUsd) ?? 0,
    leverage,
    fills,
  };
}

export function parsePaperBook(raw: unknown, now = Date.now()): PaperBookFile {
  if (!raw || typeof raw !== "object") return empty();
  const sleeves: Record<string, PaperSleeve> = {};
  const src = (raw as { sleeves?: unknown }).sleeves;
  if (src && typeof src === "object") {
    for (const [coin, row] of Object.entries(src as Record<string, unknown>)) {
      const sleeve = readSleeve(row);
      if (!sleeve) continue;
      sleeve.fills = pruneFills(sleeve.fills, now);
      sleeves[coin] = sleeve;
    }
  }
  return { savedAt: num((raw as { savedAt?: unknown }).savedAt) ?? 0, sleeves };
}

export function loadPaperBook(path = PAPER_BOOK_PATH, now = Date.now()): PaperBookFile {
  try {
    return parsePaperBook(JSON.parse(readFileSync(path, "utf8")), now);
  } catch {
    return empty();
  }
}

export function savePaperBook(book: PaperBookFile, path = PAPER_BOOK_PATH, now = Date.now()) {
  const next = parsePaperBook(book, now);
  next.savedAt = now;
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(next));
  renameSync(tmp, path);
}
