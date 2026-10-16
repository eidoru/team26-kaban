import { Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ReceiptText } from "lucide-react";
import { api } from "../../api/client";
import { groupKey } from "../../lib/groupQueries";
import { MoneyOverview, Trends } from "./dashboard/StatsSections";
import { RecordsSection } from "./records/RecordsSections";
import { PageLink } from "./GroupDetails";
import { useGroupShell } from "./groupShell";

/**
 * The paluwagan's numbers and downloads, off the main page so it stays about this round: the
 * organizer's money overview and round trends (§15.1), and the records everyone can download (§14).
 */
export function MoneyRecordsPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { detail } = useGroupShell();
  const started =
    detail.group.state === "ACTIVE" ||
    detail.group.state === "COMPLETED" ||
    detail.group.state === "COMPLETED_WITH_OUTSTANDING_DEBT";
  // Same key as the group page's, so a group refresh (realtime included) refreshes it too.
  const { data: stats } = useQuery({
    queryKey: [...groupKey(id), "stats"],
    queryFn: () => api.stats(id),
    enabled: started && detail.viewer.isOrganizer,
  });

  if (!started) return <Navigate to={`/groups/${id}`} replace />;
  const { group, viewer } = detail;

  return (
    <div className="space-y-8">
      {/* The view navigation names this page; the title is for screen readers only. */}
      <h2 className="sr-only">Money &amp; records</h2>
      {viewer.isOrganizer && stats && (
        <>
          {/* Once it's finished the Recap carries these totals, so they show only while it runs. */}
          {group.state === "ACTIVE" && <MoneyOverview stats={stats} />}
          <Trends stats={stats} />
        </>
      )}
      <RecordsSection detail={detail} />
      <PageLink to={`/groups/${id}/history`} icon={ReceiptText} title="Your history" note="Every payment, debt change and payout for your slot" />
    </div>
  );
}
