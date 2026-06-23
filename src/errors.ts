const GENERIC =
  "Something went wrong while generating a response. Please try again.";

const GUARDRAIL_PROMPT = "Your prompt was blocked by a content guardrail.";
const GUARDRAIL_RESPONSE = "The response was blocked by a content guardrail.";
const DLP_REQUEST =
  "Your message was blocked by a Data Loss Prevention (DLP) policy.";
const DLP_RESPONSE =
  "The response was blocked by a Data Loss Prevention (DLP) policy.";

const CODE_MESSAGES: Record<string, string> = {
  "2016": GUARDRAIL_PROMPT,
  "2017": GUARDRAIL_RESPONSE,
  "2029": DLP_REQUEST,
  "2030": DLP_RESPONSE
};

// Best-effort: pull a human-readable DLP profile/policy name out of any
// cf-aig-dlp JSON that happens to be embedded in the error text.
function extractDlpDetail(text: string): string | null {
  const match = text.match(/"profile_id"\s*:\s*"([^"]+)"/);
  if (match) return match[1];
  const policy = text.match(/"policy_ids"\s*:\s*\[\s*"([^"]+)"/);
  return policy ? policy[1] : null;
}

// Build a searchable string from any error shape. AI Gateway errors surface
// the code in different places depending on how the provider/AI SDK wraps
// them: sometimes in `.message`, sometimes only in `internalCode` or a nested
// `error: [{ code }]` array. Serializing the whole thing lets us find it
// regardless, while keeping the human message available for DLP detail.
function collectErrorText(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const parts: string[] = [];
    const e = error as Record<string, unknown>;
    if (typeof e.message === "string") parts.push(e.message);
    try {
      parts.push(JSON.stringify(error));
    } catch {
      // circular or non-serializable — fall back to the message only
    }
    if (e.cause != null && e.cause !== error) {
      parts.push(collectErrorText(e.cause));
    }
    return parts.join(" ");
  }
  return String(error);
}

export function describeGatewayError(error: unknown): string {
  const text = collectErrorText(error);

  for (const code of ["2016", "2017", "2029", "2030"]) {
    if (new RegExp(`\\b${code}\\b`).test(text)) {
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
