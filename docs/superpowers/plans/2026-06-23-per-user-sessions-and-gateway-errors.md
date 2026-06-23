# Per-user sessions & informative AI Gateway block errors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Cloudflare Access user an isolated chat (own Durable Object) and show specific, human-readable messages when AI Gateway blocks a request via Guardrails or DLP.

**Architecture:** The Worker verifies the Access JWT (jose + JWKS), derives a deterministic session name, and rewrites the `/agents/<agent>/<name>` path so requests route to a per-identity Durable Object. Unauthenticated requests use a per-browser anonymous id from `localStorage`. Block errors are mapped from AI Gateway error codes in the AI SDK `toUIMessageStreamResponse({ onError })` hook and rendered inline as an error bubble.

**Tech Stack:** Cloudflare Workers, Agents SDK (`agents`, `@cloudflare/ai-chat`), Vite, React 19, `jose` (JWT verification), Vitest (unit tests).

---

## File structure

- Create `src/errors.ts` — maps AI Gateway error codes → friendly messages (+ best-effort DLP detail).
- Create `src/auth.ts` — Access token extraction, JWT verification, session-name derivation.
- Create `src/errors.test.ts`, `src/auth.test.ts` — unit tests.
- Create `vitest.config.ts` — test runner config.
- Modify `package.json` — add `jose`, `vitest`; add `test` script.
- Modify `wrangler.jsonc` — add `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` vars.
- Modify `src/server.ts` — session routing in `fetch`; `onError` mapping in `onChatMessage`.
- Modify `src/app.tsx` — anonymous id, `useAgent` name, inline error bubble.
- Modify `README.md` — document per-user sessions, Access config, error behavior.
- Regenerate `env.d.ts` via `npm run types`.

---

## Task 1: Test infrastructure and dependencies

**Files:**

- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install jose && npm install -D vitest
```

Expected: both packages added to `package.json`; no errors.

- [ ] **Step 2: Add the test script to `package.json`**

In the `"scripts"` block, add a `test` line after `"build"`:

```json
    "build": "vite build",
    "test": "vitest run",
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
});
```

- [ ] **Step 4: Verify the runner works (no tests yet)**

Run: `npm test`
Expected: Vitest runs and reports "No test files found" (exit non-zero is fine at this point) OR passes with 0 tests. This only confirms vitest is installed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest and jose dependencies"
```

---

## Task 2: Gateway error mapping (`src/errors.ts`)

**Files:**

- Create: `src/errors.ts`
- Test: `src/errors.test.ts`

- [ ] **Step 1: Write the failing test**

`src/errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeGatewayError } from "./errors";

describe("describeGatewayError", () => {
  it("maps 2016 to a prompt guardrail message", () => {
    expect(describeGatewayError(new Error("error 2016: blocked"))).toBe(
      "Your prompt was blocked by a content guardrail."
    );
  });

  it("maps 2017 to a response guardrail message", () => {
    expect(describeGatewayError(new Error("code 2017"))).toBe(
      "The response was blocked by a content guardrail."
    );
  });

  it("maps 2029 to a DLP request message", () => {
    expect(describeGatewayError(new Error("2029 violation"))).toBe(
      "Your message was blocked by a Data Loss Prevention (DLP) policy."
    );
  });

  it("maps 2030 to a DLP response message", () => {
    expect(describeGatewayError(new Error("2030 violation"))).toBe(
      "The response was blocked by a Data Loss Prevention (DLP) policy."
    );
  });

  it("appends best-effort DLP profile detail when present", () => {
    const err = new Error(
      'blocked 2029 {"findings":[{"profile":{"profile_id":"Credit Card"}}],"action":"BLOCK"}'
    );
    expect(describeGatewayError(err)).toBe(
      "Your message was blocked by a Data Loss Prevention (DLP) policy: Credit Card."
    );
  });

  it("returns a generic message for unknown errors", () => {
    expect(describeGatewayError(new Error("network down"))).toBe(
      "Something went wrong while generating a response. Please try again."
    );
  });

  it("handles non-Error values without throwing", () => {
    expect(describeGatewayError("2016")).toBe(
      "Your prompt was blocked by a content guardrail."
    );
    expect(describeGatewayError(undefined)).toBe(
      "Something went wrong while generating a response. Please try again."
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `describeGatewayError` not found / module `./errors` missing.

- [ ] **Step 3: Implement `src/errors.ts`**

```ts
const GENERIC =
  "Something went wrong while generating a response. Please try again.";

const CODE_MESSAGES: Record<string, string> = {
  "2016": "Your prompt was blocked by a content guardrail.",
  "2017": "The response was blocked by a content guardrail.",
  "2029": "Your message was blocked by a Data Loss Prevention (DLP) policy.",
  "2030": "The response was blocked by a Data Loss Prevention (DLP) policy."
};

// Best-effort: pull a human-readable DLP profile/policy name out of any
// cf-aig-dlp JSON that happens to be embedded in the error text.
function extractDlpDetail(text: string): string | null {
  const match = text.match(/"profile_id"\s*:\s*"([^"]+)"/);
  if (match) return match[1];
  const policy = text.match(/"policy_ids"\s*:\s*\[\s*"([^"]+)"/);
  return policy ? policy[1] : null;
}

export function describeGatewayError(error: unknown): string {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  for (const code of ["2016", "2017", "2029", "2030"]) {
    if (text.includes(code)) {
      const base = CODE_MESSAGES[code];
      if (code === "2029" || code === "2030") {
        const detail = extractDlpDetail(text);
        if (detail) return base.replace(/\.$/, `: ${detail}.`);
      }
      return base;
    }
  }
  return GENERIC;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `describeGatewayError` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/errors.ts src/errors.test.ts
git commit -m "feat: map AI Gateway guardrail/DLP error codes to messages"
```

---

## Task 3: Surface mapped errors from the chat stream

**Files:**

- Modify: `src/server.ts` (the `return result.toUIMessageStreamResponse();` line, currently around line 280)

- [ ] **Step 1: Add the import**

At the top of `src/server.ts`, after the existing `import { DEFAULT_MODEL } from "./models";` line, add:

```ts
import { describeGatewayError } from "./errors";
```

- [ ] **Step 2: Pass `onError` to the stream response**

Replace:

```ts
return result.toUIMessageStreamResponse();
```

with:

```ts
return result.toUIMessageStreamResponse({
  onError: describeGatewayError
});
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: send mapped guardrail/DLP messages to the chat client"
```

---

## Task 4: Token extraction & session-name helpers (`src/auth.ts` — pure parts)

**Files:**

- Create: `src/auth.ts`
- Test: `src/auth.test.ts`

- [ ] **Step 1: Write the failing test**

`src/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { extractAccessToken, toSessionName } from "./auth";

function req(headers: Record<string, string>): Request {
  return new Request("https://example.com/agents/chat-agent/x", { headers });
}

describe("extractAccessToken", () => {
  it("reads the Cf-Access-Jwt-Assertion header", () => {
    expect(
      extractAccessToken(req({ "Cf-Access-Jwt-Assertion": "tok123" }))
    ).toBe("tok123");
  });

  it("falls back to the CF_Authorization cookie", () => {
    expect(
      extractAccessToken(req({ Cookie: "foo=bar; CF_Authorization=tok456" }))
    ).toBe("tok456");
  });

  it("returns null when no token is present", () => {
    expect(extractAccessToken(req({}))).toBeNull();
  });
});

describe("toSessionName", () => {
  it("produces a safe, deterministic name from an email", () => {
    expect(toSessionName("John@Acme.com")).toBe("u_john_acme_com");
  });

  it("collapses runs of unsafe characters", () => {
    expect(toSessionName("a..b@@c")).toBe("u_a_b_c");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — module `./auth` / exports missing.

- [ ] **Step 3: Implement the pure helpers in `src/auth.ts`**

```ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export function extractAccessToken(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;

  const cookie = request.headers.get("Cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === "CF_Authorization") return rest.join("=");
    }
  }
  return null;
}

export function toSessionName(identity: string): string {
  const safe = identity
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `u_${safe}`;
}

function normalizeIdentity(payload: JWTPayload): string | null {
  const email = payload.email;
  if (typeof email === "string" && email.length > 0) return email;
  if (typeof payload.sub === "string" && payload.sub.length > 0) {
    return payload.sub;
  }
  return null;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`)
    );
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

export async function getSessionName(
  request: Request,
  env: Env
): Promise<string | null> {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!teamDomain || !aud) return null;

  const token = extractAccessToken(request);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      audience: aud
    });
    const identity = normalizeIdentity(payload);
    return identity ? toSessionName(identity) : null;
  } catch (err) {
    console.warn("Access JWT verification failed:", (err as Error).message);
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — `extractAccessToken` and `toSessionName` tests green. (`getSessionName` is covered manually in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts src/auth.test.ts
git commit -m "feat: add Access token extraction and session-name helpers"
```

---

## Task 5: Add Access config vars and regenerate types

**Files:**

- Modify: `wrangler.jsonc` (the `vars` block, around lines 49-53)
- Modify: `env.d.ts` (regenerated)

- [ ] **Step 1: Add the vars**

In `wrangler.jsonc`, change the `vars` block to:

```jsonc
  "vars": {
    "R2_PUBLIC_URL": "https://chatbot-images.acmecorp.work",
    "GUARDRAILS_GATEWAY": "realacmecorp-zt-demos",
    "NO_GUARDRAILS_GATEWAY": "realacmecorp-zt-demos-no-guardrail",
    "ACCESS_TEAM_DOMAIN": "realacmecorp.cloudflareaccess.com",
    "ACCESS_AUD": "b14960624a389d5c55b745220c224a717fd0a3c1055af637965c310a87c13046"
  },
```

- [ ] **Step 2: Regenerate types**

Run: `npm run types`
Expected: `env.d.ts` regenerated; now includes `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add wrangler.jsonc env.d.ts
git commit -m "feat: add Cloudflare Access team domain and AUD config"
```

---

## Task 6: Per-user session routing in the Worker

**Files:**

- Modify: `src/server.ts` (the `export default { fetch }` handler, around lines 318-329)

- [ ] **Step 1: Add the import**

At the top of `src/server.ts`, after `import { describeGatewayError } from "./errors";`, add:

```ts
import { getSessionName } from "./auth";
```

- [ ] **Step 2: Add the routing helper above `export default`**

Insert this function just before `export default {`:

```ts
// For authenticated users, force the Durable Object instance name to the
// verified identity so the client cannot choose another user's session.
// Anonymous users keep the client-provided name (a localStorage id).
async function withSessionRouting(
  request: Request,
  url: URL,
  env: Env
): Promise<Request> {
  const sessionName = await getSessionName(request, env);
  if (!sessionName) return request;

  const segments = url.pathname.split("/"); // ["", "agents", "<agent>", "<name>", ...]
  if (segments.length < 4) return request;

  segments[3] = sessionName;
  const newUrl = new URL(url);
  newUrl.pathname = segments.join("/");
  return new Request(newUrl, request);
}
```

- [ ] **Step 3: Use it in `fetch`**

Replace the body of `fetch` with:

```ts
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/branding") {
      return handleBranding(request, env);
    }
    const routed = url.pathname.startsWith("/agents/")
      ? await withSessionRouting(request, url, env)
      : request;
    return (
      (await routeAgentRequest(routed, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts
git commit -m "feat: route chat to a per-identity Durable Object via Access JWT"
```

---

## Task 7: Anonymous session id + connect with a name (client)

**Files:**

- Modify: `src/app.tsx` (imports near line 1; `useAgent` call around lines 256-257)

- [ ] **Step 1: Ensure `useMemo` is imported**

Change the first import line:

```ts
import { Suspense, useCallback, useState, useEffect, useRef } from "react";
```

to:

```ts
import {
  Suspense,
  useCallback,
  useState,
  useEffect,
  useRef,
  useMemo
} from "react";
```

- [ ] **Step 2: Add an anon-id helper above the `Chat` component**

Insert just before `function Chat() {`:

```ts
function getAnonId(): string {
  const KEY = "cgd_anon_id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `anon_${crypto.randomUUID()}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `anon_${crypto.randomUUID()}`;
  }
}
```

- [ ] **Step 3: Compute the id and pass it as the agent name**

Inside `Chat()`, add near the other hooks (e.g. just after `const branding = useBranding();`):

```ts
const anonId = useMemo(() => getAnonId(), []);
```

Then change:

```ts
  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
```

to:

```ts
  const agent = useAgent<ChatAgent>({
    agent: "ChatAgent",
    name: anonId,
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app.tsx
git commit -m "feat: connect chat with a per-browser anonymous session id"
```

---

## Task 8: Inline error bubble (client)

**Files:**

- Modify: `src/app.tsx` (the `onMessage` handler ~280-307; `send` ~492-497; message render footer ~928-930)

- [ ] **Step 1: Add error state**

Inside `Chat()`, near the other `useState` calls (e.g. after `const [input, setInput] = useState("");`), add:

```ts
const [chatError, setChatError] = useState<string | null>(null);
```

- [ ] **Step 2: Set the error inline instead of as a toast**

In the `onMessage` callback, replace the block:

```ts
if (data.type === "cf_agent_use_chat_response" && data.error === true) {
  toasts.add({
    title: "Chat error",
    description: data.body || "An error occurred.",
    variant: "error",
    timeout: 0
  });
}
```

with:

```ts
if (data.type === "cf_agent_use_chat_response" && data.error === true) {
  setChatError(
    typeof data.body === "string" && data.body.length > 0
      ? data.body
      : "Something went wrong while generating a response."
  );
}
```

- [ ] **Step 3: Clear the error when sending a new message**

In the `send` callback, immediately before `sendMessage({ role: "user", parts });`, add:

```ts
setChatError(null);
```

- [ ] **Step 4: Render the inline error bubble**

In the messages render area, between the closing of the messages map (`})}` at ~line 928) and `<div ref={messagesEndRef} />` (~line 930), insert:

```tsx
{
  chatError && (
    <div className="flex justify-start" role="alert">
      <div className="flex items-start gap-2 max-w-[80%] rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        <WarningIcon size={16} className="mt-0.5 shrink-0" />
        <span>{chatError}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Import the warning icon**

In the `@phosphor-icons/react` import group in `src/app.tsx`, add `WarningIcon` to the list of imported icons (alongside the existing icons such as `ShieldCheckIcon`). If icons are imported individually, add:

```ts
import { WarningIcon } from "@phosphor-icons/react";
```

Otherwise add `WarningIcon,` to the existing destructured import from `@phosphor-icons/react`.

- [ ] **Step 6: Verify types compile and lint passes**

Run: `npm run check`
Expected: format, lint, and `tsc` all pass.

- [ ] **Step 7: Commit**

```bash
git add src/app.tsx
git commit -m "feat: show guardrail/DLP block errors inline in the chat"
```

---

## Task 9: Manual verification

**Files:** none (manual)

- [ ] **Step 1: Build and unit tests**

Run: `npm test && npm run check && npx vite build`
Expected: tests pass; format/lint/tsc pass; build succeeds.

- [ ] **Step 2: Local anonymous isolation**

Run: `npm run dev`
Open the app in two different browsers (or a normal + incognito window). Send a message in each. Expected: each window has its own independent history (different `cgd_anon_id` in `localStorage`).

- [ ] **Step 3: Guardrail block message**

With guardrails toggled **on**, send a prompt that your configured gateway guardrail blocks. Expected: an inline red error bubble appears reading "Your prompt was blocked by a content guardrail." (or the response variant). Toggle guardrails **off** and resend — expected: normal response.

- [ ] **Step 4: (Behind Access) per-user isolation**

After deploying behind Cloudflare Access, sign in as two different users. Expected: each user has a separate history; the same user across tabs shares one history. (No code change — verification only.)

---

## Task 10: Documentation

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Document the feature**

Add a new section after the "Access control" note (the Cloudflare Access blockquote in the styling/admin area), titled `## Per-user sessions`, with this content:

```markdown
## Per-user sessions

Each Cloudflare Access user gets an isolated chat (own Durable Object with its
own history, model, guardrails toggle, and system message). The Worker verifies
the Access JWT (`Cf-Access-Jwt-Assertion` header or `CF_Authorization` cookie)
against your team's JWKS and routes to a Durable Object keyed by the user's
email. Requests without a valid token (e.g. local dev) fall back to a
per-browser anonymous id stored in `localStorage`.

Configure these vars in `wrangler.jsonc`:

| Var                  | Example                             |
| -------------------- | ----------------------------------- |
| `ACCESS_TEAM_DOMAIN` | `realacmecorp.cloudflareaccess.com` |
| `ACCESS_AUD`         | your Access application AUD tag     |

## Blocked-request errors

When AI Gateway blocks a message, the chat shows an inline error explaining the
cause, mapped from the gateway error codes: guardrail prompt (2016), guardrail
response (2017), DLP request (2029), DLP response (2030). When the `cf-aig-dlp`
detail is available, the matched DLP profile name is appended.
```

- [ ] **Step 2: Update the bindings table**

In the "Environment & bindings" table in `README.md`, add these two rows after the `R2_PUBLIC_URL` row:

```markdown
| `ACCESS_TEAM_DOMAIN` | var | Cloudflare Access team domain (JWT verify) |
| `ACCESS_AUD` | var | Access application AUD tag (JWT verify) |
```

- [ ] **Step 3: Format and commit**

Run: `npx oxfmt --write README.md`

```bash
git add README.md
git commit -m "docs: document per-user sessions and block-error messages"
```

---

## Self-review notes

- **Spec coverage:** JWT verify (Task 4/5), anonymous fallback (Task 7), email session key + server override (Task 4/6), inline error UX (Task 8), code→message mapping + best-effort DLP detail (Task 2), config vars (Task 5), tests (Tasks 2/4/9), docs (Task 10). All spec sections mapped.
- **Type consistency:** `getSessionName`, `extractAccessToken`, `toSessionName`, `describeGatewayError`, `withSessionRouting`, `getAnonId`, `chatError` are used with identical signatures across tasks.
- **Best-effort DLP detail** is implemented by scanning the error text for `profile_id`/`policy_ids`; if absent, the generic DLP message is used (matches the spec's best-effort decision).
