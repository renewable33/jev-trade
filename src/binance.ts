import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const symbol = "ETHUSDT";
const qty = "0.01";
const leverage = "5";
const memoryPath = "data/binance-eth.json";

export type BinanceSide = "BUY" | "SELL";

export type BinanceRow = {
  id: number;
  time: number;
  side: string;
  price: string;
  qty: string;
  pnl: string;
};

export type BinanceBook = {
  ok: boolean;
  error: string | null;
  symbol: "ETHUSDT";
  leverage: "5";
  qty: "0.01";
  position: {
    side: "LONG" | "SHORT" | "FLAT";
    size: string;
    entry: string;
    mark: string;
    leverage: string;
    unrealized: string;
  };
  trades: BinanceRow[];
  history: BinanceRow[];
};

export function rememberedBinanceSide(): BinanceSide | null {
  try {
    const raw = JSON.parse(readFileSync(memoryPath, "utf8")) as { side?: string };
    return raw.side === "BUY" || raw.side === "SELL" ? raw.side : null;
  } catch {
    return null;
  }
}

export function rememberBinanceSide(side: BinanceSide | null) {
  mkdirSync("data", { recursive: true });
  writeFileSync(memoryPath, JSON.stringify({ side }));
}

const emptyBook = (error: string | null, ok = false): BinanceBook => ({
  ok,
  error,
  symbol: "ETHUSDT",
  leverage: "5",
  qty: "0.01",
  position: { side: "FLAT", size: "0", entry: "0", mark: "0", leverage: "5", unrealized: "0" },
  trades: [],
  history: [],
});

let bookCache: { at: number; body: BinanceBook } | null = null;

/** Live ETHUSDT position, fills, and closed fills. Cached for a few seconds. Never returns the key. */
export async function binanceBook(): Promise<BinanceBook> {
  if (bookCache && Date.now() - bookCache.at < 4000) return bookCache.body;
  const key = process.env.BINANCE_API_KEY?.trim() ?? "";
  const secret = process.env.BINANCE_API_SECRET?.trim() ?? "";
  if (!key || !secret) return emptyBook("Binance key is not on this desk");
  try {
    const risk = await signed("GET", key, secret, "/fapi/v2/positionRisk", { symbol });
    const rows = Array.isArray(risk) ? risk as Record<string, string>[] : [];
    const row = rows.find((r) => r.symbol === symbol) ?? rows[0];
    const amt = Number(row?.positionAmt ?? 0);
    const tradesRaw = await signed("GET", key, secret, "/fapi/v1/userTrades", { symbol, limit: "100" });
    const trades = (Array.isArray(tradesRaw) ? tradesRaw as Record<string, string>[] : [])
      .map((t) => ({
        id: Number(t.id),
        time: Number(t.time),
        side: t.side === "BUY" || t.buyer === "true" ? "BUY" : "SELL",
        price: t.price,
        qty: t.qty,
        pnl: t.realizedPnl ?? "0",
      }))
      .sort((a, b) => b.time - a.time);
    const body: BinanceBook = {
      ok: true,
      error: null,
      symbol: "ETHUSDT",
      leverage: "5",
      qty: "0.01",
      position: {
        side: amt > 0 ? "LONG" : amt < 0 ? "SHORT" : "FLAT",
        size: String(Math.abs(amt)),
        entry: row?.entryPrice ?? "0",
        mark: row?.markPrice ?? "0",
        leverage: row?.leverage ?? leverage,
        unrealized: row?.unRealizedProfit ?? "0",
      },
      trades,
      history: trades.filter((t) => Number(t.pnl) !== 0),
    };
    bookCache = { at: Date.now(), body };
    return body;
  } catch (e) {
    return emptyBook((e as Error).message);
  }
}

/** Market order for 0.01 ETHUSDT at 5x. Throws with Binance's message. Never prints the key. */
export async function sendEthUsdt(side: BinanceSide, reduceOnly = false): Promise<string> {
  const key = process.env.BINANCE_API_KEY?.trim() ?? "";
  const secret = process.env.BINANCE_API_SECRET?.trim() ?? "";
  if (!key || !secret) throw new Error("BINANCE_API_KEY or BINANCE_API_SECRET is empty");
  if (!reduceOnly) await setEthLeverage(key, secret);
  else {
    try {
      await setEthLeverage(key, secret);
    } catch {
      // A close must still be sent if the leverage change is rejected.
    }
  }
  const parsed = await signed("POST", key, secret, "/fapi/v1/order", {
    symbol,
    side,
    type: "MARKET",
    quantity: qty,
    recvWindow: "5000",
    ...(reduceOnly ? { reduceOnly: "true" } : {}),
  }) as { orderId?: number; status?: string; executedQty?: string; avgPrice?: string };
  bookCache = null;
  return `binance ${reduceOnly ? "close " : ""}${side} ${qty} ${symbol} ${leverage}x id ${parsed.orderId ?? "?"} status ${parsed.status ?? "?"} filled ${parsed.executedQty ?? "?"} avg ${parsed.avgPrice ?? "?"}`;
}

async function setEthLeverage(key: string, secret: string) {
  await signed("POST", key, secret, "/fapi/v1/leverage", { symbol, leverage, recvWindow: "5000" });
}

async function signed(method: "GET" | "POST", key: string, secret: string, path: string, fields: Record<string, string>) {
  const params = new URLSearchParams({ ...fields, timestamp: String(Date.now()) });
  const signature = createHmac("sha256", secret).update(params.toString()).digest("hex");
  params.set("signature", signature);
  const res = await fetch(`https://fapi.binance.com${path}?${params}`, {
    method,
    headers: { "X-MBX-APIKEY": key },
  });
  const body = await res.text();
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    if (!res.ok) throw new Error(body.slice(0, 180));
  }
  if (!res.ok) {
    const msg = parsed && typeof parsed === "object" && "msg" in parsed ? String((parsed as { msg?: string }).msg) : body.slice(0, 180);
    throw new Error(msg);
  }
  return parsed;
}
