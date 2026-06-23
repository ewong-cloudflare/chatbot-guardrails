# Chatbot Guardrails DLP

A Cloudflare Workers chatbot demo that runs inference through **Cloudflare AI Gateway** with a one-click **Guardrails toggle**, plus a KV-backed **styling admin panel** for logo, colors, and accents.

Built on the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [`@cloudflare/ai-chat`](https://www.npmjs.com/package/@cloudflare/ai-chat), with Workers AI as the inference provider. Forked from [`cf-jongsik/chatbot-guardrails-dlp`](https://github.com/cf-jongsik/chatbot-guardrails-dlp).

## How the guardrails toggle works

The chat routes Workers AI requests through one of two AI Gateways:

| Toggle           | Gateway ID                           | Guardrails                |
| ---------------- | ------------------------------------ | ------------------------- |
| **On** (default) | `realacmecorp-zt-demos`              | Gateway Guardrails active |
| **Off**          | `realacmecorp-zt-demos-no-guardrail` | No guardrails             |

Guardrails (prompt/response scanning) are configured at the **gateway level** in the Cloudflare dashboard — flipping the switch in the controls bar above the chat input swaps the gateway, so you can demo blocked vs. unrestricted responses with the same model. The toggle is persisted in the chat agent's Durable Object state (`setGuardrails` RPC).

## Features

- Workers AI chat through Cloudflare AI Gateway with a live guardrails toggle
- Model picker covering every Workers AI LLM, with admin control over which models are selectable
- Collapsible **Parameters** panel for a custom system message appended to every request
- Tool calls: weather, timezone, math (with approval), scheduling, and image generation
- MCP server management, file/image attachments, dark/light theme
- Durable Object-backed chat state and scheduled task execution
- KV-backed branding admin panel at `/admin` (logo, primary + accent colors, app name)

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create the resources** (one-time) and update `wrangler.jsonc`:

   ```bash
   # KV namespace for branding — copy the id into kv_namespaces[0].id
   npx wrangler kv namespace create chatbot_branding

   # R2 bucket for generated images (matches r2_buckets[0].bucket_name)
   npx wrangler r2 bucket create chatbot-bucket
   ```

   Set `R2_PUBLIC_URL` in `wrangler.jsonc` to your bucket's public URL (custom domain or r2.dev) if you use image generation. This project uses `https://chatbot-images.acmecorp.work`.

3. **Configure secrets**

   Copy `.dev.vars.example` to `.dev.vars` for local dev. For production:

   ```bash
   npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
   npx wrangler secret put CLOUDFLARE_API_TOKEN
   ```

4. **Run locally**

   ```bash
   npm run dev
   ```

5. **Deploy**

   ```bash
   npm run deploy
   ```

## Environment & bindings

| Name                    | Type               | Purpose                                       |
| ----------------------- | ------------------ | --------------------------------------------- |
| `AI`                    | Workers AI binding | Inference (remote, via AI Gateway)            |
| `chatbot_branding`      | KV namespace       | Stores branding JSON (incl. logo as data URL) |
| `R2`                    | R2 bucket          | Stores generated images                       |
| `GUARDRAILS_GATEWAY`    | var                | Gateway ID used when guardrails are on        |
| `NO_GUARDRAILS_GATEWAY` | var                | Gateway ID used when guardrails are off       |
| `R2_PUBLIC_URL`         | var                | Public URL for the R2 bucket                  |
| `ACCESS_TEAM_DOMAIN`    | var                | Cloudflare Access team domain (JWT verify)    |
| `ACCESS_AUD`            | var                | Access application AUD tag (JWT verify)       |
| `CLOUDFLARE_ACCOUNT_ID` | secret             | Account that owns the gateways/Workers AI     |
| `CLOUDFLARE_API_TOKEN`  | secret             | Token for the remote AI binding / AI Gateway  |

Run `npm run types` after changing bindings to regenerate `env.d.ts`.

## API token permissions

The `CLOUDFLARE_API_TOKEN` authenticates the **remote AI binding** (`ai.remote: true`), so inference runs against real Workers AI through your AI Gateway during local dev and at runtime. Create the token at **Manage Account → Account API Tokens** ([permissions reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)).

**Runtime token** (minimum — what `CLOUDFLARE_API_TOKEN` needs):

| Permission      | Scope   | Why                                            |
| --------------- | ------- | ---------------------------------------------- |
| Workers AI Read | Account | Run LLM + image (`flux-1-schnell`) inference   |
| AI Gateway Run  | Account | Route requests through the guardrails gateways |

> AI Gateway permissions are account-scoped only and cannot be limited to a single gateway.

**Deploy token** (only if deploying via CI with a token instead of `wrangler login`) — add these to the above:

| Permission              | Scope   | Why                                       |
| ----------------------- | ------- | ----------------------------------------- |
| Workers Scripts Edit    | Account | Deploy the Worker, Durable Object, assets |
| Workers KV Storage Edit | Account | Create/manage the `chatbot_branding` KV   |
| Workers R2 Storage Edit | Account | Create/manage the `chatbot-bucket` bucket |
| AI Gateway Read         | Account | Reference the gateways                    |
| Account Settings Read   | Account | Resolve the account                       |
| User Memberships Read   | User    | Verify account membership                 |

## Model selection

The model dropdown sits in the controls bar above the chat input, alongside the guardrails toggle. It lists every Workers AI LLM from the [pricing page](https://developers.cloudflare.com/workers-ai/platform/pricing/) (defined in `src/models.ts`). The selected model is persisted in the chat agent's Durable Object state (`setModel` RPC).

Use the **Chat models** section of `/admin` to choose which models appear in that dropdown — selecting none means all models are available.

## Parameters panel

The sliders icon in the header toggles a collapsible right-side **Parameters** panel. Its **System message** field is persisted in the chat agent's Durable Object state (`setSystemPrompt` RPC) and appended to the base system prompt on every request. Changes save on blur.

## Styling admin panel

Open `/admin` to update the logo, primary color, accent color, and app name. Settings are stored globally in KV (`GET`/`POST /api/branding`) and applied app-wide via CSS variables on load.

> **Access control:** `/admin` and `/api/branding` have no app-level password — protect them with a [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) policy (e.g. a self-hosted application covering `/admin*` and `/api/branding`).

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

## Key files

- `src/server.ts` — chat agent, gateway selection, tools, scheduling, and the `/api/branding` handler
- `src/app.tsx` — React chat UI, guardrails toggle, and branding theming
- `src/admin.tsx` — branding admin panel (`/admin`)
- `src/branding.ts` / `src/useBranding.ts` — shared branding types and client helpers
- `wrangler.jsonc` — Worker config: AI, KV, R2, Durable Objects, asset routing

## Scripts

- `npm run dev` — local development server
- `npm run deploy` — build and deploy to Cloudflare
- `npm run types` — regenerate Wrangler environment types
- `npm run check` — format check, lint, and TypeScript validation
