import { useEffect, useState } from "react";
import { Button, Text } from "@cloudflare/kumo";
import {
  ArrowLeftIcon,
  FloppyDiskIcon,
  CheckCircleIcon,
  WarningCircleIcon
} from "@phosphor-icons/react";
import { DEFAULT_BRANDING, type Branding } from "./branding";
import { applyBranding, fetchBranding, saveBranding } from "./useBranding";
import { ALL_MODELS } from "./models";

const inputClass =
  "w-full px-3 py-2 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent";

type Status = { kind: "idle" | "ok" | "error"; msg?: string };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <Text size="sm" bold>
        {label}
      </Text>
      {children}
    </label>
  );
}

export default function Admin() {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchBranding().then(setBranding);
  }, []);

  const update = (patch: Partial<Branding>) =>
    setBranding((b) => ({ ...b, ...patch }));

  const isModelEnabled = (name: string) =>
    branding.enabledModels.length === 0 ||
    branding.enabledModels.includes(name);

  const toggleModel = (name: string) =>
    setBranding((b) => {
      const base = b.enabledModels.length ? b.enabledModels : ALL_MODELS;
      const set = new Set(base);
      if (set.has(name)) set.delete(name);
      else set.add(name);
      return {
        ...b,
        enabledModels: set.size === ALL_MODELS.length ? [] : [...set]
      };
    });

  const onSave = async () => {
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const saved = await saveBranding(branding);
      setBranding(saved);
      applyBranding(saved);
      setStatus({ kind: "ok", msg: "Branding saved." });
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : String(e)
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-kumo-elevated">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-kumo-default">
            Branding Admin
          </h1>
          <Button
            variant="secondary"
            icon={<ArrowLeftIcon size={16} />}
            onClick={() => {
              window.location.href = "/";
            }}
          >
            Back to chat
          </Button>
        </div>

        {/* Live preview */}
        <div
          className="flex items-center gap-3 px-5 py-4 rounded-xl bg-kumo-base border border-kumo-line"
          style={{ borderTop: `3px solid ${branding.primaryColor}` }}
        >
          {branding.logoDataUrl ? (
            <img
              src={branding.logoDataUrl}
              alt=""
              className="h-8 w-8 rounded object-contain"
            />
          ) : (
            <span className="text-2xl">⛅</span>
          )}
          <span className="text-lg font-semibold text-kumo-default">
            {branding.appName}
          </span>
          <span
            className="ml-auto text-xs font-medium px-2 py-1 rounded-full text-white"
            style={{ backgroundColor: branding.accentColor }}
          >
            Accent
          </span>
        </div>

        <div className="space-y-5 px-5 py-5 rounded-xl bg-kumo-base border border-kumo-line">
          <Field label="App name">
            <input
              className={inputClass}
              value={branding.appName}
              onChange={(e) => update({ appName: e.target.value })}
              placeholder="Guardrails Chatbot"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Primary color">
              <input
                type="color"
                className="h-10 w-full rounded-lg border border-kumo-line bg-kumo-base"
                value={branding.primaryColor}
                onChange={(e) => update({ primaryColor: e.target.value })}
                aria-label="Primary color"
              />
            </Field>
            <Field label="Accent color">
              <input
                type="color"
                className="h-10 w-full rounded-lg border border-kumo-line bg-kumo-base"
                value={branding.accentColor}
                onChange={(e) => update({ accentColor: e.target.value })}
                aria-label="Accent color"
              />
            </Field>
          </div>

          <Field label="Logo">
            <input
              type="file"
              accept="image/*"
              className={inputClass}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) update({ logoDataUrl: await fileToDataUrl(file) });
              }}
            />
            {branding.logoDataUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update({ logoDataUrl: "" })}
              >
                Remove logo
              </Button>
            )}
          </Field>

          <Field label="Chat models">
            <div className="flex items-center justify-between mb-1">
              <Text size="xs" variant="secondary">
                Models shown in the chat toggle (none = all)
              </Text>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update({ enabledModels: [] })}
              >
                Enable all
              </Button>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-kumo-line divide-y divide-kumo-line">
              {ALL_MODELS.map((name) => (
                <label
                  key={name}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-kumo-tint"
                >
                  <input
                    type="checkbox"
                    checked={isModelEnabled(name)}
                    onChange={() => toggleModel(name)}
                  />
                  <span className="font-mono text-xs text-kumo-default">
                    {name}
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              icon={<FloppyDiskIcon size={16} />}
              onClick={onSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save branding"}
            </Button>
            {status.kind === "ok" && (
              <span className="flex items-center gap-1 text-sm text-kumo-success">
                <CheckCircleIcon size={16} />
                {status.msg}
              </span>
            )}
            {status.kind === "error" && (
              <span className="flex items-center gap-1 text-sm text-kumo-danger">
                <WarningCircleIcon size={16} />
                {status.msg}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
