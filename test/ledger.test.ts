import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PAPER_WEEK_MS, loadPaperBook, parsePaperBook, pruneFills, savePaperBook, type PaperSleeve } from "../src/ledger";

test("pruneFills keeps a week and drops older closes", () => {
  const now = 1_000_000_000_000;
  const fills = pruneFills([
    { ts: now - PAPER_WEEK_MS - 1, side: "buy", price: 1, size: 1 },
    { ts: now - PAPER_WEEK_MS, side: "sell", price: 2, size: 1, dir: "close", closedPnl: 1 },
    { ts: now, side: "buy", price: 3, size: 1, dir: "open" },
  ], now);
  expect(fills.map((f) => f.price)).toEqual([2, 3]);
});

test("paper book round trip keeps an open position", () => {
  const dir = mkdtempSync(join(tmpdir(), "paper-"));
  const path = join(dir, "paper-book.json");
  const row: PaperSleeve = {
    sz: 0.00015,
    costUsd: 11.9,
    realizedUsd: -0.02,
    gasUsd: 0.01,
    leverage: 3,
    fills: [{ ts: Date.now(), side: "sell", price: 79000, size: 0.00015, dir: "close", closedPnl: -0.02 }],
  };
  savePaperBook({ savedAt: 0, sleeves: { BTC: row } }, path);
  const loaded = loadPaperBook(path);
  expect(loaded.sleeves.BTC?.sz).toBe(0.00015);
  expect(loaded.sleeves.BTC?.costUsd).toBe(11.9);
  expect(loaded.sleeves.BTC?.fills).toHaveLength(1);
  expect(parsePaperBook({ sleeves: { ETH: { sz: "nope" } } }).sleeves.ETH?.sz).toBe(0);
});
