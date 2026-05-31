/**
 * Drive-time estimates via the Google Routes API (computeRoutes).
 *
 * The Routes API only honors `arrivalTime` for TRANSIT. For DRIVE we must pass
 * `departureTime` with TRAFFIC_AWARE routing. To size a block that *ends* at the
 * event start, we compute a baseline duration, then refine once using
 * departureTime = arriveBy − baseline (the real moment you'd leave).
 */

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

async function computeOnce({ origin, destination, departureTime, apiKey }) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration",
    },
    body: JSON.stringify({
      origin: { address: origin },
      destination: { address: destination },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      departureTime: departureTime.toISOString(),
      routeModifiers: { avoidTolls: true },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Routes API ${res.status}: ${text}`);
  }

  const data = await res.json();
  const route = data.routes && data.routes[0];
  if (!route || !route.duration) return null;
  // duration is like "1234s"
  return parseInt(route.duration.replace("s", ""), 10);
}

/**
 * Returns drive duration in seconds for arriving at `arriveBy` (a Date), or null
 * if no route is found. `origin`/`destination` are address strings.
 */
async function driveDuration({ origin, destination, arriveBy, apiKey }) {
  const baseline = await computeOnce({ origin, destination, departureTime: arriveBy, apiKey });
  if (baseline == null) return null;

  const departure = new Date(arriveBy.getTime() - baseline * 1000);
  // departureTime must not be in the past for traffic-aware routing.
  if (departure.getTime() <= Date.now()) return baseline;

  const refined = await computeOnce({ origin, destination, departureTime: departure, apiKey });
  return refined == null ? baseline : refined;
}

module.exports = { driveDuration };
