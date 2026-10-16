import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../../api/client";
import { Spinner } from "../../components/Splash";
import { useAuth } from "../../context/AuthContext";
import { invalidateHomeLists } from "../../lib/homeQueries";
import { clearPendingLink, stashPendingLink } from "../../lib/pendingInvite";
import { ui } from "../../lib/ui";
import { JoinShell, LinkProblem, Ticket } from "./Ticket";

/** §5.3: the invite landing page, for guests and signed-in visitors. */
export function InvitePage() {
  const { token = "" } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [searchParams] = useSearchParams();
  const { data, error, isPending } = useQuery({
    queryKey: ["invite", token, user?.id ?? null],
    queryFn: () => api.getInvite(token),
    retry: false,
  });

  const join = useCallback(async () => {
    setJoining(true);
    setJoinError("");
    try {
      const result = await api.joinViaInvite(token);
      invalidateHomeLists(queryClient);
      navigate(`/groups/${result.groupId}`, { replace: true });
    } catch (err) {
      setJoinError(err instanceof ApiError ? err.message : "Couldn't join. Try again.");
      void queryClient.invalidateQueries({ queryKey: ["invite", token] });
    } finally {
      setJoining(false);
    }
  }, [navigate, queryClient, token]);

  // Arriving here after signing in to join (?join=1) finishes the join without another tap (R-INV-02).
  const autoJoined = useRef(false);
  const autoJoin = searchParams.get("join") === "1" && !!user && data?.status === "OPEN";
  useEffect(() => {
    if (data) clearPendingLink();
    if (!autoJoin || autoJoined.current) return;
    autoJoined.current = true;
    void join();
  }, [data, autoJoin, join]);

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
          title="This invite link doesn't work"
          body={
            error instanceof ApiError && error.status === 404
              ? "It may have been replaced by a newer link, or the paluwagan has launched. Ask the organizer for a fresh one."
              : "Check your connection and try again."
          }
        />
      </JoinShell>
    );
  }
  // R-INV-04
  if (data.status === "ALREADY_MEMBER") return <Navigate to={`/groups/${data.group.id}`} replace />;

  const { group } = data;

  function goAuth(path: "/login" | "/register") {
    stashPendingLink({ kind: "invite", token });
    navigate(path);
  }

  return (
    <JoinShell>
      <Ticket group={group} eyebrow={<>{group.organizerName} invites you to join</>}>
        {data.status === "FULL" ? (
          <p className="text-center text-sm text-ink-700">
            <b>This paluwagan is full.</b> The link works again if a slot opens up.
          </p>
        ) : data.status === "CLOSED" ? (
          <p className="text-center text-sm text-ink-700">
            <b>It's no longer taking members.</b> It has already launched or was cancelled.
          </p>
        ) : !user ? (
          <div className="space-y-2">
            <button type="button" onClick={() => goAuth("/login")} className={`${ui.btnPrimaryFull} min-h-11`}>
              Log in to join
            </button>
            <button type="button" onClick={() => goAuth("/register")} className={`${ui.btnSecondaryFull} min-h-11`}>
              Register to join
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button type="button" onClick={() => void join()} disabled={joining} className={`${ui.btnPrimaryFull} min-h-11`}>
              {joining ? "Joining…" : `Join as ${user.displayName}`}
            </button>
            {joinError && <p className={ui.error}>{joinError}</p>}
            <p className="text-center text-xs text-ink-500">
              You can leave any time before it launches. <Link to="/home" className={ui.link}>Not now</Link>
            </p>
          </div>
        )}
      </Ticket>
    </JoinShell>
  );
}
