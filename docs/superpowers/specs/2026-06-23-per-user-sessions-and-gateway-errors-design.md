# Per-user sessions & informative AI Gateway block errors

Date: 2026-06-23
Status: Approved (design)

## Overview

Two features for the guardrails chatbot:

1. **Per-user chat sessions** keyed by the identity in the Cloudflare Access
   JWT, so each authenticated user gets an isolated Durable Object (own chat
   history, model, guardrails toggle, and system message).
2. **Informative block errors**: when AI Gateway blocks a request via
   Guardrails or DLP, show a specific, human-readable message inline in the
   chat instead of a generic toast.

## Decisions (from brainstorming)

- **Identity trust model:** cryptographically verify the Access JWT signature
  (JWKS + `aud`). Do not merely trust the header.
- **No valid JWT:** fall back to a per-connection anonymous session (random id
  persisted in `localStorage`), not a shared session and not a hard block.
- **Session key:** the user's `email` claim (lowercased), falling back to `sub`.
- **Error UX:** inline error bubble in the chat (not a toast).
- **Error detail:** map the four AI Gateway error codes to clear messages, plus
  best-effort DLP policy/profile detail from the `cf-aig-dlp` header when it is
  accessible.

## Feature 1 — Per-user sessions

### Components

**`src/auth.ts` (new)**

- `getSessionName(request: Request, env: Env): Promise<string | null>`
  - Extract token from `Cf-Access-Jwt-Assertion` header, else the
    `CF_Authorization` cookie.
  - Verify with `jose`:
    - `createRemoteJWKSet(new URL(\`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs\`))`
      (the remote key set caches keys internally).
    - `jwtVerify(token, jwks, { audience: env.ACCESS_AUD })`.
  - On success, return normalized identity: `String(payload.email).toLowerCase()`
    or `payload.sub`.
  - On any failure (missing token, bad signature, wrong `aud`, missing config,
    JWKS fetch error) return `null` and log a warning. Never throw to the caller.

**Config**

- `wrangler.jsonc` vars:
  - `ACCESS_TEAM_DOMAIN`: `realacmecorp.cloudflareaccess.com`
  - `ACCESS_AUD`: `b14960624a389d5c55b745220c224a717fd0a3c1055af637965c310a87c13046`
- Regenerate `env.d.ts` via `npm run types`.
- New dependency: `jose`.

**`src/server.ts` — `fetch` handler**

- Keep `/api/branding` handling unchanged.
- For agent requests (path starts with `/agents/`):
  1. `const authed = await getSessionName(request, env);`
  2. Determine effective DO name:
     - `authed` if present (overrides the client-provided name — prevents
       spoofing),
     - otherwise the client-provided name segment (the anonymous id),
     - otherwise `"anonymous"`.
  3. Rewrite the `/agents/<agent>/<name>` path's `<name>` segment to the
     effective name, build a new `Request` preserving method/headers/body
     (and WebSocket upgrade), then call `routeAgentRequest(rewritten, env)`.
- Non-agent, non-branding requests fall through to assets / 404 as today.

**`src/app.tsx` — client**

- On first load, read/create a stable anonymous id in `localStorage`
  (key `cgd_anon_id`, value `crypto.randomUUID()`).
- `useAgent({ agent: "ChatAgent", name: anonId, ... })`.
- No other client change required; authenticated users are routed by the
  server override.

### Data flow

```
Browser ──WS/HTTP (Cf-Access-Jwt-Assertion or CF_Authorization cookie)──▶ Worker.fetch
  Worker verifies JWT (jose + JWKS) ─▶ identity OR null
  effectiveName = identity ?? clientAnonId ?? "anonymous"
  rewrite /agents/chat-agent/<effectiveName> ─▶ routeAgentRequest ─▶ DO(effectiveName)
```

### Notes / constraints

- Access forwards the JWT header on HTTP and the cookie is sent on same-origin
  WebSocket upgrades, so verification works for both transports.
- Per-user DO isolation means model/guardrails/systemPrompt state is now
  per-identity (previously shared). This is the intended behavior. Branding
  remains global in KV.

## Feature 2 — Informative block errors

### AI Gateway error contract (from docs)

| Code | Meaning                        |
| ---- | ------------------------------ |
| 2016 | Prompt blocked by Guardrails   |
| 2017 | Response blocked by Guardrails |
| 2029 | Request blocked by DLP policy  |
| 2030 | Response blocked by DLP policy |

- DLP also returns a `cf-aig-dlp` response header with `findings`
  (`policy_ids`, `profile`, `check`, `action`). Surfacing it is **best-effort**:
  only if the thrown error exposes the header/body; otherwise fall back to the
  generic DLP message.
- The specific Guardrails hazard category (hate/violence/etc.) is NOT in the
  error response and is out of scope (would require the logs API).

### Components

**`src/errors.ts` (new)**

- `describeGatewayError(error: unknown): string`
  - Inspect `error` message/contents for the codes above and return:
    - 2016 → "Your prompt was blocked by a content guardrail."
    - 2017 → "The response was blocked by a content guardrail."
    - 2029 → "Your message was blocked by a DLP policy." (+ detail if available)
    - 2030 → "The response was blocked by a DLP policy." (+ detail if available)
    - default → "Something went wrong while generating a response. Please try again."
  - Best-effort DLP detail: if a `cf-aig-dlp` payload is reachable on the error
    object, append the matched profile/policy (e.g. ": credit card").

**`src/server.ts` — `onChatMessage`**

- `return result.toUIMessageStreamResponse({ onError: describeGatewayError });`
  so the mapped string is delivered through the existing
  `cf_agent_use_chat_response` error channel.

**`src/app.tsx` — client**

- Add `chatError` state.
- In the existing `onMessage` handler, when
  `data.type === "cf_agent_use_chat_response" && data.error === true`, set
  `chatError = data.body` instead of (or in addition to) the toast — per the
  decision, replace the toast with inline rendering.
- Clear `chatError` when the user sends a new message.
- Render an inline error bubble after the message list: distinct red styling
  with a warning icon, showing `chatError`.

### Edge cases

- Response-side blocks (2017/2030) may arrive after partial assistant text has
  streamed; the error bubble appends below the partial message.
- Guardrails toggle already swaps gateways; both gateways can produce these
  errors, so mapping is gateway-agnostic.

## Testing

- **Unit:** `describeGatewayError` returns the correct message for 2016/2017/
  2029/2030 and the default; token extraction parses both header and
  `CF_Authorization` cookie (with `jwtVerify` mocked).
- **Manual:**
  - Local `vite dev`: two browsers/tabs get isolated histories (anon ids).
  - Behind Access: two different users get isolated histories; same user across
    tabs shares one history.
  - With guardrails on, send a disallowed prompt and confirm the inline
    guardrail message; confirm DLP message when a DLP policy blocks.

## Fallbacks & failure modes

- Missing `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` or JWKS/verify failure → anonymous
  mode; chat keeps working; warning logged.
- Unknown/none-matching gateway errors → generic message, never a raw stack.

## Out of scope

- Querying the AI Gateway logs API for the exact guardrail hazard category.
- Admin-side management/listing of per-user sessions.
- Server-side enforcement that the app is only reachable through Access
  (operational concern: lock down `workers.dev` separately if desired).
