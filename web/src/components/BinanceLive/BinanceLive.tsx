"use client";

import { useEffect, useState } from "react";
import styles from "./BinanceLive.module.css";

type Row = { id: number; time: number; side: string; price: string; qty: string; pnl: string };
type Book = {
  ok: boolean;
  error: string | null;
  position: { side: string; size: string; entry: string; mark: string; leverage: string; unrealized: string };
  trades: Row[];
  history: Row[];
};

const EMPTY: Book = {
  ok: false,
  error: null,
  position: { side: "FLAT", size: "0", entry: "0", mark: "0", leverage: "5", unrealized: "0" },
  trades: [],
  history: [],
};

function usd(n: string) {
  const v = Number(n);
  return `${v < 0 ? "-$" : "$"}${Math.abs(v).toFixed(2)}`;
}

function when(t: number) {
  return new Date(t).toLocaleString();
}

export default function BinanceLive({ api }: { api: string }) {
  const [book, setBook] = useState<Book>(EMPTY);

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const next = await (await fetch(`${api}/binance`, { cache: "no-store" })).json();
        if (!stop) setBook(next);
      } catch {
        if (!stop) setBook({ ...EMPTY, error: "Binance book unavailable" });
      }
    };
    void pull();
    const id = setInterval(() => void pull(), 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [api]);

  const p = book.position;
  return (
    <section className={styles.wrap} aria-label="Binance ETHUSDT live">
      <div className={styles.bar}>
        <h2>Binance ETHUSDT</h2>
        <span>{book.error ?? "Live · 5x · 0.01 · not the paper book"}</span>
      </div>
      <div className={styles.grid}>
        <div>
          <h3>Position</h3>
          <table>
            <thead><tr><th>Side</th><th>Size</th><th>Entry</th><th>Mark</th><th>Lev</th><th>Unrealized</th></tr></thead>
            <tbody>
              <tr>
                <td className={p.side === "LONG" ? styles.long : p.side === "SHORT" ? styles.short : undefined}>{p.side}</td>
                <td>{p.size}</td>
                <td>{p.entry}</td>
                <td>{p.mark}</td>
                <td>{p.leverage}x</td>
                <td>{usd(p.unrealized)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3>Trades</h3>
          <Rows rows={book.trades} pnl="PnL" />
        </div>
        <div>
          <h3>History</h3>
          <Rows rows={book.history} pnl="Closed" />
        </div>
      </div>
    </section>
  );
}

function Rows({ rows, pnl }: { rows: Row[]; pnl: string }) {
  if (!rows.length) return <p className={styles.empty}>None yet</p>;
  return (
    <table>
      <thead><tr><th>Time</th><th>Side</th><th>Qty</th><th>Price</th><th>{pnl}</th></tr></thead>
      <tbody>
        {rows.slice(0, 30).map((t) => (
          <tr key={t.id}>
            <td>{when(t.time)}</td>
            <td className={t.side === "BUY" ? styles.long : styles.short}>{t.side}</td>
            <td>{t.qty}</td>
            <td>{t.price}</td>
            <td>{usd(t.pnl)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
