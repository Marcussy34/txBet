import { z } from "zod";
import type { MatchAction, TxLineEvent } from "../../core/types";

const rawEventSchema = z.object({}).catchall(z.unknown());

function first(record: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null) return record[name];
  }
  return undefined;
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true" || value === "confirmed") return true;
  if (value === 0 || value === "0" || value === "false" || value === "provisional") return false;
  return null;
}

function actionKey(value: unknown): string {
  return (text(value) ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const actions: Readonly<Record<string, MatchAction>> = {
  kickoff: "kickoff",
  kick_off: "kickoff",
  red_card: "red_card",
  player_sent_off: "red_card",
  injury: "injury",
  player_injured: "injury",
  substitution: "key_player_substitution",
  key_player_substitution: "key_player_substitution",
  penalty: "penalty_awarded",
  penalty_awarded: "penalty_awarded",
  var: "var_review_started",
  var_review: "var_review_started",
  var_review_started: "var_review_started",
  penalty_overturned: "penalty_overturned",
  penalty_cancelled: "penalty_overturned",
  penalty_scored: "penalty_scored",
  penalty_missed: "penalty_missed",
  goal: "goal",
  dangerous_free_kick: "dangerous_free_kick",
  finished: "full_time",
  full_time: "full_time",
};

function minuteFrom(value: unknown): number {
  const numeric = numberValue(value);
  if (numeric !== null) return Math.max(0, Math.floor(numeric));
  const clock = text(value);
  const match = clock?.match(/^(\d{1,3}):/);
  return match ? Number(match[1]) : 0;
}

export function normalizeTxLineEvent(payload: unknown, receivedAt = Date.now()): TxLineEvent | null {
  const parsed = rawEventSchema.safeParse(payload);
  if (!parsed.success) return null;
  const row = parsed.data;
  const fixtureId = text(first(row, ["FixtureId", "fixtureId", "fixture_id"]));
  const rawAction = first(row, ["Action", "action", "EventType", "eventType", "Description"]);
  const action = actions[actionKey(rawAction)];
  if (!fixtureId || !action) return null;

  const occurredAt = numberValue(first(row, ["Ts", "ts", "Timestamp", "timestamp"])) ?? receivedAt;
  const team = text(first(row, [
    "IncidentParticipant",
    "incidentParticipant",
    "ParticipantName",
    "participantName",
    "TeamName",
    "teamName",
  ]));
  const confirmed = booleanValue(first(row, [
    "Confirmed",
    "confirmed",
    "IsConfirmed",
    "isConfirmed",
    "Status",
    "status",
  ])) ?? false;

  return {
    id: text(first(row, ["MessageId", "messageId", "Id", "id"])) ?? `${fixtureId}:${occurredAt}:${action}`,
    fixtureId,
    occurredAt,
    minute: minuteFrom(first(row, ["Minute", "minute", "Clock", "clock", "GameTime"])),
    action,
    ...(team ? { team } : {}),
    description: text(first(row, ["Description", "description"])) ?? action.replaceAll("_", " "),
    confirmed,
  };
}
