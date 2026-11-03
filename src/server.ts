import { config } from "./config";
import { binanceBook } from "./binance";
import { clipHistory, clipSnapshotTape, clipTape, TAPE_MIDS } from "./snapshot";
import type { BlockEvent, Fill, Meta, PricePoint, Quote } from "./types";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
const SNAP_MS = 400;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

function jsonMaybeGzip(req: Request, body: unknown, status = 200) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const accept = req.headers.get("accept-encoding") ?? "";
  if (accept.includes("gzip")) {
    return new Response(Bun.gzipSync(raw), {
      status,
      headers: {
        ...CORS,
        "content-type": "application/json",
        "content-encoding": "gzip",
        vary: "accept-encoding",
        "cache-control": "no-store",
      },
    });
  }
  return new Response(raw, {
    status,
    headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" },
  });
}

export type SleeveView = { coin: string; history: () => BlockEvent[]; tape: () => PricePoint[] };

/** GET /snapshot, GET /history, GET /tape, GET /events SSE */
export function startServer(meta: Meta, sleeves: SleeveView[]) {
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const enc = new TextEncoder();
  const send = (c: ReadableStreamDefaultController<Uint8Array>, type: string, data: unknown) => {
    try { c.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { clients.delete(c); }
  };
  setInterval(() => clients.forEach((c) => send(c, "ping", Date.now())), 15_000);

  const historyByCoin = () => {
    const out: Record<string, BlockEvent[]> = {};
    for (const s of sleeves) out[s.coin] = s.history();
    return out;
  };
  const tapeByCoin = () => {
    const out: Record<string, PricePoint[]> = {};
    for (const s of sleeves) out[s.coin] = clipTape(s.tape(), TAPE_MIDS);
    return out;
  };
  const snapshotBody = () => {
    const history: Record<string, BlockEvent[]> = {};
    const tape: Record<string, PricePoint[]> = {};
    for (const s of sleeves) {
      history[s.coin] = clipHistory(s.history());
      tape[s.coin] = clipSnapshotTape(s.tape());
    }
    return { ...meta, historyByCoin: history, tapeByCoin: tape };
  };
  const latestByCoin = () => {
    const out: Record<string, BlockEvent | null> = {};
    for (const s of sleeves) out[s.coin] = s.history().at(-1) ?? null;
    return out;
  };

  type SnapCache = { at: number; json: string; event: Uint8Array };
  let snapCache: SnapCache | null = null;
  const snap = (): SnapCache => {
    const now = Date.now();
    if (snapCache && now - snapCache.at < SNAP_MS) return snapCache;
    const body = JSON.stringify(snapshotBody());
    snapCache = { at: now, json: body, event: enc.encode(`event: snapshot\ndata: ${body}\n\n`) };
    return snapCache;
  };

  Bun.serve({
    port: config.port,
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;
      if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
      if (pathname === "/") return json({ ...meta, latestByCoin: latestByCoin() });
      if (pathname === "/snapshot") return jsonMaybeGzip(req, snap().json);
      if (pathname === "/history") return jsonMaybeGzip(req, historyByCoin());
      if (pathname === "/binance") return jsonMaybeGzip(req, await binanceBook());
      if (pathname === "/live") return new Response(livePage(), { headers: { ...CORS, "content-type": "text/html; charset=utf-8" } });
      if (pathname === "/tape") return jsonMaybeGzip(req, tapeByCoin());
      if (pathname === "/events") {
        const lite = url.searchParams.get("lite") === "1";
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            clients.add(c);
            if (lite) send(c, "ready", meta.startedAt);
            else {
              try { c.enqueue(snap().event); } catch { clients.delete(c); }
            }
          },
          cancel(c) { clients.delete(c); },
        });
        return new Response(stream, { headers: { ...CORS, "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
      }
      return json({ error: "not found" }, 404);
    },
  });

  const broadcast = (type: string, data: unknown) => clients.forEach((c) => send(c, type, data));
  return {
    broadcast: (e: BlockEvent) => broadcast("block", e),
    broadcastQuote: (coin: string, block: number, quote: Quote) => broadcast("quote", { coin, block, quote }),
    broadcastFill: (coin: string, block: number, fill: Fill, ts?: number) => broadcast("fill", { coin, block, fill, ts }),
    broadcastPrice: (coin: string, print: { ts: number; mid: number; bestBid: number; bestAsk: number; spreadBps: number }) =>
      broadcast("price", { coin, ...print }),
  };
}

function livePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Binance ETHUSDT</title>
  <style>
    body { margin: 0; font-family: ui-monospace, Menlo, monospace; background: #fff; color: #000; }
    h1, h2 { margin: 0; }
    header, section { border-bottom: 1px solid #000; padding: 12px 14px; }
    h1 { font-size: 16px; }
    h2 { display: inline-block; background: #000; color: #fff; font-size: 12px; letter-spacing: 0.08em; padding: 2px 8px; margin-bottom: 8px; }
    p { margin: 6px 0 0; color: #333; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
    th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #e5e5e5; white-space: nowrap; }
    th { color: #666; font-size: 11px; }
    .long { color: #00aa00; font-weight: 700; }
    .short { color: #cc0000; font-weight: 700; }
  </style>
</head>
<body>
  <header>
    <h1>Binance ETHUSDT live</h1>
    <p id="note">Loading the exchange book. This is not the paper desk.</p>
  </header>
  <section>
    <h2>POSITION</h2>
    <div id="pos"></div>
  </section>
  <section>
    <h2>TRADES</h2>
    <div id="trades"></div>
  </section>
  <section>
    <h2>HISTORY</h2>
    <div id="hist"></div>
  </section>
  <script>
    const usd = (n) => (Number(n) < 0 ? "-$" : "$") + Math.abs(Number(n)).toFixed(2);
    const when = (t) => new Date(t).toLocaleString();
    const sideClass = (s) => s === "LONG" || s === "BUY" ? "long" : s === "SHORT" || s === "SELL" ? "short" : "";
    const table = (cols, rows) => rows.length ? "<table><thead><tr>" + cols.map((c) => "<th>" + c + "</th>").join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody></table>" : "<p>None yet</p>";
    async function pull() {
      const book = await (await fetch("/binance")).json();
      document.getElementById("note").textContent = book.error || "5x · 0.01 ETHUSDT · separate from the paper book";
      const p = book.position;
      document.getElementById("pos").innerHTML = table(["Side", "Size", "Entry", "Mark", "Lev", "Unrealized"], [
        "<tr><td class='" + sideClass(p.side) + "'>" + p.side + "</td><td>" + p.size + "</td><td>" + p.entry + "</td><td>" + p.mark + "</td><td>" + p.leverage + "x</td><td>" + usd(p.unrealized) + "</td></tr>"
      ]);
      const line = (t) => "<tr><td>" + when(t.time) + "</td><td class='" + sideClass(t.side) + "'>" + t.side + "</td><td>" + t.qty + "</td><td>" + t.price + "</td><td>" + usd(t.pnl) + "</td></tr>";
      document.getElementById("trades").innerHTML = table(["Time", "Side", "Qty", "Price", "PnL"], book.trades.map(line));
      document.getElementById("hist").innerHTML = table(["Time", "Side", "Qty", "Price", "Closed"], book.history.map(line));
    }
    pull().catch((e) => { document.getElementById("note").textContent = String(e); });
    setInterval(() => pull().catch(() => {}), 5000);
  </script>
</body>
</html>`;
}
