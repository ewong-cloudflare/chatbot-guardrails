export const DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.7-code";

// Every model selectable in the admin panel's "Chat models" list and, once
// enabled there, the chat model dropdown.
//
// Cross-checked against the Workers AI model catalog
// (https://developers.cloudflare.com/workers-ai/models/) — deprecated
// models are dropped entirely (they error on every call, e.g. the
// `AiError ... deprecated ...` 410 we've hit in practice, so they can't
// respond to chats at all), not just excluded from the default set:
//   - mistral-7b-instruct-v0.1, llama-3.1-8b-instruct,
//     llama-3.1-8b-instruct-awq, llama-3-8b-instruct,
//     llama-3-8b-instruct-awq, llama-2-7b-chat-fp16, gemma-3-12b-it,
//     kimi-k2.5 (Deprecated in the catalog, despite being tagged Reasoning)
//   - llama-3.1-70b-instruct-fp8-fast (no such catalog entry; the only 70B
//     Llama 3.1 listed, llama-3.1-70b-instruct, is itself Deprecated)
// Also fixed a mismatched id: llama-3.1-8b-instruct-fp8-fast doesn't exist
// in the catalog — the real non-deprecated variant is
// llama-3.1-8b-instruct-fast (distinct from llama-3.1-8b-instruct-fp8,
// which we already list separately).
export const ALL_MODELS: string[] = [
  // AI Gateway dynamic route (called via the gateway OpenAI-compat endpoint).
  "dynamic/dynamic_routing_demo",
  "@cf/meta/llama-3.2-1b-instruct",
  "@cf/meta/llama-3.2-3b-instruct",
  "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.2-11b-vision-instruct",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/meta/llama-3.1-8b-instruct-fp8",
  "@cf/meta/llama-guard-3-8b",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/qwen/qwq-32b",
  "@cf/qwen/qwen2.5-coder-32b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/openai/gpt-oss-120b",
  "@cf/openai/gpt-oss-20b",
  "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
  "@cf/ibm-granite/granite-4.0-h-micro",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/zai-org/glm-5.2",
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/moonshotai/kimi-k2.6",
  "@cf/moonshotai/kimi-k2.7-code",
  "@cf/google/gemma-4-26b-a4b-it"
];

// Default enabled models when an admin hasn't customized the list: only
// models tagged "Reasoning" in the Workers AI catalog, plus the
// dynamic-routing demo entry (kept selected per product decision, not a
// reasoning model itself — it's a gateway routing feature, not a fixed
// model). Everything else in ALL_MODELS (vision-only, function-calling-only,
// coder-specialized, the safety classifier, etc.) stays selectable in the
// admin panel but starts disabled.
export const REASONING_MODELS: string[] = [
  "dynamic/dynamic_routing_demo",
  "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "@cf/qwen/qwq-32b",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/openai/gpt-oss-120b",
  "@cf/openai/gpt-oss-20b",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/zai-org/glm-5.2",
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/moonshotai/kimi-k2.6",
  "@cf/moonshotai/kimi-k2.7-code",
  "@cf/google/gemma-4-26b-a4b-it"
];
