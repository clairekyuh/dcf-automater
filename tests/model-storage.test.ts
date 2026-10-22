import assert from "node:assert/strict";
import test from "node:test";
import { readModel, restoreModel, restoredForecastEdits, saveModel, type SavedModel } from "../lib/client/model-storage";
import type { DcfModel } from "../lib/dcf-engine";
const fresh = { valuationDate: "2026-10-15", shares: 100, cash: 10, beta: 1, exitMultiple: 20, forecastDrivers: Array.from({ length: 6 }, (_, i) => ({ periodEnd: `${2026 + i}-12-31`, source: "New source", revenueGrowth: 10, ebitMargin: 20 })) } as DcfModel;

test("refresh retains only edited assumptions and manual exit overrides by ticker", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
  const saved: SavedModel = { model: { ...fresh, beta: 1.4, shares: 50, exitMultiple: -25, forecastDrivers: fresh.forecastDrivers.map((p, i) => ({ ...p, revenueGrowth: i === 1 ? 35 : 5 })) }, manualExitMultiple: true, editedFields: ["beta", "exitMultiple"], editedForecastFields: { "1": ["revenueGrowth"] } };
  saveModel("AAPL", saved, storage);
  const restored = restoreModel(fresh, readModel("AAPL", storage));
  assert.equal(restored.beta, 1.4);
  assert.equal(restored.exitMultiple, -25);
  assert.equal(restored.shares, 100);
  assert.equal(restored.forecastDrivers[1].revenueGrowth, 35);
  assert.equal(restored.forecastDrivers[0].revenueGrowth, 10);
  assert.equal(readModel("GOOG", storage), null);
  assert.equal(readModel("AAPL", storage)?.manualExitMultiple, true);
});
test("a calendar roll does not copy an old fiscal year's edited driver into the wrong year", () => {
  const saved: SavedModel = { model: fresh, manualExitMultiple: false, editedFields: [], editedForecastFields: { "1": ["revenueGrowth"] } };
  const rolled = { ...fresh, forecastDrivers: fresh.forecastDrivers.map((p) => ({ ...p, periodEnd: `${Number(p.periodEnd.slice(0, 4)) + 1}-12-31`, revenueGrowth: 5 })) };
  assert.equal(restoreModel(rolled, saved).forecastDrivers[0].revenueGrowth, 10);
  assert.equal(restoreModel(rolled, saved).forecastDrivers[1].revenueGrowth, 5);
});

test("remapped forecast edit metadata survives a second reload after rollover", () => {
 const saved: SavedModel = {model: {...fresh, forecastDrivers:fresh.forecastDrivers.map((p,i)=>({...p,revenueGrowth:i===1?35:5}))},manualExitMultiple:false,editedFields:[],editedForecastFields:{"1":["revenueGrowth"]}};
 const rolled = {...fresh,forecastDrivers:fresh.forecastDrivers.map(p=>({...p,periodEnd:`${Number(p.periodEnd.slice(0,4))+1}-12-31`,revenueGrowth:5}))};
 const model=restoreModel(rolled,saved);
 const edits=restoredForecastEdits(rolled,saved);
 assert.deepEqual(edits,{"0":["revenueGrowth"]});
 assert.equal(restoreModel(rolled,{...saved,model,editedForecastFields:edits}).forecastDrivers[0].revenueGrowth,35);
});

test("implausible stale WACC inputs are rejected instead of silently restoring a broken valuation", () => {
  const map = new Map<string, string>();
  const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); }, removeItem: (key: string) => { map.delete(key); } };
  saveModel("ADSK", { model: { ...fresh, riskFreeRate: 400 }, manualExitMultiple: false, editedFields: ["riskFreeRate"], editedForecastFields: {} }, storage);
  assert.equal(readModel("ADSK", storage), null);
});
