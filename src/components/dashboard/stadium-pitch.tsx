"use client";

import * as React from "react";

export type PitchMatchEvent = {
  minute: number | null;
  type:
    | "goal"
    | "penalty"
    | "yellow"
    | "red"
    | "var"
    | "corner"
    | "substitution";
  team: "home" | "away";
};

export type PitchTeamStats = {
  possessionPct: number | null;
};

export type MomentumPoint = { minute: number; home: number; away: number };

export type PitchLiveScore = {
  homeGoals: number | null;
  awayGoals: number | null;
  minute: number | null;
  isLive: boolean;
  phase: string;
  statusSoccerId: number | null;
  stats: { home: PitchTeamStats; away: PitchTeamStats } | null;
  momentum: MomentumPoint[] | null;
  events: PitchMatchEvent[];
};

type ScoreTeam = { name: string; logo: string | null; color: string | null };
type TeamSide = "home" | "away";
type MatchEvent =
  | "flow"
  | "attack"
  | "aggressive"
  | "possession"
  | "goal"
  | "foul";

type MatchAction = {
  mode: "idle" | "live" | "ended";
  event: MatchEvent;
  side: TeamSide;
  possessionPct: number;
  intensity: 0 | 1 | 2 | 3;
  isGoal: boolean;
  label: string;
  winner: TeamSide | "draw" | null;
};

type MomentumScene = {
  event: "flow" | "attack" | "aggressive" | "possession";
  side: TeamSide;
  intensity: 0 | 1 | 2;
};

const STAGE_W = 880;
const STAGE_H = 460;
const HOME_DEFAULT = "#2dd4bf";
const AWAY_DEFAULT = "#e5484d";
const RECENT_MINUTES = 3;
const FINISHED_PHASES = new Set([5, 10, 13]);

const EVENT_STATUS: Record<PitchMatchEvent["type"], string> = {
  goal: "GOAL",
  yellow: "YELLOW CARD",
  red: "RED CARD",
  corner: "CORNER",
  substitution: "SUBSTITUTION",
  penalty: "PENALTY",
  var: "VAR CHECK",
};

function isFinishedScore(score?: PitchLiveScore | null): boolean {
  return (
    !!score &&
    score.statusSoccerId != null &&
    FINISHED_PHASES.has(score.statusSoccerId)
  );
}

function sceneFromMomentum(hW: number, aW: number): MomentumScene {
  const side: TeamSide = hW >= aW ? "home" : "away";
  const totalW = hW + aW;
  if (totalW <= 0) return { event: "flow", side, intensity: 0 };
  const margin = Math.abs(hW - aW);
  if (margin >= 3) return { event: "aggressive", side, intensity: 2 };
  if (margin >= 1) return { event: "attack", side, intensity: 1 };
  return { event: "possession", side, intensity: 0 };
}

function latestWeights(score: PitchLiveScore | null): {
  hW: number;
  aW: number;
} {
  const momentum = score?.momentum ?? null;
  const last =
    momentum && momentum.length > 0 ? momentum[momentum.length - 1] : null;
  return { hW: last?.home ?? 0, aW: last?.away ?? 0 };
}

function momentumScene(score: PitchLiveScore | null): MomentumScene {
  const stats = score?.stats ?? null;
  if (!stats) {
    const { hW, aW } = latestWeights(score);
    return sceneFromMomentum(hW, aW);
  }

  const poss = stats.home?.possessionPct ?? 50;
  const side: TeamSide = poss >= 50 ? "home" : "away";
  const lean = Math.abs(poss - 50);
  if (lean >= 12) return { event: "attack", side, intensity: 1 };
  if (lean >= 5) return { event: "possession", side, intensity: 0 };
  return { event: "flow", side, intensity: 0 };
}

function deriveMatchAction(
  score: PitchLiveScore | null,
  notStarted: boolean,
): MatchAction {
  const momentum = score?.momentum ?? null;
  const events = score?.events ?? [];
  const minute = score?.minute ?? null;
  const isLive = score?.isLive ?? false;

  const last =
    momentum && momentum.length > 0 ? momentum[momentum.length - 1] : null;
  const hW = last?.home ?? 0;
  const aW = last?.away ?? 0;
  const totalW = hW + aW;

  const preMatch = notStarted && totalW === 0 && events.length === 0;
  const possessionPct =
    score?.stats?.home?.possessionPct != null
      ? score.stats.home.possessionPct
      : 50;

  const recent = (type: "goal" | "card") =>
    [...events]
      .reverse()
      .find((event) =>
        type === "goal"
          ? event.type === "goal"
          : event.type === "yellow" || event.type === "red",
      );
  const lastGoal = recent("goal");
  const lastCard = recent("card");
  const isRecent = (eventMinute: number | null | undefined) =>
    eventMinute != null &&
    minute != null &&
    minute - eventMinute <= RECENT_MINUTES;

  const goalRecent = !!lastGoal && isRecent(lastGoal.minute);
  const cardRecent = !!lastCard && isRecent(lastCard.minute);

  let side: TeamSide = hW >= aW ? "home" : "away";
  let event: MatchEvent;
  let label: string;

  if (preMatch) {
    return {
      mode: "idle",
      event: "flow",
      side,
      possessionPct,
      intensity: 0,
      isGoal: false,
      label: "Kick-off soon",
      winner: null,
    };
  }

  if (isFinishedScore(score)) {
    const homeGoals = score?.homeGoals ?? 0;
    const awayGoals = score?.awayGoals ?? 0;
    const winner: TeamSide | "draw" =
      homeGoals > awayGoals
        ? "home"
        : awayGoals > homeGoals
          ? "away"
          : "draw";
    return {
      mode: "ended",
      event: "flow",
      side: winner === "away" ? "away" : "home",
      possessionPct,
      intensity: 0,
      isGoal: false,
      label: score?.phase ?? "Full-time",
      winner,
    };
  }

  if (goalRecent && lastGoal) {
    side = lastGoal.team;
    event = "goal";
    label = "GOAL!";
  } else if (cardRecent && lastCard) {
    side = lastCard.team;
    event = "foul";
    label = lastCard.type === "red" ? "RED CARD" : "FOUL";
  } else if (!isLive) {
    event = "flow";
    label = score?.phase ?? "Full-time";
  } else if (totalW > 0) {
    const margin = Math.abs(hW - aW);
    if (margin >= 3) {
      event = "aggressive";
      label = "PUSHING HARD";
    } else if (margin >= 1) {
      event = "attack";
      label = "ATTACK";
    } else {
      event = "possession";
      label = "IN CONTROL";
    }
  } else {
    event = "flow";
    label = "BALL IN PLAY";
  }

  const intensity: 0 | 1 | 2 | 3 =
    event === "goal"
      ? 3
      : event === "aggressive"
        ? 2
        : event === "attack"
          ? 1
          : 0;

  return {
    mode: "live",
    event,
    side,
    possessionPct,
    intensity,
    isGoal: event === "goal",
    label,
    winner: null,
  };
}

function eventAccent(type: PitchMatchEvent["type"], teamColor: string): string {
  if (type === "yellow") return "#facc15";
  if (type === "red") return "#ef4444";
  if (type === "corner") return "#f8fafc";
  if (type === "substitution") return "#22c55e";
  if (type === "var") return "#94a3b8";
  return teamColor;
}

function abbr(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 3)
      .toUpperCase() || "TBD"
  );
}

function latestEvent(events: PitchMatchEvent[]): PitchMatchEvent | null {
  if (events.length === 0) return null;
  return (
    [...events].sort((a, b) => (a.minute ?? -1) - (b.minute ?? -1)).at(-1) ??
    null
  );
}

function cssAlpha(color: string, opacity: number): string {
  const hex = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(hex);
  const full = /^#([0-9a-f]{6})$/i.exec(hex);
  const value = short
    ? short[1]
        .split("")
        .map((character) => character + character)
        .join("")
    : full?.[1];
  if (!value) return color;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

// Reference SVG pitch markings are tilted by the parent rotateX.
function PitchLines() {
  const width = 1050;
  const height = 680;
  const stroke = "#ffffff";
  return (
    <svg
      className="pitch-lines"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <g fill="none" stroke={stroke} strokeWidth="4" opacity="0.9">
        <rect x="14" y="14" width="1022" height="652" />
        <line x1="525" y1="14" x2="525" y2="666" />
        <circle cx="525" cy="340" r="91" />
        <rect x="14" y="138" width="165" height="404" />
        <rect x="14" y="249" width="55" height="182" />
        <rect x="871" y="138" width="165" height="404" />
        <rect x="981" y="249" width="55" height="182" />
        <path d="M 179 267 A 91 91 0 0 1 179 413" />
        <path d="M 871 267 A 91 91 0 0 0 871 413" />
        <path d="M 24 14 A 10 10 0 0 1 14 24" />
        <path d="M 1026 14 A 10 10 0 0 0 1036 24" />
        <path d="M 24 666 A 10 10 0 0 0 14 656" />
        <path d="M 1026 666 A 10 10 0 0 1 1036 656" />
      </g>
      <circle cx="525" cy="340" r="5" fill={stroke} />
      <circle cx="120" cy="340" r="5" fill={stroke} />
      <circle cx="930" cy="340" r="5" fill={stroke} />
      <rect
        x="2"
        y="303"
        width="12"
        height="74"
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        opacity="0.75"
      />
      <rect
        x="1036"
        y="303"
        width="12"
        height="74"
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        opacity="0.75"
      />
    </svg>
  );
}

export function StadiumPitch({
  home,
  away,
  score,
  kickoffISO,
  notStarted,
}: {
  home: ScoreTeam;
  away: ScoreTeam;
  score: PitchLiveScore | null;
  kickoffISO: string | null;
  notStarted: boolean;
}) {
  const action = deriveMatchAction(score, notStarted);
  const idle = action.mode === "idle";
  const ended = action.mode === "ended";

  const homeColor = home.color || HOME_DEFAULT;
  const awayColor = away.color || AWAY_DEFAULT;
  const homeAbbr = abbr(home.name);
  const awayAbbr = abbr(away.name);
  const homeGoals = notStarted ? 0 : (score?.homeGoals ?? 0);
  const awayGoals = notStarted ? 0 : (score?.awayGoals ?? 0);
  const matchClock = score?.minute ?? null;
  const steady = momentumScene(score);
  const lastEvent = latestEvent(score?.events ?? []);
  const recentEvent =
    lastEvent &&
    !idle &&
    !ended &&
    (matchClock == null ||
      lastEvent.minute == null ||
      Math.abs(matchClock - lastEvent.minute) <= 3)
      ? lastEvent
      : null;

  let activeSide: TeamSide | null = null;
  let statusLabel = "BALL IN PLAY";
  let eventTone = "neutral";

  if (idle) {
    statusLabel = "KICK-OFF SOON";
  } else if (ended) {
    eventTone = "ended";
    if (action.winner === "draw") {
      statusLabel = "FULL TIME · DRAW";
    } else {
      activeSide = action.winner;
      statusLabel = `FULL TIME · ${
        action.winner === "home" ? homeAbbr : awayAbbr
      } WIN`;
    }
  } else if (recentEvent) {
    activeSide = recentEvent.team;
    eventTone = recentEvent.type;
    statusLabel = `${
      recentEvent.team === "home" ? homeAbbr : awayAbbr
    } · ${EVENT_STATUS[recentEvent.type]}`;
  } else if (steady.event !== "flow") {
    activeSide = steady.side;
    eventTone = "momentum";
    const sideAbbr = steady.side === "home" ? homeAbbr : awayAbbr;
    statusLabel =
      steady.event === "possession"
        ? `${sideAbbr} CONTROLLING`
        : steady.event === "attack"
          ? `${sideAbbr} ON THE ATTACK`
          : `${sideAbbr} PRESSING`;
  }

  const activeColor =
    recentEvent && activeSide
      ? eventAccent(
          recentEvent.type,
          activeSide === "home" ? homeColor : awayColor,
        )
      : activeSide === "home"
        ? homeColor
        : activeSide === "away"
          ? awayColor
          : "#ffffff";
  const chipClass = `st-chip chip-${activeSide ?? "neutral"}`;
  const rootCls = [
    "wcst-stadium",
    activeSide ? `tone-${activeSide}` : "tone-neutral",
    idle ? "mode-idle" : "mode-live",
    `event-${eventTone}`,
    recentEvent ? "event-live" : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Pre-match countdown ticks text only while the match is idle.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!idle) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [idle]);
  const kickMs = kickoffISO ? Date.parse(kickoffISO) : Number.NaN;
  const remainMs = Number.isFinite(kickMs) ? kickMs - now : null;
  let countdown: string | null = null;
  if (remainMs != null && remainMs > 0) {
    const sec = Math.floor(remainMs / 1000);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    countdown =
      d > 0
        ? `${d}d ${h}h ${m}m`
        : h > 0
          ? `${h}h ${m}m ${ss}s`
          : `${m}m ${ss}s`;
  }

  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    // ResizeObserver is unavailable in the Vitest/JSDOM environment.
    if (typeof ResizeObserver === "undefined") return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? STAGE_W;
      setScale(width / STAGE_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A plain style tag keeps the reference CSS without adding MUI to txBet.
  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${STAGE_W} / ${STAGE_H}`,
        borderRadius: "0.875rem",
        overflow: "hidden",
        marginBottom: "0.75rem",
      }}
    >
      <style>{STADIUM_CSS}</style>
      <div
        className="wcst-stage"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div
          className={rootCls}
          style={
            {
              "--teamA": homeColor,
              "--teamB": awayColor,
              "--active-color": activeColor,
              "--active-fill": cssAlpha(activeColor, 0.42),
              "--active-soft": cssAlpha(activeColor, 0.18),
              "--active-line": cssAlpha(activeColor, 0.72),
            } as React.CSSProperties
          }
        >
          <div className="sky" />
          <div className="floodlights">
            <span className="fl fl1" />
            <span className="fl fl2" />
            <span className="fl fl3" />
            <span className="fl fl4" />
          </div>

          <div className="bowl">
            <div className="stand stand-back" />
            <div className="stand stand-left" />
            <div className="stand stand-right" />
            <div
              className="tier-light tl-A"
              style={{ "--tc": homeColor } as React.CSSProperties}
            />
            <div
              className="tier-light tl-B"
              style={{ "--tc": awayColor } as React.CSSProperties}
            />
          </div>

          <div className="jumbo">
            {idle ? (
              <div className="jumbo-bug idle">
                <div className="idle-matchup">
                  <span className="jt">{homeAbbr}</span>
                  <span className="jvs">vs</span>
                  <span className="jt">{awayAbbr}</span>
                </div>
                <span className="jclock soon">
                  {countdown ? `in ${countdown}` : "SOON"}
                </span>
              </div>
            ) : ended ? (
              <div className="jumbo-bug scoreline">
                <span
                  className="jt"
                  style={
                    action.winner === "away" ? { opacity: 0.6 } : undefined
                  }
                >
                  {homeAbbr}
                </span>
                <span className="jnum">{homeGoals}</span>
                <span className="jclock mid ft">FT</span>
                <span className="jnum">{awayGoals}</span>
                <span
                  className="jt"
                  style={
                    action.winner === "home" ? { opacity: 0.6 } : undefined
                  }
                >
                  {awayAbbr}
                </span>
              </div>
            ) : (
              <div className="jumbo-bug scoreline">
                <span className="jt">{homeAbbr}</span>
                <span className="jnum">{homeGoals}</span>
                <span className="jclock mid">
                  <span className="jdot" />
                  {matchClock != null ? `${matchClock}'` : "LIVE"}
                </span>
                <span className="jnum">{awayGoals}</span>
                <span className="jt">{awayAbbr}</span>
              </div>
            )}
          </div>

          <div className="pitch-wrap">
            <div className="pitch">
              <div className="mow" />
              <div
                className={`activity-half activity-left ${
                  activeSide === "home"
                    ? "active"
                    : activeSide === "away"
                      ? "muted"
                      : "neutral"
                }`}
              />
              <div
                className={`activity-half activity-right ${
                  activeSide === "away"
                    ? "active"
                    : activeSide === "home"
                      ? "muted"
                      : "neutral"
                }`}
              />
              <PitchLines />
            </div>
          </div>

          <div className={chipClass}>
            <span className="st-dot" />
            {statusLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

const STADIUM_CSS = `
.wcst-stage { position: absolute; top: 0; left: 0; }
.wcst-stadium { position: relative; width: 880px; height: 460px; border-radius: 14px;
  overflow: hidden; isolation: isolate;
  font-family: var(--font-geist-sans), system-ui, sans-serif; user-select: none;
  background: #05070f; }
.wcst-stadium .sky { position: absolute; inset: 0; z-index: 0;
  background: radial-gradient(120% 90% at 50% 8%, #1a2747 0%, #0c1428 42%, #05070f 80%); }
.wcst-stadium .floodlights .fl { position: absolute; top: -6%; width: 38%; height: 60%; z-index: 1;
  filter: blur(22px); opacity: 0.42; pointer-events: none;
  background: radial-gradient(60% 80% at 50% 0%, rgba(190,215,255,0.55), transparent 70%); }
.wcst-stadium .fl1 { left: -8%; } .wcst-stadium .fl2 { left: 18%; }
.wcst-stadium .fl3 { right: 18%; } .wcst-stadium .fl4 { right: -8%; }
.wcst-stadium .bowl { position: absolute; inset: 0; z-index: 1; }
.wcst-stadium .stand { position: absolute;
  background: radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1.5px) #0d1626;
  background-size: 8px 8px; }
.wcst-stadium .stand-back { left: 8%; right: 8%; top: 12%; height: 30%;
  clip-path: polygon(14% 100%, 0 0, 100% 0, 86% 100%);
  box-shadow: 0 6px 0 rgba(255,255,255,0.06) inset; }
.wcst-stadium .stand-left { left: 0; top: 24%; width: 26%; height: 52%;
  clip-path: polygon(0 0, 100% 30%, 100% 78%, 0 100%); opacity: 0.92; }
.wcst-stadium .stand-right { right: 0; top: 24%; width: 26%; height: 52%;
  clip-path: polygon(0 30%, 100% 0, 100% 100%, 0 78%); opacity: 0.92; }
.wcst-stadium .tier-light { position: absolute; top: 22%; width: 30%; height: 30%; z-index: 1; opacity: 0;
  filter: blur(26px); pointer-events: none;
  background: radial-gradient(circle, var(--tc), transparent 70%); }
.wcst-stadium .tl-A { left: 2%; } .wcst-stadium .tl-B { right: 2%; }
.wcst-stadium.tone-home .tl-A { opacity: 0.48; }
.wcst-stadium.tone-away .tl-B { opacity: 0.52; }
.wcst-stadium .jumbo { position: absolute; left: 50%; top: 7%; transform: translateX(-50%); z-index: 4;
  min-width: 210px; padding: 7px 18px; border-radius: 8px; background: rgba(6,9,18,0.86);
  border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 8px 22px rgba(0,0,0,0.5), 0 0 0 4px rgba(0,0,0,0.25);
  display: flex; align-items: center; justify-content: center; white-space: nowrap; }
.wcst-stadium .jumbo-bug { display: flex; align-items: center; gap: 0; white-space: nowrap; }
.wcst-stadium .jumbo-bug.idle { flex-direction: column; gap: 5px; }
.wcst-stadium .idle-matchup { display: flex; align-items: center; justify-content: center; white-space: nowrap; }
.wcst-stadium .jumbo-bug.scoreline { gap: 8px; }
.wcst-stadium .jt { font-weight: 800; font-size: 20px; color: #fff; letter-spacing: 0.04em; margin: 0 7px; }
.wcst-stadium .jvs { font-weight: 700; font-size: 13px; color: rgba(255,255,255,0.5); letter-spacing: 0.12em; margin: 0 2px; }
.wcst-stadium .jnum { min-width: 23px; text-align: center; font-size: 26px; font-weight: 900; color: #fff; line-height: 1;
  font-variant-numeric: tabular-nums; }
.wcst-stadium .jclock { display: flex; align-items: center; gap: 5px; font-weight: 700; font-size: 15px;
  color: #ffd23d; background: rgba(255,210,61,0.12); padding: 1px 8px; border-radius: 4px; margin-left: 11px;
  font-variant-numeric: tabular-nums; }
.wcst-stadium .jclock.mid { margin: 0 2px; padding: 2px 8px; }
.wcst-stadium .jclock.soon { color: #cfd4e6; background: rgba(255,255,255,0.08); font-size: 13px; letter-spacing: 0.02em; margin-left: 0; }
.wcst-stadium .jclock.ft { color: #cfd4e6; background: rgba(255,255,255,0.1); font-size: 13px; letter-spacing: 0.1em; font-weight: 800; }
.wcst-stadium .jdot { width: 6px; height: 6px; border-radius: 50%; background: #ff3b4e; }
.wcst-stadium .pitch-wrap { position: absolute; left: 50%; top: 60%; transform: translate(-50%,-50%);
  perspective: 760px; width: 700px; height: 360px; z-index: 2; }
.wcst-stadium .pitch { position: absolute; inset: 0; transform: rotateX(58deg); transform-origin: center 60%;
  border-radius: 3px; overflow: hidden; box-shadow: 0 0 60px rgba(0,0,0,0.6);
  background: linear-gradient(180deg, #1f7a3f, #176233); }
.wcst-stadium .mow { position: absolute; inset: 0; z-index: 0;
  background: repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 8.33%, transparent 8.33% 16.66%); }
.wcst-stadium .activity-half { position: absolute; top: 0; bottom: 0; width: 50%; z-index: 1; pointer-events: none; }
.wcst-stadium .activity-left { left: 0; }
.wcst-stadium .activity-right { right: 0; }
.wcst-stadium .activity-half.neutral { background: rgba(255,255,255,0.015); }
.wcst-stadium .activity-half.muted { background: rgba(7,9,13,0.52); box-shadow: inset 0 0 42px rgba(0,0,0,0.34); }
.wcst-stadium .activity-half.active { background: linear-gradient(90deg, var(--active-fill), var(--active-soft));
  box-shadow: inset 0 0 0 2px var(--active-line), inset 0 0 48px var(--active-soft); }
.wcst-stadium .activity-right.active { background: linear-gradient(270deg, var(--active-fill), var(--active-soft)); }
.wcst-stadium .pitch-lines { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2; }
.wcst-stadium .st-chip { position: absolute; left: 50%; top: 52%; transform: translate(-50%,-50%); z-index: 5; display: flex; align-items: center;
  gap: 7px; font-weight: 700; font-size: 13px; letter-spacing: 0.12em; color: #fff; padding: 4px 12px; border-radius: 999px;
  background: rgba(6,9,18,0.72); border: 1px solid rgba(255,255,255,0.16); backdrop-filter: blur(4px); white-space: nowrap;
  box-shadow: 0 7px 18px rgba(0,0,0,0.34), 0 0 0 1px var(--active-soft); }
.wcst-stadium .st-chip.chip-home { left: 31%; }
.wcst-stadium .st-chip.chip-away { left: 69%; }
.wcst-stadium .st-chip.chip-neutral { left: 50%; }
.wcst-stadium .st-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--active-color); box-shadow: 0 0 12px var(--active-color); }
.wcst-stadium.event-yellow .st-chip { color: #fff; }
.wcst-stadium.event-yellow .st-dot { background: #facc15; box-shadow: 0 0 14px rgba(250,204,21,0.85); }
.wcst-stadium.event-red .st-dot { background: #ef4444; box-shadow: 0 0 14px rgba(239,68,68,0.85); }
.wcst-stadium.event-corner .st-dot { background: #f8fafc; box-shadow: 0 0 14px rgba(248,250,252,0.7); }
.wcst-stadium.event-substitution .st-dot { background: #22c55e; box-shadow: 0 0 14px rgba(34,197,94,0.75); }
.wcst-stadium.event-var .st-dot { background: #94a3b8; box-shadow: 0 0 14px rgba(148,163,184,0.75); }
.wcst-stadium.event-live .st-chip { animation: wcst-chip-pop 1.25s ease-in-out infinite; }
.wcst-stadium.event-live .activity-half.active { animation: wcst-half-pulse 1.25s ease-in-out infinite; }
@keyframes wcst-chip-pop {
  0%, 100% { transform: translate(-50%,-50%) scale(1); box-shadow: 0 7px 18px rgba(0,0,0,0.34), 0 0 0 1px var(--active-soft); }
  45% { transform: translate(-50%,-50%) scale(1.045); box-shadow: 0 9px 22px rgba(0,0,0,0.42), 0 0 0 5px rgba(255,255,255,0.08), 0 0 24px var(--active-soft); }
}
@keyframes wcst-half-pulse {
  0%, 100% { filter: saturate(1.05) brightness(1); }
  50% { filter: saturate(1.35) brightness(1.14); }
}
@media (prefers-reduced-motion: reduce) {
  .wcst-stadium.event-live .st-chip,
  .wcst-stadium.event-live .activity-half.active { animation: none; }
}
`;
