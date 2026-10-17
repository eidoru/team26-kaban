import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../../api/client";
import { Avatar } from "../../components/Avatar";
import { Spinner } from "../../components/Splash";
import { useAuth } from "../../context/useAuth";
import { useDialog } from "../../context/useDialog";
import { invalidateHomeLists } from "../../lib/homeQueries";
import { clearPendingLink, stashPendingLink } from "../../lib/pendingInvite";
import { ui } from "../../lib/ui";
import { JoinShell, LinkProblem, Ticket } from "./Ticket";

/**
 * §5.4: claiming a placeholder. The visitor sees the slot's whole record before confirming
 * (R-CLM-05), because they inherit all of it (R-CLM-06).
 */
export function ClaimPage() {
  const { token = "" } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const dialog = useDialog();
  const queryClient = useQueryClient();
  const [claimError, setClaimError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const { data, error, isPending } = useQuery({
    queryKey: ["claim", token, user?.id ?? null],
    queryFn: () => api.getClaim(token),
    retry: false,
  });
  useEffect(() => {
    if (data) clearPendingLink();
  }, [data]);

  if (isPending) {
    return (
      <JoinShell>
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </JoinShell>
    );
  }
  if (error || !data) {
    return (
      <JoinShell>
        <LinkProblem
          title="This claim link doesn't work"
          body={
            error instanceof ApiError && error.status === 404
              ? "The organizer may have turned it off or made a new one. Ask them for the latest link."
              : "Check your connection and try again."
          }
        />
      </JoinShell>
    );
  }

  const { group, placeholder } = data;
  const name = placeholder.name ?? "this placeholder";

  async function claim() {
    const confirmed = await dialog.confirm({
      title: `Claim ${name}'s slot?`,
      description: `You take over this slot in ${group.name}: its payout turn and everything recorded for it.`,
      confirmLabel: "Claim slot",
    });
    if (!confirmed) return;
    setClaiming(true);
    setClaimError("");
    try {
      const result = await api.claimPlaceholder(token);
      invalidateHomeLists(queryClient);
      navigate(`/groups/${result.groupId}`, { replace: true });
    } catch (err) {
      setClaimError(err instanceof ApiError ? err.message : "Couldn't claim the slot. Try again.");
      void queryClient.invalidateQueries({ queryKey: ["claim", token] });
    } finally {
      setClaiming(false);
    }
  }

  function goAuth(path: "/login" | "/register") {
    stashPendingLink({ kind: "claim", token });
    navigate(path);
  }

  return (
    <JoinShell>
      <Ticket group={group} eyebrow={<>{group.organizerName} saved a slot for {name}</>}>
        <section aria-label="This slot's record" className="mb-5 rounded-2xl bg-ink-50 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={name} size="md" placeholder />
            <div>
              <p className="text-sm font-bold text-ink-900">{name}</p>
              <p className="text-xs text-ink-500">
                {placeholder.position
                  ? `Gets payout ${placeholder.position} of ${group.slotCount}`
                  : "Payout turn not set yet"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-600">
            {group.state === "LOBBY" || group.state === "LAUNCHED"
              ? "No payments have been recorded for this slot yet."
              : "Payments recorded for this slot will show here."}
          </p>
        </section>

        {data.status === "CLAIMED" ? (
          <p className="text-center text-sm text-ink-700">
            <b>Someone already claimed this slot.</b> Each claim link works once.
          </p>
        ) : data.status === "CLOSED" ? (
          <p className="text-center text-sm text-ink-700">
            <b>This paluwagan has ended,</b> so its slots can't be claimed anymore.
          </p>
        ) : data.status === "ALREADY_MEMBER" ? (
          <p className="text-center text-sm text-ink-700">
            <b>You already have a slot in {group.name}.</b> One person can hold only one slot.{" "}
            <Link to={`/groups/${group.id}`} className={ui.link}>
              Open it
            </Link>
          </p>
        ) : !user ? (
          <div className="space-y-2">
            <button type="button" onClick={() => goAuth("/login")} className={`${ui.btnPrimaryFull} min-h-11`}>
              Log in to claim
            </button>
            <button type="button" onClick={() => goAuth("/register")} className={`${ui.btnSecondaryFull} min-h-11`}>
              Register to claim
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button type="button" onClick={() => void claim()} disabled={claiming} className={`${ui.btnPrimaryFull} min-h-11`}>
              {claiming ? "Claiming…" : `Claim as ${user.displayName}`}
            </button>
            {claimError && <p className={ui.error}>{claimError}</p>}
          </div>
        )}
      </Ticket>
    </JoinShell>
  );
}
