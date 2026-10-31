export const dynamic = "force-dynamic";

/**
 * Live BTCUSDT. Binance, Kraken, and CoinGecko are in public-apis.
 * The public price calls do not need a key.
 */
export async function GET() {
  const binance = await binanceBtcUsdt();
  const price = binance ?? (await krakenBtcUsdt()) ?? (await coinGeckoBtcUsd());
  if (price == null) {
    return Response.json({ error: "BTCUSDT price unavailable" }, { status: 502 });
  }
  return Response.json(
    { symbol: "BTCUSDT", price, source: binance != null ? "binance" : "public-apis" },
    { headers: { "cache-control": "no-store" } },
  );
}

async function binanceBtcUsdt(): Promise<number | null> {
  try {
    const r = await fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT", { cache: "no-store" });
    if (!r.ok) return null;
    const body = (await r.json()) as { price?: string };
    const n = Number(body.price);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function krakenBtcUsdt(): Promise<number | null> {
  try {
    const r = await fetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSDT", { cache: "no-store" });
    if (!r.ok) return null;
    const body = (await r.json()) as { result?: { XBTUSDT?: { c?: string[] } } };
    const n = Number(body.result?.XBTUSDT?.c?.[0]);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function coinGeckoBtcUsd(): Promise<number | null> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", {
      cache: "no-store",
    });
    if (!r.ok) return null;
    const body = (await r.json()) as { bitcoin?: { usd?: number } };
    const n = Number(body.bitcoin?.usd);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
