/**
 * Google Calendar wrapper: read source events, and upsert/reconcile travel blocks.
 *
 * Travel blocks are tagged via extendedProperties.private so re-running the sync
 * updates them in place (never duplicates) and lets us clean up stale ones:
 *   managedBy = "drive-time-sync"   — identifies blocks this tool owns
 *   sourceId  = <source event id>   — links a block to its source event
 *   hash      = <content hash>      — lets us skip unchanged blocks
 */

const { google } = require("googleapis");

const MANAGED_TAG = "drive-time-sync";

function makeClient(auth) {
  return google.calendar({ version: "v3", auth });
}

/** Source-calendar events in [timeMin, timeMax] (Date objects), expanded + sorted. */
async function listSourceEvents(cal, calendarId, timeMin, timeMax) {
  const res = await cal.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });
  return res.data.items || [];
}

/** Travel blocks this tool owns within [timeMin, timeMax]. */
async function listManagedBlocks(cal, calendarId, timeMin, timeMax) {
  const res = await cal.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    privateExtendedProperty: `managedBy=${MANAGED_TAG}`,
    maxResults: 2500,
  });
  return res.data.items || [];
}

/**
 * Insert or update a travel block for one source event.
 * `block` = { sourceId, hash, summary, location, start: Date, end: Date }.
 * Returns "created" | "updated" | "unchanged".
 */
async function upsertTravelBlock(cal, calendarId, block) {
  const resource = {
    summary: block.summary,
    location: block.location,
    start: { dateTime: block.start.toISOString() },
    end: { dateTime: block.end.toISOString() },
    transparency: "opaque",
    reminders: { useDefault: false },
    extendedProperties: {
      private: { managedBy: MANAGED_TAG, sourceId: block.sourceId, hash: block.hash },
    },
  };

  const existing = await cal.events.list({
    calendarId,
    privateExtendedProperty: [`managedBy=${MANAGED_TAG}`, `sourceId=${block.sourceId}`],
    singleEvents: true,
    maxResults: 5,
  });
  const match = (existing.data.items || [])[0];

  if (match) {
    if (match.extendedProperties && match.extendedProperties.private && match.extendedProperties.private.hash === block.hash) {
      return "unchanged";
    }
    await cal.events.update({ calendarId, eventId: match.id, requestBody: resource });
    return "updated";
  }

  await cal.events.insert({ calendarId, requestBody: resource });
  return "created";
}

async function deleteBlock(cal, calendarId, eventId) {
  await cal.events.delete({ calendarId, eventId });
}

module.exports = { makeClient, listSourceEvents, listManagedBlocks, upsertTravelBlock, deleteBlock, MANAGED_TAG };
