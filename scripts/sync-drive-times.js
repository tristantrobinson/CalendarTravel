#!/usr/bin/env node
/**
 * Sync drive-time travel blocks into a separate Google Calendar.
 *
 * Usage:
 *   npm run sync
 *
 * Reads upcoming events (with locations) from SOURCE_CALENDAR_ID, computes the
 * traffic-aware drive time to each, and upserts a "Drive to …" block in
 * TRAVEL_CALENDAR_ID that ends exactly when the event starts. Stale blocks whose
 * source event no longer qualifies are removed.
 */

require("dotenv").config();
const crypto = require("crypto");

const { getAuthorizedClient } = require("./lib/auth");
const { makeClient, listSourceEvents, listManagedBlocks, upsertTravelBlock, deleteBlock } = require("./lib/calendar");
const { driveDuration } = require("./lib/routes");

function num(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example).`);
  return v;
}

function normalizeAddress(s) {
  return (s || "").trim().toLowerCase();
}

async function main() {
  const homeAddress = requireEnv("HOME_ADDRESS");
  const travelCalendarId = requireEnv("TRAVEL_CALENDAR_ID");
  const apiKey = requireEnv("GOOGLE_MAPS_API_KEY");
  const sourceCalendarId = process.env.SOURCE_CALENDAR_ID || "primary";
  const lookaheadDays = num("LOOKAHEAD_DAYS", 7);
  const minDriveMinutes = num("MIN_DRIVE_MINUTES", 5);
  const originGapMinutes = num("ORIGIN_GAP_MINUTES", 180);

  const cal = makeClient(getAuthorizedClient());

  const now = new Date();
  const windowEnd = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

  const events = await listSourceEvents(cal, sourceCalendarId, now, windowEnd);
  // Timed events with a location, sorted by start (listSourceEvents already sorts).
  const located = events
    .filter((e) => e.status !== "cancelled" && e.start && e.start.dateTime && e.location && e.location.trim())
    .map((e) => ({
      id: e.id,
      summary: e.summary || e.location,
      location: e.location.trim(),
      start: new Date(e.start.dateTime),
      end: e.end && e.end.dateTime ? new Date(e.end.dateTime) : null,
    }));

  const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
  const touchedSourceIds = new Set();

  for (let i = 0; i < located.length; i++) {
    const ev = located[i];

    // Smart origin: chain from the immediately prior located event if it ends
    // within ORIGIN_GAP_MINUTES of this event's start; otherwise use home.
    const prev = located[i - 1];
    let origin = homeAddress;
    if (prev && prev.end) {
      const gapMin = (ev.start.getTime() - prev.end.getTime()) / 60000;
      if (gapMin >= 0 && gapMin <= originGapMinutes) origin = prev.location;
    }

    if (normalizeAddress(origin) === normalizeAddress(ev.location)) {
      counts.skipped++;
      continue;
    }

    let seconds;
    try {
      seconds = await driveDuration({ origin, destination: ev.location, arriveBy: ev.start, apiKey });
    } catch (err) {
      console.warn(`  ! route failed for "${ev.summary}": ${err.message}`);
      counts.skipped++;
      continue;
    }

    if (seconds == null || seconds < minDriveMinutes * 60) {
      counts.skipped++;
      continue;
    }

    const minutes = Math.round(seconds / 60);
    const start = new Date(ev.start.getTime() - seconds * 1000);
    const summary = `🚗 Drive to ${ev.summary} (${minutes} min)`;
    const hash = crypto
      .createHash("sha256")
      .update([ev.id, origin, ev.location, start.toISOString(), ev.start.toISOString(), summary].join("|"))
      .digest("hex");

    const result = await upsertTravelBlock(cal, travelCalendarId, {
      sourceId: ev.id,
      hash,
      summary,
      location: ev.location,
      start,
      end: ev.start,
    });
    counts[result]++;
    touchedSourceIds.add(ev.id);
  }

  // Reconcile: remove managed blocks whose source event no longer qualifies.
  // Look back as well as forward — blocks for events that already started/end are
  // omitted by timeMin=now, so stale drive blocks would otherwise never be cleaned up.
  let deleted = 0;
  const reconcileMin = new Date(now.getTime() - lookaheadDays * 24 * 60 * 60 * 1000);
  const managed = await listManagedBlocks(cal, travelCalendarId, reconcileMin, windowEnd);
  for (const block of managed) {
    const sourceId = block.extendedProperties && block.extendedProperties.private && block.extendedProperties.private.sourceId;
    if (!sourceId || !touchedSourceIds.has(sourceId)) {
      await deleteBlock(cal, travelCalendarId, block.id);
      deleted++;
    }
  }

  console.log(
    `Done: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} unchanged, ` +
      `${counts.skipped} skipped, ${deleted} removed.`
  );
}

main().catch((err) => {
  console.error("Sync failed:", err.message);
  process.exit(1);
});
