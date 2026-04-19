import { Database } from "lucide-react";
import ApiTokensCard from "@/components/settings/cards/ApiTokensCard";
import {
  SettingsCard,
  StatusPill,
  SURFACE_ROW_CLASS,
} from "@/components/settings/settings-ui";
import { cn } from "@/lib/utils";

export default function SystemSettingsSection({ settings }) {
  return (
    <>
      <SettingsCard
        title="Search & Historical Context"
        icon={<Database size={14} />}
        description="Embeddings power historical retrieval for trends, repeated senders, and recurring briefing context."
      >
        <div className="flex flex-col gap-2">
          <div className={cn(SURFACE_ROW_CLASS, "flex items-center justify-between gap-3 px-3 py-3")}>
            <div className="text-[13px] text-foreground/85">OpenAI embeddings</div>
            {settings?.openai_available ? (
              <StatusPill tone="success">Connected</StatusPill>
            ) : (
              <StatusPill tone="warning">Set OPENAI_API_KEY</StatusPill>
            )}
          </div>
          <div className={cn(SURFACE_ROW_CLASS, "flex items-center justify-between gap-3 px-3 py-3")}>
            <div className="text-[13px] text-foreground/85">Indexed chunks</div>
            <StatusPill tone={(settings?.embedding_count ?? 0) > 0 ? "success" : "neutral"}>
              {settings?.embedding_count ?? 0}
            </StatusPill>
          </div>
        </div>
      </SettingsCard>

      <ApiTokensCard />
    </>
  );
}
