import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { pool } from "../db";

const DEFAULT_PUBLIC_ORIGIN = "https://book.johnwillispiano.com";
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const AUTH_REQUEST_TTL_SECONDS = 10 * 60;
const AUTH_CODE_TTL_SECONDS = 5 * 60;
const REQUIRED_SCOPES = ["jwpbooks:read", "jwpbooks:write"] as const;
const ALLOWED_SCOPES = new Set([...REQUIRED_SCOPES, "offline_access"]);
const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const registrationAttempts = new Map<string, { count: number; resetAt: number }>();

export type McpAuth = {
  userId: string;
  scopes: Set<string>;
  clientId: string;
};

type OAuthClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function randomOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function getPublicOrigin(req: Request): string {
  const configured = process.env.MCP_PUBLIC_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" && url.pathname === "/" && !url.search && !url.hash) {
        return url.origin;
      }
    } catch {
      // Use the stable production URL, rather than reflecting a malformed host.
    }
  }

  if (process.env.NODE_ENV === "production") return DEFAULT_PUBLIC_ORIGIN;

  const host = req.get("host") ?? "";
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (
    host &&
    ((devDomain && host.toLowerCase() === devDomain.toLowerCase()) ||
      host === "localhost:3000" ||
      host === "127.0.0.1:3000")
  ) {
    return `${req.protocol}://${host}`;
  }
  return DEFAULT_PUBLIC_ORIGIN;
}

function setPrivateJsonHeaders(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function oauthError(res: Response, status: number, error: string, description: string) {
  setPrivateJsonHeaders(res);
  return res.status(status).json({ error, error_description: description });
}

function authUrl(origin: string, path: string): string {
  return `${origin}${path}`;
}

function protectedResourceMetadata(origin: string) {
  const resource = `${origin}/mcp`;
  return {
    resource,
    authorization_servers: [origin],
    scopes_supported: [...REQUIRED_SCOPES],
    bearer_methods_supported: ["header"],
  };
}

function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: authUrl(origin, "/oauth/authorize"),
    token_endpoint: authUrl(origin, "/oauth/token"),
    registration_endpoint: authUrl(origin, "/oauth/register"),
    revocation_endpoint: authUrl(origin, "/oauth/revoke"),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...REQUIRED_SCOPES, "offline_access"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

function validRedirectUri(uri: string): boolean {
  if (uri === CLAUDE_CALLBACK) return true;
  // Claude Code uses a loopback callback with a per-session port.
  try {
    const url = new URL(uri);
    const loopbackHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return (
      loopbackHost &&
      url.protocol === "http:" &&
      url.pathname === "/callback" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function validRequestedRedirect(uri: string, registered: string[]): boolean {
  if (!validRedirectUri(uri)) return false;
  if (uri === CLAUDE_CALLBACK) return registered.includes(CLAUDE_CALLBACK);

  try {
    const requested = new URL(uri);
    return registered.some((registeredUri) => {
      try {
        const allowed = new URL(registeredUri);
        return (
          requested.protocol === allowed.protocol &&
          requested.hostname === allowed.hostname &&
          requested.pathname === allowed.pathname &&
          !requested.search &&
          !requested.hash
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

async function getClient(clientId: string): Promise<OAuthClient | undefined> {
  const registeredResult = await pool.query(
    `SELECT client_id, client_name, redirect_uris
       FROM mcp_oauth_clients
      WHERE client_id = $1`,
    [clientId],
  );
  const registered = registeredResult.rows[0];
  if (registered) {
    return {
      clientId: registered.client_id,
      // DCR client_name is self-asserted. Do not use it as a trusted identity.
      clientName: "Claude",
      redirectUris: registered.redirect_uris,
    };
  }

  let clientUrl: URL;
  try {
    clientUrl = new URL(clientId);
  } catch {
    return undefined;
  }

  // Only fetch Claude's published client documents. This prevents arbitrary
  // client IDs from turning authorization into a server-side request proxy.
  if (
    clientUrl.protocol !== "https:" ||
    !["claude.ai", "claude.com"].includes(clientUrl.hostname.toLowerCase()) ||
    clientUrl.port ||
    clientUrl.username ||
    clientUrl.password ||
    clientUrl.search ||
    clientUrl.hash
  ) {
    return undefined;
  }

  try {
    const response = await fetch(clientUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(3500),
      headers: { Accept: "application/json" },
    });
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > 32_000) return undefined;
    const body = await response.text();
    if (Buffer.byteLength(body) > 32_000) return undefined;
    const metadata = JSON.parse(body) as Record<string, unknown>;
    if (
      (metadata.client_id !== undefined && metadata.client_id !== clientId) ||
      (metadata.token_endpoint_auth_method !== undefined &&
        metadata.token_endpoint_auth_method !== "none") ||
      (metadata.grant_types !== undefined &&
        (!Array.isArray(metadata.grant_types) || !metadata.grant_types.includes("authorization_code"))) ||
      (metadata.response_types !== undefined &&
        (!Array.isArray(metadata.response_types) || !metadata.response_types.includes("code"))) ||
      !Array.isArray(metadata.redirect_uris) ||
      metadata.redirect_uris.length > 10 ||
      !metadata.redirect_uris.every((uri) => typeof uri === "string" && validRedirectUri(uri))
    ) {
      return undefined;
    }
    return {
      clientId,
      // Use the trusted document host, not its self-asserted client_name.
      clientName: `Claude (${clientUrl.hostname})`,
      redirectUris: metadata.redirect_uris,
    };
  } catch {
    return undefined;
  }
}

function parseScopes(scopeValue: unknown): string[] | undefined {
  const requested = typeof scopeValue === "string" && scopeValue.trim()
    ? [...new Set(scopeValue.trim().split(/\s+/))]
    : [...REQUIRED_SCOPES];
  if (requested.some((scope) => !ALLOWED_SCOPES.has(scope))) return undefined;
  if (!REQUIRED_SCOPES.every((scope) => requested.includes(scope))) return undefined;
  return requested;
}

function renderLoginPage(requestId: string): string {
  const safeId = htmlEscape(requestId);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect JWP Books to Claude</title></head>
<body style="font:16px system-ui,sans-serif;max-width:440px;margin:10vh auto;padding:24px;color:#18212b">
<h1 style="font-size:26px">Connect JWP Books to Claude</h1>
<p>Sign in with your JWP Books owner passcode to continue. Your passcode is sent only to JWP Books, not to Claude.</p>
<form id="login-form">
<label for="passcode">Owner passcode</label>
<input id="passcode" type="password" autocomplete="current-password" required
 style="display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 16px">
<input id="request-id" type="hidden" value="${safeId}">
<button style="padding:11px 18px" type="submit">Sign in</button>
<p id="error" role="alert" style="color:#b42318"></p>
</form>
<script>
document.getElementById("login-form").addEventListener("submit", async function(event) {
  event.preventDefault();
  const error = document.getElementById("error");
  error.textContent = "";
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode: document.getElementById("passcode").value })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    error.textContent = data.message || "Could not sign in.";
    return;
  }
  location.replace("/oauth/authorize?request_id=" + encodeURIComponent(document.getElementById("request-id").value));
});
</script></body></html>`;
}

function renderConsentPage(requestId: string, clientName: string, redirectUri: string): string {
  const name = htmlEscape(clientName);
  const host = htmlEscape(new URL(redirectUri).host);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize Claude for JWP Books</title></head>
<body style="font:16px system-ui,sans-serif;max-width:520px;margin:10vh auto;padding:24px;color:#18212b">
<h1 style="font-size:26px">Allow ${name} to access JWP Books?</h1>
<p>This connection can read and create or edit your business records, including clients, pianos, appointments, inspections, service history, invoices, expenses, and calendar entries.</p>
<p><strong>It cannot delete records.</strong></p>
<p>After approval, Claude will return to <strong>${host}</strong>.</p>
<form method="post" action="/oauth/approve">
<input type="hidden" name="request_id" value="${htmlEscape(requestId)}">
<button type="submit" name="decision" value="approve" style="padding:11px 18px">Allow access</button>
<button type="submit" name="decision" value="deny" style="padding:11px 18px;margin-left:8px">Cancel</button>
</form></body></html>`;
}

async function handleAuthorize(req: Request, res: Response) {
  const origin = getPublicOrigin(req);
  const requestId = typeof req.query.request_id === "string" ? req.query.request_id : "";
  if (requestId) {
    const pendingResult = await pool.query(
      `SELECT id, client_name, redirect_uri, expires_at
         FROM mcp_oauth_pending
        WHERE id = $1 AND expires_at > now()`,
      [requestId],
    );
    const pending = pendingResult.rows[0];
    if (!pending) return res.status(400).send("This authorization request expired. Return to Claude and try again.");
    setPrivateJsonHeaders(res);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "DENY");
    if (!req.session?.authenticated || !req.session.userId) {
      return res.send(renderLoginPage(requestId));
    }
    return res.send(renderConsentPage(requestId, pending.client_name, pending.redirect_uri));
  }

  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : "";
  const redirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";
  const responseType = req.query.response_type;
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const codeChallenge = typeof req.query.code_challenge === "string" ? req.query.code_challenge : "";
  const challengeMethod = req.query.code_challenge_method;
  const resource = typeof req.query.resource === "string" ? req.query.resource : `${origin}/mcp`;
  const scopes = parseScopes(req.query.scope);

  if (
    responseType !== "code" ||
    !clientId ||
    clientId.length > 2048 ||
    !state ||
    state.length > 2048 ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge) ||
    challengeMethod !== "S256" ||
    resource !== `${origin}/mcp` ||
    !scopes
  ) {
    return res.status(400).send("Invalid OAuth authorization request.");
  }

  const client = await getClient(clientId);
  if (!client || !validRequestedRedirect(redirectUri, client.redirectUris)) {
    return res.status(400).send("The OAuth client or redirect URL is not approved.");
  }

  const id = randomUUID();
  await pool.query(`DELETE FROM mcp_oauth_pending WHERE expires_at <= now()`);
  await pool.query(`DELETE FROM mcp_oauth_codes WHERE expires_at <= now() OR consumed_at IS NOT NULL`);
  await pool.query(
    `INSERT INTO mcp_oauth_pending
       (id, client_id, client_name, redirect_uri, code_challenge, state, resource, scope, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + ($9 * interval '1 second'))`,
    [
      id,
      client.clientId,
      client.clientName,
      redirectUri,
      codeChallenge,
      state,
      resource,
      scopes.join(" "),
      AUTH_REQUEST_TTL_SECONDS,
    ],
  );

  setPrivateJsonHeaders(res);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "DENY");
  if (!req.session?.authenticated || !req.session.userId) {
    return res.send(renderLoginPage(id));
  }
  return res.send(renderConsentPage(id, client.clientName, redirectUri));
}

async function handleApprove(req: Request, res: Response) {
  if (!req.session?.authenticated || !req.session.userId) {
    return res.status(401).send("Sign in to JWP Books before approving access.");
  }

  const requestId = typeof req.body?.request_id === "string" ? req.body.request_id : "";
  const decision = req.body?.decision;
  const pendingResult = await pool.query(
    `SELECT * FROM mcp_oauth_pending WHERE id = $1 AND expires_at > now()`,
    [requestId],
  );
  const pending = pendingResult.rows[0];
  if (!pending) return res.status(400).send("This authorization request expired. Return to Claude and try again.");

  await pool.query(`DELETE FROM mcp_oauth_pending WHERE id = $1`, [requestId]);
  const callback = new URL(pending.redirect_uri);
  if (decision !== "approve") {
    callback.searchParams.set("error", "access_denied");
    callback.searchParams.set("error_description", "The JWP Books owner did not approve access.");
    callback.searchParams.set("state", pending.state);
    return res.redirect(303, callback.toString());
  }

  const code = randomOpaqueToken();
  await pool.query(
    `INSERT INTO mcp_oauth_codes
       (code_hash, client_id, redirect_uri, code_challenge, scope, user_id, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + ($8 * interval '1 second'))`,
    [
      sha256(code),
      pending.client_id,
      pending.redirect_uri,
      pending.code_challenge,
      pending.scope,
      req.session.userId,
      pending.resource,
      AUTH_CODE_TTL_SECONDS,
    ],
  );

  callback.searchParams.set("code", code);
  callback.searchParams.set("state", pending.state);
  callback.searchParams.set("iss", getPublicOrigin(req));
  return res.redirect(303, callback.toString());
}

async function handleRegister(req: Request, res: Response) {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const attempts = registrationAttempts.get(ip);
  if (attempts && now < attempts.resetAt && attempts.count >= 20) {
    return oauthError(res, 429, "rate_limited", "Too many client registrations. Try again later.");
  }
  if (!attempts || now >= attempts.resetAt) {
    registrationAttempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else {
    attempts.count += 1;
  }

  const metadata = req.body as Record<string, unknown> | undefined;
  const redirectUris = metadata?.redirect_uris;
  const clientName = typeof metadata?.client_name === "string"
    ? metadata.client_name.trim().slice(0, 120)
    : "Claude MCP client";

  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length < 1 ||
    redirectUris.length > 10 ||
    !redirectUris.every((uri) => typeof uri === "string" && validRedirectUri(uri)) ||
    (metadata?.grant_types !== undefined &&
      (!Array.isArray(metadata.grant_types) || !metadata.grant_types.includes("authorization_code"))) ||
    (metadata?.response_types !== undefined &&
      (!Array.isArray(metadata.response_types) || !metadata.response_types.includes("code"))) ||
    (metadata?.token_endpoint_auth_method !== undefined &&
      metadata.token_endpoint_auth_method !== "none")
  ) {
    return oauthError(res, 400, "invalid_client_metadata", "Only public authorization-code clients with approved Claude callback URLs are supported.");
  }

  const clientId = `jwpbooks-${randomUUID()}`;
  const safeRedirectUris = [...new Set(redirectUris as string[])];
  await pool.query(
    `INSERT INTO mcp_oauth_clients (client_id, client_name, redirect_uris)
     VALUES ($1, $2, $3::jsonb)`,
    [clientId, clientName || "Claude MCP client", JSON.stringify(safeRedirectUris)],
  );

  setPrivateJsonHeaders(res);
  return res.status(201).json({
    client_id: clientId,
    client_name: clientName || "Claude MCP client",
    redirect_uris: safeRedirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
}

function tokenResponse(
  accessToken: string,
  refreshToken: string | undefined,
  scopes: string,
  expiresIn = ACCESS_TOKEN_TTL_SECONDS,
) {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    scope: scopes,
  };
}

async function handleToken(req: Request, res: Response) {
  const grantType = req.body?.grant_type;
  const clientId = typeof req.body?.client_id === "string" ? req.body.client_id : "";
  const resource = typeof req.body?.resource === "string" ? req.body.resource : "";
  const origin = getPublicOrigin(req);

  if (!clientId) return oauthError(res, 400, "invalid_request", "client_id is required.");
  if (resource !== `${origin}/mcp`) {
    return oauthError(res, 400, "invalid_target", "The requested resource does not match this MCP server.");
  }

  if (grantType === "authorization_code") {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const redirectUri = typeof req.body?.redirect_uri === "string" ? req.body.redirect_uri : "";
    const verifier = typeof req.body?.code_verifier === "string" ? req.body.code_verifier : "";
    if (!code || !redirectUri || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      return oauthError(res, 400, "invalid_request", "A code, redirect_uri, and PKCE code_verifier are required.");
    }

    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await connection.query(
        `SELECT code_hash, client_id, redirect_uri, code_challenge, scope, user_id, resource
           FROM mcp_oauth_codes
          WHERE code_hash = $1 AND expires_at > now() AND consumed_at IS NULL
          FOR UPDATE`,
        [sha256(code)],
      );
      const authorization = result.rows[0];
      if (
        !authorization ||
        authorization.client_id !== clientId ||
        authorization.redirect_uri !== redirectUri ||
        authorization.resource !== resource ||
        !safeEqual(
          authorization.code_challenge,
          createHash("sha256").update(verifier).digest("base64url"),
        )
      ) {
        await connection.query("ROLLBACK");
        return oauthError(res, 400, "invalid_grant", "The authorization code is invalid or expired.");
      }

      await connection.query(
        `UPDATE mcp_oauth_codes SET consumed_at = now() WHERE code_hash = $1`,
        [authorization.code_hash],
      );
      const accessToken = randomOpaqueToken();
      const accessHash = sha256(accessToken);
      await connection.query(
        `INSERT INTO mcp_oauth_tokens
           (token_hash, token_type, user_id, client_id, resource, scope, expires_at)
         VALUES ($1, 'access', $2, $3, $4, $5, now() + ($6 * interval '1 second'))`,
        [
          accessHash,
          authorization.user_id,
          clientId,
          authorization.resource,
          authorization.scope,
          ACCESS_TOKEN_TTL_SECONDS,
        ],
      );

      let refreshToken: string | undefined;
      if (authorization.scope.split(/\s+/).includes("offline_access")) {
        refreshToken = randomOpaqueToken();
        await connection.query(
          `INSERT INTO mcp_oauth_tokens
             (token_hash, token_type, user_id, client_id, resource, scope, expires_at)
           VALUES ($1, 'refresh', $2, $3, $4, $5, now() + ($6 * interval '1 second'))`,
          [
            sha256(refreshToken),
            authorization.user_id,
            clientId,
            authorization.resource,
            authorization.scope,
            REFRESH_TOKEN_TTL_SECONDS,
          ],
        );
      }
      await connection.query("COMMIT");
      setPrivateJsonHeaders(res);
      return res.json(tokenResponse(accessToken, refreshToken, authorization.scope));
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  if (grantType === "refresh_token") {
    const refreshTokenValue = typeof req.body?.refresh_token === "string" ? req.body.refresh_token : "";
    if (!refreshTokenValue) {
      return oauthError(res, 400, "invalid_request", "refresh_token is required.");
    }

    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const result = await connection.query(
        `SELECT user_id, client_id, resource, scope
           FROM mcp_oauth_tokens
          WHERE token_hash = $1 AND token_type = 'refresh'
            AND revoked_at IS NULL AND expires_at > now()
          FOR UPDATE`,
        [sha256(refreshTokenValue)],
      );
      const previous = result.rows[0];
      if (!previous || previous.client_id !== clientId || previous.resource !== resource) {
        await connection.query("ROLLBACK");
        return oauthError(res, 400, "invalid_grant", "The refresh token is invalid or expired.");
      }

      await connection.query(
        `UPDATE mcp_oauth_tokens SET revoked_at = now()
          WHERE token_hash = $1 AND token_type = 'refresh'`,
        [sha256(refreshTokenValue)],
      );
      const accessToken = randomOpaqueToken();
      const newRefreshToken = randomOpaqueToken();
      await connection.query(
        `INSERT INTO mcp_oauth_tokens
           (token_hash, token_type, user_id, client_id, resource, scope, expires_at)
         VALUES
           ($1, 'access', $2, $3, $4, $5, now() + ($6 * interval '1 second')),
           ($7, 'refresh', $2, $3, $4, $5, now() + ($8 * interval '1 second'))`,
        [
          sha256(accessToken),
          previous.user_id,
          clientId,
          previous.resource,
          previous.scope,
          ACCESS_TOKEN_TTL_SECONDS,
          sha256(newRefreshToken),
          REFRESH_TOKEN_TTL_SECONDS,
        ],
      );
      await connection.query("COMMIT");
      setPrivateJsonHeaders(res);
      return res.json(tokenResponse(accessToken, newRefreshToken, previous.scope));
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  }

  return oauthError(res, 400, "unsupported_grant_type", "Only authorization_code and refresh_token grants are supported.");
}

async function handleRevoke(req: Request, res: Response) {
  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const clientId = typeof req.body?.client_id === "string" ? req.body.client_id : "";
  if (token) {
    await pool.query(
      `UPDATE mcp_oauth_tokens
          SET revoked_at = COALESCE(revoked_at, now())
        WHERE token_hash = $1 AND ($2 = '' OR client_id = $2)`,
      [sha256(token), clientId],
    );
  }
  setPrivateJsonHeaders(res);
  return res.status(200).end();
}

export async function authenticateMcpRequest(req: Request, res: Response): Promise<McpAuth | undefined> {
  const origin = getPublicOrigin(req);
  const authorization = req.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,})$/.exec(authorization);
  if (!match) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="${REQUIRED_SCOPES.join(" ")}"`,
    );
    res.status(401).json({ error: "authentication_required" });
    return undefined;
  }

  const tokenResult = await pool.query(
    `SELECT user_id, client_id, resource, scope
       FROM mcp_oauth_tokens
      WHERE token_hash = $1 AND token_type = 'access'
        AND revoked_at IS NULL AND expires_at > now()`,
    [sha256(match[1])],
  );
  const token = tokenResult.rows[0];
  if (!token || token.resource !== `${origin}/mcp`) {
    res.setHeader(
      "WWW-Authenticate",
      `Bearer error="invalid_token", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
    );
    res.status(401).json({ error: "invalid_token" });
    return undefined;
  }

  return {
    userId: token.user_id,
    scopes: new Set(String(token.scope).split(/\s+/)),
    clientId: token.client_id,
  };
}

export async function ensureMcpOAuthSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
      client_id text PRIMARY KEY,
      client_name text NOT NULL,
      redirect_uris jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS mcp_oauth_pending (
      id text PRIMARY KEY,
      client_id text NOT NULL,
      client_name text NOT NULL,
      redirect_uri text NOT NULL,
      code_challenge text NOT NULL,
      state text NOT NULL,
      resource text NOT NULL,
      scope text NOT NULL,
      expires_at timestamptz NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
      code_hash text PRIMARY KEY,
      client_id text NOT NULL,
      redirect_uri text NOT NULL,
      code_challenge text NOT NULL,
      scope text NOT NULL,
      user_id text NOT NULL,
      resource text NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
      token_hash text PRIMARY KEY,
      token_type text NOT NULL CHECK (token_type IN ('access', 'refresh')),
      user_id text NOT NULL,
      client_id text NOT NULL,
      resource text NOT NULL,
      scope text NOT NULL,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_lookup_idx
      ON mcp_oauth_tokens (token_hash, token_type, expires_at);
    CREATE INDEX IF NOT EXISTS mcp_oauth_pending_expiry_idx
      ON mcp_oauth_pending (expires_at);
  `);
}

export function registerMcpOAuthRoutes(app: Express): void {
  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    res.json(protectedResourceMetadata(getPublicOrigin(req)));
  });
  app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
    res.json(protectedResourceMetadata(getPublicOrigin(req)));
  });
  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    res.json(authorizationServerMetadata(getPublicOrigin(req)));
  });

  app.get("/oauth/authorize", (req, res, next) => {
    handleAuthorize(req, res).catch(next);
  });
  app.post("/oauth/approve", (req, res, next) => {
    handleApprove(req, res).catch(next);
  });
  app.post("/oauth/register", (req, res, next) => {
    handleRegister(req, res).catch(next);
  });
  app.post("/oauth/token", (req, res, next) => {
    handleToken(req, res).catch(next);
  });
  app.post("/oauth/revoke", (req, res, next) => {
    handleRevoke(req, res).catch(next);
  });
}