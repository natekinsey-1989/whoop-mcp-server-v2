import type { Express } from "express";
import { saveTokens } from "./token.js";
import type { TokenData } from "./types.js";

const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

const SCOPES = [
  "read:recovery",
  "read:cycles",
  "read:sleep",
  "read:workout",
  "read:profile",
  "read:body_measurement",
  "offline",  // required for refresh tokens
].join(" ");

export function registerAuthRoutes(app: Express): void {
  // Step 1: redirect to Whoop OAuth
  app.get("/auth", (_req, res) => {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const redirectUri = process.env.WHOOP_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      res.status(500).send("WHOOP_CLIENT_ID and WHOOP_REDIRECT_URI must be set");
      return;
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      state: Math.random().toString(36).slice(2),
    });

    res.redirect(`${WHOOP_AUTH_URL}?${params.toString()}`);
  });

  // Step 2: handle callback, exchange code for tokens
  app.get("/callback", async (req, res) => {
    const code = req.query.code as string | undefined;

    if (!code) {
      res.status(400).send("Missing authorization code");
      return;
    }

    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    const redirectUri = process.env.WHOOP_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      res.status(500).send("Missing OAuth environment variables");
      return;
    }

    try {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      });

      const tokenRes = await fetch(WHOOP_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        res.status(500).send(`Token exchange failed: ${text}`);
        return;
      }

      const json = await tokenRes.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      if (!json.refresh_token) {
        res.status(500).send(
          "No refresh token returned. Make sure the 'offline' scope is enabled in your Whoop developer app."
        );
        return;
      }

      const tokens: TokenData = {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: Date.now() + json.expires_in * 1000,
      };

      saveTokens(tokens);

      res.send(`
        <html><body style="font-family:monospace;padding:40px;background:#0a0a0a;color:#00ff88">
          <h2>✅ Whoop Authorization Successful</h2>
          <p>Tokens saved. The daily cron job will handle refreshes automatically.</p>
          <p>Add this to Railway environment variables:</p>
          <pre style="background:#111;padding:20px;border-radius:8px;overflow:auto">
WHOOP_REFRESH_TOKEN=${json.refresh_token}
          </pre>
          <p style="color:#aaa">You can close this tab. The server is now authorized.</p>
        </body></html>
      `);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).send(`Authorization error: ${msg}`);
    }
  });

  // Health / status
  app.get("/status", (_req, res) => {
    const hasRefresh = !!process.env.WHOOP_REFRESH_TOKEN;
    res.json({
      status: "ok",
      authorized: hasRefresh,
      message: hasRefresh
        ? "Authorized. Daily sync active."
        : "Not authorized. Visit /auth to connect Whoop.",
    });
  });
}
