import InboxDesktopPane from "./InboxDesktopPane";
import MobileInboxView from "./mobile/MobileInboxView";
import useInboxController from "./useInboxController";

export default function InboxView({
  accent,
  customize,
  emailAccounts,
  briefingSummary,
  briefingGeneratedAt,
  liveEmails = [],
  pinnedIds,
  pinnedSnapshots = [],
  snoozedEntries = [],
  resurfacedEntries = [],
  onOpenDashboard,
  onRefresh,
  seedSelectedId,
  isMobile = false,
}) {
  const controller = useInboxController({
    emailAccounts,
    liveEmails,
    pinnedIds,
    pinnedSnapshots,
    snoozedEntries,
    resurfacedEntries,
    seedSelectedId,
    customize,
    isMobile,
    briefingGeneratedAt,
  });

  const sharedProps = {
    accent,
    briefingSummary,
    briefingGeneratedAt,
    emailAccounts,
    onOpenDashboard,
    onRefresh,
    ...controller,
  };

  if (isMobile) return <MobileInboxView {...sharedProps} />;
  return <InboxDesktopPane {...sharedProps} />;
}
