#!/usr/bin/env node
/**
 * One-time Google OAuth consent flow.
 *
 * Usage:
 *   npm run auth
 *
 * Prerequisite: credentials/google-oauth.json (Desktop-app OAuth client).
 * Writes the resulting token to credentials/token.json.
 */

const { runConsentFlow } = require("./lib/auth");

runConsentFlow().catch((err) => {
  console.error("\nAuth failed:", err.message);
  process.exit(1);
});
