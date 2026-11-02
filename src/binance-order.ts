import { createHmac } from "node:crypto";

const symbol = "ETHUSDT";
const qty = "0.01";

const side = (process.argv[2] ?? "").toUpperCase();
if (side !== "BUY" && side !== "SELL") {
  console.error("Refusing to send. Pass BUY or SELL.");
  console.error("Example: bun run order BUY");
  process.exit(1);
}

const key = process.env.BINANCE_API_KEY?.trim() ?? "";
const secret = process.env.BINANCE_API_SECRET?.trim() ?? "";
if (!key || !secret) {
  console.error("Refusing to send. Set BINANCE_API_KEY and BINANCE_API_SECRET in .env on this machine.");
  process.exit(1);
}

const params = new URLSearchParams({
  symbol,
  side,
  type: "MARKET",
  quantity: qty,
  timestamp: String(Date.now()),
  recvWindow: "5000",
});
const signature = createHmac("sha256", secret).update(params.toString()).digest("hex");
params.set("signature", signature);

const res = await fetch(`https://fapi.binance.com/fapi/v1/order?${params}`, {
  method: "POST",
  headers: { "X-MBX-APIKEY": key },
});
const body = await res.text();
let parsed: unknown = body;
try {
  parsed = JSON.parse(body);
} catch {
  // Binance sometimes returns plain text.
}
if (!res.ok) {
  console.error(`Binance rejected the order (${res.status}).`);
  console.error(typeof parsed === "string" ? parsed : JSON.stringify(parsed));
  process.exit(1);
}
const order = parsed as { orderId?: number; status?: string; executedQty?: string; avgPrice?: string };
console.log(`Sent ${side} ${qty} ${symbol}. id ${order.orderId ?? "?"} status ${order.status ?? "?"} filled ${order.executedQty ?? "?"} avg ${order.avgPrice ?? "?"}`);
