export interface Branding {
  appName: string;
  primaryColor: string;
  accentColor: string;
  logoDataUrl: string;
  // Model IDs selectable in the chat model toggle. Empty = all models.
  enabledModels: string[];
}

export const DEFAULT_BRANDING: Branding = {
  appName: "Guardrails Chatbot",
  primaryColor: "#f6821f",
  accentColor: "#0051c3",
  logoDataUrl: "",
  enabledModels: []
};

export const BRANDING_KEY = "branding";

export function normalizeBranding(input: Partial<Branding> | null): Branding {
  const merged = { ...DEFAULT_BRANDING, ...(input ?? {}) };
  return {
    ...merged,
    enabledModels: Array.isArray(merged.enabledModels)
      ? merged.enabledModels
      : []
  };
}
