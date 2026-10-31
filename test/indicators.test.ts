import { expect, test } from "bun:test";
import { parseAssetCtx, rangeFilter, rsi, sma, snapshotIndicators, venueFeatures } from "../src/indicators";
import { rangeFilterCall } from "../src/model";

test("sma and rsi on a rising series", () => {
  const xs = Array.from({ length: 20 }, (_, i) => 100 + i);
  expect(sma(xs, 5)).toBe(117);
  expect(rsi(xs, 14)).toBe(100);
});

test("snapshotIndicators sits mid-range on a flat tape", () => {
  const xs = Array.from({ length: 50 }, () => 100);
  const snap = snapshotIndicators(xs, 100);
  expect(snap.sma20).toBe(100);
  expect(snap.sma50).toBe(100);
  expect(snap.rsi14).toBe(50);
  expect(snap.rangePos20).toBe(0.5);
  expect(snap.midVsSma20Bps).toBe(0);
});

test("range filter follows a ramp and stays flat on a dead tape", () => {
  const flat = rangeFilter(Array.from({ length: 80 }, () => 100));
  expect(flat?.dir).toBe(0);
  expect(flat?.filter).toBe(100);
  const up = rangeFilter(Array.from({ length: 80 }, (_, i) => 100 + i * 0.5));
  expect(up?.dir).toBe(1);
  expect(100 + 79 * 0.5).toBeGreaterThan(up!.filter);
  const down = rangeFilter(Array.from({ length: 80 }, (_, i) => 200 - i * 0.5));
  expect(down?.dir).toBe(-1);
  expect(200 - 79 * 0.5).toBeLessThan(down!.filter);
});

test("range filter call buys a rising filter and sells a falling one", () => {
  const bull = { filter: 100, dir: 1 as const };
  const bear = { filter: 100, dir: -1 as const };
  expect(rangeFilterCall(bull, 101, "flat")).toEqual({ intent: "open", bias: "long" });
  expect(rangeFilterCall(bull, 101, "long")).toEqual({ intent: "hold", bias: "long" });
  expect(rangeFilterCall(bear, 99, "long")).toEqual({ intent: "close", bias: "short" });
  expect(rangeFilterCall(bear, 99, "flat")).toEqual({ intent: "open", bias: "short" });
  expect(rangeFilterCall(bull, 99, "flat")).toEqual({ intent: "hold", bias: "long" });
  expect(rangeFilterCall(null, 100, "short")).toEqual({ intent: "hold", bias: "short" });
});

test("parseAssetCtx and venueFeatures read Hyperliquid ctx", () => {
  const ctx = parseAssetCtx({
    markPx: "77000",
    oraclePx: "76990",
    funding: "0.0001",
    premium: "0.0002",
    openInterest: "123.4",
    prevDayPx: "76000",
    dayNtlVlm: "1000000",
  });
  const v = venueFeatures(ctx, 77000);
  expect(v.markPx).toBe(77000);
  expect(v.fundingBps).toBeCloseTo(1, 8);
  expect(v.premiumBps).toBeCloseTo(2, 8);
  expect(v.dayChangeBps).toBeCloseTo(((77000 - 76000) / 76000) * 10_000, 6);
});
