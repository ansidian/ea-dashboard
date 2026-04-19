import { useCallback, useState } from "react";
import { Bot, Clock, Tag, X } from "lucide-react";
import { getModels } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FieldHint,
  SectionLabel,
  SettingsCard,
} from "@/components/settings/settings-ui";
import { SETTINGS_PRIMARY_BUTTON_CLASS } from "@/components/settings/settings-core";
import BriefingSchedulesCard from "@/components/settings/cards/BriefingSchedulesCard";
import ImportantSendersCard from "@/components/settings/cards/ImportantSendersCard";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export default function BriefingSettingsSection({ settings, setSettings, patch }) {
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const ensureModelsLoaded = useCallback(() => {
    if (models.length > 0 || modelsLoading) return;
    setModelsLoading(true);
    getModels().then(setModels).catch(() => {}).finally(() => setModelsLoading(false));
  }, [models.length, modelsLoading]);

  const selectedModel = settings?.claude_model || DEFAULT_MODEL;
  const fallbackModelOption = {
    id: selectedModel,
    name: models.find((model) => model.id === selectedModel)?.name || selectedModel,
  };
  const modelOptions = models.length > 0 ? models : [fallbackModelOption];
  const emailInterests = settings?.email_interests || [];

  return (
    <>
      <SettingsCard
        title="Claude Model"
        icon={<Bot size={14} />}
        description="Model used for briefing generation. Haiku is cheapest; Sonnet is more capable."
      >
        <Select
          value={selectedModel}
          onValueChange={(value) => {
            setSettings((current) => ({ ...(current || {}), claude_model: value }));
            patch({ claude_model: value });
          }}
          onOpenChange={(open) => {
            if (open) ensureModelsLoaded();
          }}
        >
          <SelectTrigger
            className="w-full bg-input/30 hover:bg-input/50"
            onFocus={ensureModelsLoaded}
            onPointerDown={ensureModelsLoaded}
            aria-label="Select Claude model"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align="start"
            className="bg-[#16161e] shadow-[0_20px_60px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.08]"
          >
            {modelOptions.map((model) => (
              <SelectItem key={model.id} value={model.id} className="text-[13px]">
                {model.name || model.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modelsLoading ? (
          <FieldHint className="mt-2">Loading available models…</FieldHint>
        ) : null}
      </SettingsCard>

      <SettingsCard
        title="Email Lookback"
        icon={<Clock size={14} />}
        description="Controls how far back briefing generation looks when gathering email context."
      >
        <div className="flex flex-wrap items-center gap-3">
          <SectionLabel className="mb-0 whitespace-nowrap">Fetch emails from the last</SectionLabel>
          <Input
            type="number"
            min="1"
            max="72"
            value={settings?.email_lookback_hours ?? 16}
            onChange={(event) => {
              const value = Math.max(1, Math.min(72, parseInt(event.target.value, 10) || 16));
              setSettings((current) => ({ ...(current || {}), email_lookback_hours: value }));
              patch({ email_lookback_hours: value });
            }}
            className="w-[80px] text-center"
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
          />
          <span className="text-[13px] text-muted-foreground/70">hours</span>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Email Interests"
        icon={<Tag size={14} />}
        description="Senders, brands, or keywords that should never be classified as noise."
      >
        <div className="flex flex-col gap-3">
          {emailInterests.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {emailInterests.map((tagValue, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.1] px-2.5 py-1 text-[11px] font-medium text-primary"
                >
                  {tagValue}
                  <button
                    type="button"
                    onClick={() => {
                      const nextInterests = settings.email_interests.filter((_, currentIndex) => currentIndex !== index);
                      setSettings((current) => ({ ...(current || {}), email_interests: nextInterests }));
                      patch({ email_interests_json: nextInterests });
                    }}
                    className="inline-flex items-center bg-transparent text-primary/60 transition-colors hover:text-primary"
                    aria-label={`Remove ${tagValue}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/[0.1] px-3 py-3 text-[12px] text-muted-foreground/60">
              No interests saved yet.
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const input = event.target.elements.interest;
              const value = input.value.trim();
              if (!value) return;
              const nextInterests = [...emailInterests, value];
              setSettings((current) => ({ ...(current || {}), email_interests: nextInterests }));
              input.value = "";
              patch({ email_interests_json: nextInterests });
            }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <Input name="interest" placeholder="e.g. Da Vien, Anthropic, GitHub…" className="flex-1" />
            <Button type="submit" size="sm" className={SETTINGS_PRIMARY_BUTTON_CLASS}>
              Add
            </Button>
          </form>
        </div>
      </SettingsCard>

      <ImportantSendersCard />
      <BriefingSchedulesCard settings={settings} setSettings={setSettings} patch={patch} />
    </>
  );
}
