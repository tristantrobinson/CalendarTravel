/**
 * Google OAuth helpers shared by the auth script and the sync job.
 *
 * Credentials live under ./credentials (gitignored):
 *   credentials/google-oauth.json  — the Desktop-app OAuth client you downloaded
 *   credentials/token.json         — the refresh/access token (written by `npm run auth`)
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { google } = require("googleapis");

// calendar.events covers reading source events and writing travel-block events.
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

const CREDENTIALS_PATH = path.join(__dirname, "..", "..", "credentials", "google-oauth.json");
const TOKEN_PATH = path.join(__dirname, "..", "..", "credentials", "token.json");

// Loopback port for the consent redirect. Desktop OAuth clients accept any
// http://localhost:<port> redirect, so a fixed port keeps the flow predictable.
const REDIRECT_PORT = 4100;

function readClientConfig() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Missing OAuth client at ${CREDENTIALS_PATH}.\n` +
        "Download a Desktop-app OAuth client from Google Cloud and save it there."
    );
  }
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const cfg = raw.installed || raw.web;
  if (!cfg) {
    throw new Error("Unrecognized OAuth client file: expected an `installed` or `web` key.");
  }
  return cfg;
}

function newOAuthClient() {
  const cfg = readClientConfig();
  return new google.auth.OAuth2(cfg.client_id, cfg.client_secret, `http://localhost:${REDIRECT_PORT}`);
}

/** Returns an authorized OAuth2 client using the stored token. */
function getAuthorizedClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(`No stored token at ${TOKEN_PATH}. Run \`npm run auth\` first.`);
  }
  const client = newOAuthClient();
  client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")));
  // Persist refreshed tokens so the access token stays valid across runs.
  client.on("tokens", (tokens) => {
    const merged = { ...client.credentials, ...tokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
  });
  return client;
}

/** Runs the one-time browser consent flow and writes credentials/token.json. */
async function runConsentFlow() {
  const client = newOAuthClient();
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        const c = url.searchParams.get("code");
        const err = url.searchParams.get("error");
        if (err) {
          res.end(`Authorization failed: ${err}. You can close this tab.`);
          server.close();
          return reject(new Error(err));
        }
        if (!c) {
          res.statusCode = 400;
          res.end("Waiting for authorization code…");
          return;
        }
        res.end("Authorized! You can close this tab and return to the terminal.");
        server.close();
        resolve(c);
      } catch (e) {
        reject(e);
      }
    });
    server.on("error", reject);
    server.listen(REDIRECT_PORT, () => {
      console.log("\nOpen this URL in your browser to authorize:\n");
      console.log(authUrl + "\n");
    });
  });

  const { tokens } = await client.getToken(code);
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`\nSaved token to ${TOKEN_PATH}`);
}

module.exports = { SCOPES, getAuthorizedClient, runConsentFlow, TOKEN_PATH, CREDENTIALS_PATH };
