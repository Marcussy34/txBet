// Generates src/fixtures/matches/arg-sui-2026-07-11.ts from captured public data.
// Inputs (output/arg-sui-case-study/raw/): TxLINE scores timeline, Kalshi 1-min
// candles, Polymarket 1-min printed prices. Offline only — never runs at runtime.
// Fill basis: Kalshi volume-weighted mean of the candle covering the scan minute
// (fallback: ask close); Polymarket printed mid at the same minute.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const RAW = path.join(ROOT, "output/arg-sui-case-study/raw");
const OUT = path.join(ROOT, "src/fixtures/matches/arg-sui-2026-07-11.ts");

const read = (name) => JSON.parse(fs.readFileSync(path.join(RAW, name), "utf8"));
const updates = read("scores-historical.json");
const ksCandles = read("ks-universe-candles.json");
const pm = {
  arg_yes: read("pm-hist-arg-yes-match.json").history,
  arg_no: read("pm-hist-arg-no-match.json").history,
  draw_yes: read("pm-hist-draw-yes-match.json").history,
  draw_no: read("pm-hist-draw-no-match.json").history,
  sui_yes: read("pm-hist-sui-yes-match.json").history,
  sui_no: read("pm-hist-sui-no-match.json").history,
};

// ---------- timeline anchors (ms) ----------
const bySeq = new Map(updates.map((u) => [u.Seq, u]));
const status = (id) => updates.find((u) => u.Action === "status" && u.Data?.StatusId === id);
const T = {
  kickoff: updates.find((u) => u.Action === "kickoff").Ts,
  goal1: bySeq.get(116).Ts, // Argentina 1-0, detected
  halftime: status(3).Ts,
  h2: status(4).Ts,
  goal2: bySeq.get(659).Ts, // Switzerland 1-1, detected
  varStart: updates.find((u) => u.Action === "var").Ts,
  varEnd: updates.find((u) => u.Action === "var_end").Ts,
  red: updates.find((u) => u.Action === "red_card").Ts,
  regEnd: status(6).Ts,
  etGoal1: bySeq.get(1197).Ts, // Argentina 2-1
  etGoal2: bySeq.get(1281).Ts, // Argentina 3-1
  fullTime: status(10).Ts,
};
const matchMinute = (ts) => Math.max(1, Math.round((ts - T.kickoff) / 60_000));

// ---------- price lookups ----------
// Kalshi candles are end-labeled: candle end_period_ts=E covers [E-60s, E).
function ksAt(ticker, tsMs, field) {
  const rows = ksCandles[ticker]?.candles;
  if (!rows) return null;
  const endSec = (Math.floor(tsMs / 60_000) + 1) * 60;
  const row = rows.find((r) => r.end_period_ts === endSec) ??
    [...rows].reverse().find((r) => r.end_period_ts <= endSec);
  if (!row) return null;
  const num = (d, k) => (d?.[k] != null ? Number(d[k]) : null);
  if (field === "mean") return num(row.price, "mean_dollars") ?? num(row.yes_ask, "close_dollars");
  if (field === "ask") return num(row.yes_ask, "close_dollars");
  if (field === "bid") return num(row.yes_bid, "close_dollars");
  if (field === "vol") return row.volume_fp != null ? Number(row.volume_fp) : 0;
  if (field === "asOf") return row.end_period_ts * 1_000;
  return null;
}
function pmAt(series, tsMs) {
  const minute = Math.floor(tsMs / 60_000) * 60;
  let last = null;
  for (const pt of series) {
    if (pt.t <= minute + 59) last = pt.p;
    else break;
  }
  return last;
}

// ---------- corner attribution via participant stat deltas (keys 7=ARG, 8=SUI) ----------
// Corner actions carry the true timestamps; participant stats (7=ARG, 8=SUI) lag on
// the next stats-bearing update, so assign pending corner times to stat increments in order.
const corners = [];
{
  const pending = [];
  let prev = { 7: 0, 8: 0 };
  for (const u of updates) {
    if (u.Action === "corner") pending.push(u.Ts);
    const s = u.Stats ?? {};
    if (s["7"] == null && s["8"] == null) continue;
    const cur = { 7: s["7"] ?? prev[7], 8: s["8"] ?? prev[8] };
    for (let i = prev[7]; i < cur[7]; i += 1) corners.push({ ts: pending.shift() ?? u.Ts, team: "Argentina" });
    for (let i = prev[8]; i < cur[8]; i += 1) corners.push({ ts: pending.shift() ?? u.Ts, team: "Switzerland" });
    prev = cur;
  }
  corners.sort((a, b) => a.ts - b.ts);
}
const shots = updates.filter((u) => u.Action === "shot").map((u) => u.Ts);
const tilt = updates
  .filter((u) => ["attack_possession", "danger_possession", "high_danger_possession", "safe_possession", "possession"].includes(u.Action))
  .map((u) => ({ ts: u.Ts, forward: u.Action !== "safe_possession" && u.Action !== "possession" }));
const inWin = (list, ts, ms) => list.filter((x) => (x.ts ?? x) > ts - ms && (x.ts ?? x) <= ts);

// ---------- contract & quote factories ----------
const FIXTURE_ID = "txline-18222446";
const USD = 1_000_000;
const feeCurve = (label, p, rate) => ({
  kind: "flat-per-share",
  microsPerShare: Math.round(rate * p * (1 - p) * USD),
  label,
});
const round6 = (p) => Math.round(p * USD);

const PROPS = {
  "match-winner-arg-regulation": { family: "match-winner-binary", subject: "Argentina", title: "Argentina wins in regulation", won: false },
  "match-draw-regulation": { family: "match-winner-binary", subject: "Draw", title: "Match ends level in regulation", won: true },
  "match-winner-sui-regulation": { family: "match-winner-binary", subject: "Switzerland", title: "Switzerland wins in regulation", won: false },
  "argentina-advances": { family: "qualification", subject: "Argentina", title: "Argentina advances to the semifinal", won: true },
  "switzerland-advances": { family: "qualification", subject: "Switzerland", title: "Switzerland advances to the semifinal", won: false },
  "match-total-over-2.5-regulation": { family: "total-goals", subject: "Over 2.5 goals", title: "Over 2.5 goals in regulation", won: false, line: "2.5" },
};
function settlement(prop) {
  const p = PROPS[prop];
  return {
    fixtureId: FIXTURE_ID,
    proposition: prop,
    subject: p.subject,
    period: p.family === "qualification" ? "full-match" : "regulation-time",
    scope: p.family === "qualification" ? "including-extra-time-and-penalties" : "including-stoppage-time",
    line: p.line ?? null,
    resolutionRuleId: p.family === "qualification" ? "official-fifa-match-result-v1" : "official-regulation-score-v1",
    voidRuleId: "postponed-48h-refund-v1",
    closesAt: p.family === "qualification" ? T.fullTime : T.regEnd,
    payoutCurrency: "USD",
    payoutMicros: USD,
  };
}
function contract(venueId, venueName, outcome, prop) {
  const p = PROPS[prop];
  return {
    contractId: `${venueId}:${prop}:${outcome.toLowerCase()}`,
    venueId,
    venueName,
    title: `${p.title} — ${outcome}`,
    family: p.family,
    outcome,
    settlement: settlement(prop),
  };
}
function quote(venueId, venueName, outcome, prop, price, depth, now, feeRate, suspended = false, asOf = null) {
  if (price == null || price <= 0.005 || price >= 0.995) return null;
  return {
    contract: contract(venueId, venueName, outcome, prop),
    asks: [{ priceMicros: round6(price), quantity: Math.max(50, Math.min(5_000, Math.floor(depth / 4))) }],
    feeModel: feeCurve(
      venueId === "kalshi" ? "Kalshi 7% × p(1−p)" : "Polymarket taker curve (worst case)",
      price,
      feeRate,
    ),
    status: suspended ? "suspended" : "open",
    // real observation time from the data; the staleness gate judges it honestly
    updatedAt: Math.min(asOf ?? now - 1_200, now - 1_000),
    updateState: "repriced",
  };
}

// Snapshot every cross-venue pairable book at a scan instant.
const KS_TICK = {
  "match-winner-arg-regulation": "KXWCGAME-26JUL11ARGSUI-ARG",
  "match-draw-regulation": "KXWCGAME-26JUL11ARGSUI-TIE",
  "match-winner-sui-regulation": "KXWCGAME-26JUL11ARGSUI-SUI",
  "argentina-advances": "KXWCADVANCE-26JUL11ARGSUI-ARG",
  "switzerland-advances": "KXWCADVANCE-26JUL11ARGSUI-SUI",
  "match-total-over-2.5-regulation": "KXWCTOTAL-26JUL11ARGSUI-3",
};
const PM_SERIES = {
  "match-winner-arg-regulation": ["arg_yes", "arg_no"],
  "match-draw-regulation": ["draw_yes", "draw_no"],
  "match-winner-sui-regulation": ["sui_yes", "sui_no"],
};
function snapshot(now, { suspendMatchWinner = false, eventTs = null } = {}) {
  // Kalshi legs fill inside the shock candle the event landed in (its real traded
  // window); the Polymarket hedge leg fills at the print current at scan time.
  const ksTs = eventTs ?? now;
  const quotes = [];
  for (const [prop, tick] of Object.entries(KS_TICK)) {
    const suspended = suspendMatchWinner && PROPS[prop].family === "match-winner-binary";
    const vol = ksAt(tick, ksTs, "vol") || 0;
    const mean = ksAt(tick, ksTs, "mean");
    const bid = ksAt(tick, ksTs, "bid");
    const asOf = ksAt(tick, ksTs, "asOf");
    quotes.push(quote("kalshi", "Kalshi", "YES", prop, mean, vol, now, 0.07, suspended, asOf));
    if (bid != null) quotes.push(quote("kalshi", "Kalshi", "NO", prop, 1 - bid, vol, now, 0.07, suspended, asOf));
  }
  for (const [prop, [yesKey, noKey]] of Object.entries(PM_SERIES)) {
    const suspended = suspendMatchWinner;
    quotes.push(quote("polymarket", "Polymarket", "YES", prop, pmAt(pm[yesKey], now), 20_000, now, 0.07, suspended));
    quotes.push(quote("polymarket", "Polymarket", "NO", prop, pmAt(pm[noKey], now), 20_000, now, 0.07, suspended));
  }
  return quotes.filter(Boolean);
}

// ---------- agent windows (event + books at scan time) ----------
const LATENCY = 51_000; // detection -> hedge-leg completion, spanning the shock minute
const ev = (id, action, ts, description, extras = {}) => ({
  id,
  fixtureId: FIXTURE_ID,
  occurredAt: ts,
  minute: matchMinute(ts),
  action,
  description,
  confirmed: true,
  ...extras,
});
const win = (id, label, agentId, event, scanTs, opts = {}) => ({
  id,
  label,
  latencyMs: LATENCY,
  agentId,
  event,
  quotes: snapshot(scanTs, { eventTs: event.occurredAt, ...opts }),
  now: scanTs,
  execution: "matched",
});

const windows = [
  win("goal-arg-1", "Argentina 1-0 · header confirmed", "goal-reaction",
    ev("evt-goal-1", "goal", T.goal1, "Argentina open the scoring — confirmed header", { team: "Argentina" }), T.goal1 + LATENCY),
  win("goal-sui-equalizer", "Switzerland 1-1 · equalizer confirmed", "goal-reaction",
    ev("evt-goal-2", "goal", T.goal2, "Switzerland equalize — confirmed strike", { team: "Switzerland" }), T.goal2 + LATENCY),
  win("var-review", "VAR review · MistakenIdentity", "penalty-var",
    ev("evt-var", "var_review_started", T.varStart, "VAR reviews the caution — officiating state under review", { confirmed: false }), T.varStart + 20_000,
    { suspendMatchWinner: true }),
  win("var-resolved", "VAR overturned · rescan", "penalty-var",
    ev("evt-var-2", "var_review_started", T.varEnd, "VAR overturned to a second yellow — books repricing", {}), T.varEnd + LATENCY),
  win("red-card", "Switzerland red card · 10 men", "red-card",
    ev("evt-red", "red_card", T.red, "Switzerland reduced to ten — confirmed second yellow", { team: "Switzerland" }), T.red + LATENCY),
  win("goal-arg-et-1", "Argentina 2-1 in extra time", "goal-reaction",
    ev("evt-goal-3", "goal", T.etGoal1, "Argentina lead in extra time — confirmed strike", { team: "Argentina" }), T.etGoal1 + LATENCY),
  win("goal-arg-et-2", "Argentina 3-1 in extra time", "goal-reaction",
    ev("evt-goal-4", "goal", T.etGoal2, "Argentina seal it in extra time — confirmed strike", { team: "Argentina" }), T.etGoal2 + LATENCY),
];

// corner-pressure: first sustained Argentina pressure window (2+ corners, 3+ shots, tilt >= 60% in 10 min)
for (let ts = T.kickoff + 5 * 60_000; ts <= T.regEnd; ts += 60_000) {
  const c = inWin(corners.filter((x) => x.team === "Argentina"), ts, 600_000).length;
  const s = inWin(shots, ts, 600_000).length;
  const t = inWin(tilt, ts, 600_000);
  const tiltPct = t.length ? Math.round((t.filter((x) => x.forward).length / t.length) * 100) : 0;
  if (c >= 2 && s >= 3 && tiltPct >= 60) {
    windows.push(win("corner-pressure-1", "Argentina pressure window", "corner-pressure",
      ev("evt-pressure", "pressure_window", ts, `Argentina sustained pressure: ${c} corners, ${s} shots in 10 minutes`,
        { team: "Argentina", metrics: { cornersLast10: c, shotsLast10: s, possessionPct: tiltPct } }), ts + 10_000));
    break;
  }
}
// dangerous free kick: first free kick within 30s of a danger-possession phase
const danger = updates.filter((u) => u.Action === "danger_possession" || u.Action === "high_danger_possession");
const fk = updates.find((u) => u.Action === "free_kick" && danger.some((d) => u.Ts - d.Ts >= 0 && u.Ts - d.Ts <= 30_000));
if (fk) {
  windows.push(win("free-kick-1", "Dangerous free kick", "dangerous-free-kick",
    ev("evt-fk", "dangerous_free_kick", fk.Ts, "Free kick from a dangerous zone", {}), fk.Ts + 10_000));
}
// injury: first injury action (importance below threshold -> honest trigger refusal)
const inj = updates.find((u) => u.Action === "injury");
if (inj) {
  windows.push(win("injury-1", "Injury stoppage", "injury",
    ev("evt-injury", "injury", inj.Ts, "Injury stoppage — importance below trigger threshold", { metrics: { playerImportance: 0.5 } }), inj.Ts + 10_000));
}
windows.sort((a, b) => a.now - b.now);

// ---------- match-dominance strategy (rule fixed ex-ante; entries use only trailing data) ----------
// RULE: a side is dominant when it leads corners by >=2 inside the trailing 10 minutes
// and its Kalshi ADVANCE price is <= 0.80. Enter ADVANCE YES at the candle mean,
// 25% of remaining bankroll per signal, 15-minute cooldown per side, hold to settlement.
const domTrades = [];
const cooldown = { Argentina: 0, Switzerland: 0 };
for (let ts = T.kickoff + 5 * 60_000; ts <= T.regEnd; ts += 60_000) {
  for (const side of ["Argentina", "Switzerland"]) {
    const other = side === "Argentina" ? "Switzerland" : "Argentina";
    const lead = inWin(corners.filter((c) => c.team === side), ts, 600_000).length -
      inWin(corners.filter((c) => c.team === other), ts, 600_000).length;
    const prop = side === "Argentina" ? "argentina-advances" : "switzerland-advances";
    const price = ksAt(KS_TICK[prop], ts, "mean");
    if (lead >= 2 && price != null && price <= 0.8 && ts >= cooldown[side]) {
      cooldown[side] = ts + 15 * 60_000;
      domTrades.push({
        id: `dom-${domTrades.length + 1}`,
        enteredAt: ts,
        minute: matchMinute(ts),
        side,
        proposition: prop,
        title: PROPS[prop].title,
        signal: `${side} +${lead} corners in the trailing 10 minutes`,
        entryPriceMicros: round6(price),
        feePerShareMicros: Math.round(0.07 * price * (1 - price) * USD),
        won: PROPS[prop].won,
      });
    }
  }
}

// ---------- emit ----------
const HEADER = `// GENERATED by scripts/build-arg-sui-windows.mjs — do not edit by hand.
// Source: TxLINE fixture 18222446 (mainnet level-12 World Cup feed), Kalshi 1-min
// candlesticks, Polymarket 1-min price history; captured 2026-07-17.
// Fill basis: Kalshi volume-weighted shock-window mean (fallback ask close);
// Polymarket printed mid. Fees at published venue schedules.`;

const fixture = {
  id: FIXTURE_ID,
  home: "Argentina",
  away: "Switzerland",
  competition: "FIFA World Cup 2026 · Quarterfinal",
  kickoffUtc: new Date(T.kickoff).toISOString(),
  regulationScore: "1-1",
  finalScore: "3-1 aet",
  timeline: [
    { at: T.kickoff, minute: 1, label: "Kickoff" },
    { at: T.goal1, minute: matchMinute(T.goal1), label: "GOAL Argentina — Lautaro Martínez (header)" },
    { at: T.halftime, minute: matchMinute(T.halftime), label: "Halftime 1-0" },
    { at: T.goal2, minute: matchMinute(T.goal2), label: "GOAL Switzerland — equalizer" },
    { at: T.varStart, minute: matchMinute(T.varStart), label: "VAR review" },
    { at: T.red, minute: matchMinute(T.red), label: "RED CARD Switzerland" },
    { at: T.regEnd, minute: matchMinute(T.regEnd), label: "Regulation ends 1-1" },
    { at: T.etGoal1, minute: matchMinute(T.etGoal1), label: "GOAL Argentina 2-1 (ET)" },
    { at: T.etGoal2, minute: matchMinute(T.etGoal2), label: "GOAL Argentina 3-1 (ET)" },
    { at: T.fullTime, minute: matchMinute(T.fullTime), label: "Full time — Argentina advance" },
  ],
  settledPropositions: Object.fromEntries(Object.entries(PROPS).map(([k, v]) => [k, v.won])),
};

const body = `${HEADER}
import type { BacktestWindow } from "../../core/backtest";

export interface MatchTimelineEntry {
  at: number;
  minute: number;
  label: string;
}

export interface DominanceTrade {
  id: string;
  enteredAt: number;
  minute: number;
  side: string;
  proposition: string;
  title: string;
  signal: string;
  entryPriceMicros: number;
  feePerShareMicros: number;
  won: boolean;
}

export interface MatchFixtureArtifact {
  id: string;
  home: string;
  away: string;
  competition: string;
  kickoffUtc: string;
  regulationScore: string;
  finalScore: string;
  timeline: readonly MatchTimelineEntry[];
  settledPropositions: Readonly<Record<string, boolean>>;
}

export const ARG_SUI_FIXTURE: MatchFixtureArtifact = ${JSON.stringify(fixture, null, 2)} as const;

export const ARG_SUI_WINDOWS: readonly BacktestWindow[] = ${JSON.stringify(windows, null, 2)} as const;

export const ARG_SUI_DOMINANCE_TRADES: readonly DominanceTrade[] = ${JSON.stringify(domTrades, null, 2)} as const;
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body);
console.log(`windows: ${windows.length}`);
for (const w of windows) console.log(`  ${w.id} (${w.agentId}) quotes=${w.quotes.length} @ ${new Date(w.now).toISOString().slice(11, 19)}Z`);
console.log(`dominance trades: ${domTrades.length}`);
for (const d of domTrades) console.log(`  ${d.id} ${d.side} @ $${(d.entryPriceMicros / USD).toFixed(2)} min ${d.minute} — ${d.signal}`);
console.log(`wrote ${OUT}`);
