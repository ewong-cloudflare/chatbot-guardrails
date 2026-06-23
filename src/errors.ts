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
