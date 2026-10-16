import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "../../api/client";
import { groupKey, useGroup } from "../../lib/groupQueries";
import { ui } from "../../lib/ui";
import { MoneyOverview, Trends } from "./dashboard/StatsSections";
import { RecordsSection } from "./records/RecordsSections";

/**
 * The paluwagan's numbers and downloads, off the main page so it stays about this round: the
 * organizer's money overview and round trends (§15.1), and the records everyone can download (§14).
 */
export function MoneyRecordsPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: detail } = useGroup(id);
  const started =
    detail?.group.state === "ACTIVE" ||
    detail?.group.state === "COMPLETED" ||
    detail?.group.state === "COMPLETED_WITH_OUTSTANDING_DEBT";
  // Same key as the group page's, so a group refresh (realtime included) refreshes it too.
  const { data: stats } = useQuery({
    queryKey: [...groupKey(id), "stats"],
    queryFn: () => api.stats(id),
    enabled: started && !!detail?.viewer.isOrganizer,
  });

  if (!detail) return <div className={`${ui.skeleton} h-96`} aria-busy />;
  if (!started) return <Navigate to={`/groups/${id}`} replace />;
  const { group, viewer } = detail;

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/groups/${id}`} className={`${ui.btnGhost} mb-4`}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {group.name}
        </Link>
        <h1 className={ui.pageTitle}>Money &amp; records</h1>
        <p className={ui.pageSubtitle}>
          {viewer.isOrganizer
            ? "What's been collected and paid out, how each round went, and the records to download."
            : "Your statement and the paluwagan's summary, to download."}
        </p>
      </div>
      {viewer.isOrganizer && stats && (
        <>
          {/* Once it's finished the Recap carries these totals, so they show only while it runs. */}
          {group.state === "ACTIVE" && <MoneyOverview stats={stats} />}
          <Trends stats={stats} />
        </>
      )}
      <RecordsSection detail={detail} />
    </div>
  );
}
