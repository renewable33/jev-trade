import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const symbol = "ETHUSDT";
const qty = "0.01";
const memoryPath = "data/binance-eth.json";

export type BinanceSide = "BUY" | "SELL";

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

/** Market order for 0.01 ETHUSDT. Throws with Binance's message. Never prints the key. */
export async function sendEthUsdt(side: BinanceSide, reduceOnly = false): Promise<string> {
  const key = process.env.BINANCE_API_KEY?.trim() ?? "";
  const secret = process.env.BINANCE_API_SECRET?.trim() ?? "";
  if (!key || !secret) throw new Error("BINANCE_API_KEY or BINANCE_API_SECRET is empty");
  const params = new URLSearchParams({
    symbol,
    side,
    type: "MARKET",
    quantity: qty,
    timestamp: String(Date.now()),
    recvWindow: "5000",
  });
  if (reduceOnly) params.set("reduceOnly", "true");
  const signature = createHmac("sha256", secret).update(params.toString()).digest("hex");
  params.set("signature", signature);
  const res = await fetch(`https://fapi.binance.com/fapi/v1/order?${params}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": key },
  });
  const body = await res.text();
  let parsed: { orderId?: number; status?: string; executedQty?: string; avgPrice?: string; msg?: string } = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    if (!res.ok) throw new Error(body.slice(0, 180));
  }
  if (!res.ok) throw new Error(parsed.msg ?? body.slice(0, 180));
  return `binance ${reduceOnly ? "close " : ""}${side} ${qty} ${symbol} id ${parsed.orderId ?? "?"} status ${parsed.status ?? "?"} filled ${parsed.executedQty ?? "?"} avg ${parsed.avgPrice ?? "?"}`;
}
