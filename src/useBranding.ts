import { useEffect, useState } from "react";
import { DEFAULT_BRANDING, normalizeBranding, type Branding } from "./branding";

export function applyBranding(b: Branding) {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", b.primaryColor);
  root.style.setProperty("--brand-accent", b.accentColor);
  if (b.appName) document.title = b.appName;
}

export async function fetchBranding(): Promise<Branding> {
  try {
    const res = await fetch("/api/branding");
    if (!res.ok) return DEFAULT_BRANDING;
    return normalizeBranding(await res.json());
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function saveBranding(b: Branding): Promise<Branding> {
  const res = await fetch("/api/branding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(b)
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
  return normalizeBranding(await res.json());
}

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  useEffect(() => {
    fetchBranding().then((b) => {
      setBranding(b);
      applyBranding(b);
    });
  }, []);
  return branding;
}
