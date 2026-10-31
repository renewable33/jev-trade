"use client";

import { useEffect, useState } from "react";

/** Binance BTCUSDT via /api/btcusdt. Public price, no key. */
export function useBtcUsdt() {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const r = await fetch("/api/btcusdt", { cache: "no-store" });
        if (!r.ok) return;
        const body = (await r.json()) as { price?: number };
        if (!stop && typeof body.price === "number" && body.price > 0) setPrice(body.price);
      } catch {
        // keep the last print
      }
    };
    void pull();
    const id = setInterval(() => void pull(), 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);
  return price;
}
