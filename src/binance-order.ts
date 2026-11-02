import { sendEthUsdt, type BinanceSide } from "./binance";

const side = (process.argv[2] ?? "").toUpperCase();
if (side !== "BUY" && side !== "SELL") {
  console.error("Refusing to send. Pass BUY or SELL.");
  console.error("Example: bun run order BUY");
  process.exit(1);
}

try {
  console.log(await sendEthUsdt(side as BinanceSide));
} catch (e) {
  console.error(`Binance rejected the order. ${(e as Error).message}`);
  process.exit(1);
}
