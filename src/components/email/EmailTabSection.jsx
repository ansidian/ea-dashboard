import { useState } from "react";
import { cn } from "@/lib/utils";
import Section from "../layout/Section";
import EmailSection from "./EmailSection";
import LiveEmailSection from "./LiveEmailSection";
import { useDashboard } from "../../context/DashboardContext";

export default function EmailTabSection({
  summary, model, emails, briefingGeneratedAt, loaded, delay, className,
}) {
  const [activeTab, setActiveTab] = useState("briefing");
  const { emailSectionRef } = useDashboard();

  const liveCount = emails?.length || 0;

  return (
    <>
      <div ref={emailSectionRef} />
      <Section title="Email" delay={delay} loaded={loaded} className={className}>
        {/* Tab bar */}
        <div
          className="flex gap-0.5 mb-4 rounded-lg p-[3px]"
          style={{ background: "rgba(255,255,255,0.02)" }}
        >
          <button
            onClick={() => setActiveTab("briefing")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-[11px] font-medium cursor-pointer transition-all duration-150 border font-[inherit]",
              activeTab === "briefing"
                ? "font-semibold"
                : "border-transparent bg-transparent",
            )}
            style={activeTab === "briefing" ? {
              color: "#cba6da",
              background: "rgba(203,166,218,0.07)",
              borderColor: "rgba(203,166,218,0.2)",
            } : {
              color: "rgba(255,255,255,0.35)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            Briefing
          </button>
          <button
            onClick={() => setActiveTab("live")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-[11px] font-medium cursor-pointer transition-all duration-150 border font-[inherit]",
              activeTab === "live"
                ? "font-semibold"
                : "border-transparent bg-transparent",
            )}
            style={activeTab === "live" ? {
              color: "rgba(99,102,241,0.9)",
              background: "rgba(99,102,241,0.07)",
              borderColor: "rgba(99,102,241,0.2)",
            } : {
              color: "rgba(255,255,255,0.35)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Live
            {activeTab !== "live" && liveCount > 0 && (
              <span
                className="text-[10px] font-bold tabular-nums rounded-full min-w-[16px] text-center"
                style={{
                  padding: "1px 5px",
                  background: "rgba(99,102,241,0.15)",
                  color: "rgba(99,102,241,0.9)",
                }}
              >
                {liveCount}
              </span>
            )}
            {activeTab === "live" && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: "rgba(99,102,241,0.6)" }}
              />
            )}
          </button>
        </div>

        {/* Tab content — display:none preserves state across tab switches */}
        <div style={{ display: activeTab === "briefing" ? "block" : "none" }}>
          <EmailSection
            summary={summary}
            model={model}
            loaded={loaded}
            delay={delay}
            embedded
          />
        </div>
        <div style={{ display: activeTab === "live" ? "block" : "none" }}>
          <LiveEmailSection
            emails={emails}
            briefingGeneratedAt={briefingGeneratedAt}
            loaded={loaded}
            delay={delay}
            embedded
          />
        </div>
      </Section>
    </>
  );
}
