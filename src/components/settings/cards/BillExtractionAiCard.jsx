import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { getBillExtractModels } from "@/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldHint, SettingsCard, StatusPill } from "@/components/settings/settings-ui";

const FALLBACK_PROVIDERS = [
  {
    provider: "anthropic",
    label: "Anthropic",
    available: true,
    defaultModel: "claude-haiku-4-5",
    models: [{ id: "claude-haiku-4-5", label: "Haiku 4.5" }],
  },
];

export default function BillExtractionAiCard({ settings, setSettings, patch }) {
  const [providers, setProviders] = useState(FALLBACK_PROVIDERS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getBillExtractModels()
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data) && data.length) setProviders(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const selectedProvider = settings?.bill_extract_provider || "anthropic";
  const selectedModel = settings?.bill_extract_model || "claude-haiku-4-5";

  const providerEntry = providers.find((p) => p.provider === selectedProvider) || providers[0];

  function applyChange(nextProvider, nextModel) {
    const next = providers.find((p) => p.provider === nextProvider) || providers[0];
    const model = next.models.some((m) => m.id === nextModel) ? nextModel : next.defaultModel;
    setSettings((current) => ({
      ...(current || {}),
      bill_extract_provider: nextProvider,
      bill_extract_model: model,
    }));
    patch({ bill_extract_provider: nextProvider, bill_extract_model: model });
  }

  return (
    <SettingsCard
      title="Bill Extraction AI"
      icon={<Receipt size={14} />}
      description="Model used to extract payee, amount, due date, and category from bill emails. Independent of the briefing model."
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr]">
          <Select
            value={selectedProvider}
            onValueChange={(value) => applyChange(value, providerEntry?.defaultModel || "")}
          >
            <SelectTrigger className="bg-input/30 hover:bg-input/50" aria-label="Bill extraction provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="start"
              className="bg-[#16161e] shadow-[0_20px_60px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.08]"
            >
              {providers.map((p) => (
                <SelectItem
                  key={p.provider}
                  value={p.provider}
                  disabled={!p.available}
                  className="text-[13px]"
                >
                  {p.label}
                  {!p.available ? " (unavailable)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedModel}
            onValueChange={(value) => applyChange(selectedProvider, value)}
            disabled={!providerEntry?.available}
          >
            <SelectTrigger className="bg-input/30 hover:bg-input/50" aria-label="Bill extraction model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align="start"
              className="bg-[#16161e] shadow-[0_20px_60px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.08]"
            >
              {(providerEntry?.models || []).map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-[13px]">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {providerEntry?.available ? (
            <StatusPill tone="success">{providerEntry.label} key configured</StatusPill>
          ) : (
            <StatusPill tone="warning">
              Set {providerEntry?.envVar || (selectedProvider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY")}
            </StatusPill>
          )}
          {loading ? <FieldHint>Loading providers…</FieldHint> : null}
        </div>
      </div>
    </SettingsCard>
  );
}
