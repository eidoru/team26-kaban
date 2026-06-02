import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type GroupDetail, type GroupMember, type MemberReliability } from "../api/client";
import { useDialog } from "../context/DialogContext";
import { formatFrequency } from "../lib/frequency";
import { clearGroupQueries, deferContributionSideEffects, deferStructureSideEffects, groupQueryKey, groupSupplementalQueryOptions, invalidateGroupIssues, invalidateGroupShell, isGroupNotFoundError, mergeCurrentRoundIntoGroupCache, OPTIMISTIC_MEMBER_ID, patchConfirmedContribution, patchGroupCurrentRoundContribution, patchMemberAdded, patchMemberRemoved, patchPayoutOrder, patchRecordedContribution, patchReportedContribution, applyManualTurnOrder, refreshGroupView, shuffleMemberTurnOrder, shouldRetryGroupQuery } from "../lib/groupQueries";
import { isSupabaseRealtimeConfigured } from "../lib/supabaseClient";
import { isRealtimeFallbackNeeded, useGroupRealtime, type GroupRealtimeScope } from "../lib/useGroupRealtime";
import { ui } from "../lib/ui";
import { GroupCycleTabPanels, type CycleTab } from "./GroupCycleTabs";
import {
  GroupHeader,
  GroupSectionLayout,
  type GroupFact,
  type GroupPhase,
} from "../components/GroupChrome";
import { FormingManagerPanel, FormingMemberPanel, formatGroupDate } from "./FormingPhase";

export function GroupLobbyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dialog = useDialog();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [claimUrls, setClaimUrls] = useState<Record<string, string>>({});
  const [addName, setAddName] = useState("");
  const [addContact, setAddContact] = useState("");
  const [formError, setFormError] = useState("");
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [manualOrder, setManualOrder] = useState<Record<string, number>>({});
  const [payoutDraftActive, setPayoutDraftActive] = useState(false);
  const [cycleTab, setCycleTab] = useState<CycleTab>("overview");

  useEffect(() => {
    setCycleTab("overview");
    setPayoutDraftActive(false);
    setManualOrder({});
  }, [id]);

  const { data, isPending, error } = useQuery({
    queryKey: ["group", id],
    queryFn: () => api.getGroup(id!),
    enabled: !!id,
    retry: shouldRetryGroupQuery,
    staleTime: 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: (query) => {
      if (isGroupNotFoundError(query.state.error)) return false;
      return query.state.data?.group.status === "forming" || query.state.data?.group.status === "active";
    },
  });

  const groupUnavailable = isGroupNotFoundError(error);
  const groupLoaded = !!data && !groupUnavailable;
  const groupStatus = data?.group.status;
  const cycleStarted = groupLoaded && data.group.status !== "forming";

  const isManagerView = data?.group.role === "manager";

  const handleGroupRealtimeUpdate = useCallback(
    (scope: GroupRealtimeScope) => {
      if (!id) return;
      if (scope === "contributions") {
        void api.getCurrentRound(id).then(({ currentRound }) => {
          mergeCurrentRoundIntoGroupCache(queryClient, id, currentRound);
          deferContributionSideEffects(queryClient, id);
        });
        return;
      }
      if (scope === "memberships" && groupStatus === "forming") {
        void queryClient.invalidateQueries({ queryKey: groupQueryKey(id) });
        return;
      }
      void refreshGroupView(queryClient, id);
    },
    [id, queryClient, groupStatus],
  );

  const { realtimeActive, tokenFailed } = useGroupRealtime({
    groupId: id,
    enabled: groupLoaded && (groupStatus === "active" || groupStatus === "forming"),
    currentRoundId: data?.currentRound?.id,
    onUpdate: handleGroupRealtimeUpdate,
  });

  const needsFallbackSync = isRealtimeFallbackNeeded(
    isSupabaseRealtimeConfigured(),
    realtimeActive,
    tokenFailed,
  );

  useQuery({
    queryKey: ["group-fallback-sync", id],
    queryFn: async () => {
      await refreshGroupView(queryClient, id!);
      return null;
    },
    enabled: !!id && groupLoaded && groupStatus === "active",
    refetchInterval: needsFallbackSync ? 15_000 : 30_000,
    refetchOnWindowFocus: false,
    retry: shouldRetryGroupQuery,
  });

  const { data: ledgerData } = useQuery({
    queryKey: ["ledger", id],
    queryFn: () => api.getLedger(id!),
    enabled: !!id && groupLoaded && cycleStarted && cycleTab === "ledger",
    retry: shouldRetryGroupQuery,
    ...groupSupplementalQueryOptions,
  });

  const { data: auditData } = useQuery({
    queryKey: ["audit-log", id],
    queryFn: () => api.getAuditLog(id!),
    enabled: !!id && groupLoaded && cycleStarted && isManagerView && cycleTab === "audit",
    retry: shouldRetryGroupQuery,
    ...groupSupplementalQueryOptions,
  });

  const { data: obligationsData } = useQuery({
    queryKey: ["obligations", id],
    queryFn: () => api.getObligations(id!),
    enabled: !!id && groupLoaded && cycleStarted && cycleTab === "issues",
    retry: shouldRetryGroupQuery,
    ...groupSupplementalQueryOptions,
  });

  const { data: disputesData } = useQuery({
    queryKey: ["disputes", id],
    queryFn: () => api.getDisputes(id!),
    enabled: !!id && groupLoaded && cycleStarted && cycleTab === "issues",
    retry: shouldRetryGroupQuery,
    ...groupSupplementalQueryOptions,
  });

  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard", id],
    queryFn: () => api.getDashboard(id!),
    enabled:
      !!id &&
      groupLoaded &&
      cycleStarted &&
      isManagerView &&
      cycleTab === "overview" &&
      groupStatus === "active",
    retry: shouldRetryGroupQuery,
    ...groupSupplementalQueryOptions,
  });

  const isCompleted = groupLoaded && data.group.status === "completed";

  const { data: completionData, isLoading: completionSummaryLoading, isError: completionSummaryError } = useQuery({
    queryKey: ["completion-summary", id],
    queryFn: () => api.getCompletionSummary(id!),
    enabled: !!id && groupLoaded && isCompleted && cycleTab === "overview",
    retry: shouldRetryGroupQuery,
    ...groupSupplementalQueryOptions,
  });

  const { data: reliabilityData } = useQuery({
    queryKey: ["member-reliability", id],
    queryFn: () => api.getMemberReliability(id!),
    enabled: !!id && groupLoaded && cycleStarted && cycleTab === "members",
    retry: shouldRetryGroupQuery,
    ...groupSupplementalQueryOptions,
  });

  const redirectedForMissingGroup = useRef(false);
  useEffect(() => {
    redirectedForMissingGroup.current = false;
  }, [id]);

  useEffect(() => {
    if (!id || !groupUnavailable || redirectedForMissingGroup.current) return;
    redirectedForMissingGroup.current = true;
    void (async () => {
      await clearGroupQueries(queryClient, id);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["home-overview"] });
      navigate("/home", { replace: true });
    })();
  }, [groupUnavailable, id, navigate, queryClient]);

  const invalidateIssues = () => {
    if (!id) return;
    invalidateGroupIssues(queryClient, id);
    void queryClient.invalidateQueries({ queryKey: ["ledger", id] });
    void queryClient.invalidateQueries({ queryKey: ["audit-log", id] });
  };

  const invalidateStructure = () => {
    if (!id) return;
    invalidateGroupShell(queryClient, id);
  };

  const addMember = useMutation({
    mutationFn: (body: { displayName: string; contact?: string }) =>
      api.addPlaceholder(id!, body),
    onMutate: async (body) => {
      if (!id) return;
      await queryClient.cancelQueries({ queryKey: groupQueryKey(id) });
      const previous = queryClient.getQueryData<GroupDetail>(groupQueryKey(id));
      patchMemberAdded(queryClient, id, {
        id: OPTIMISTIC_MEMBER_ID,
        displayName: body.displayName,
        contact: body.contact ?? null,
        isManager: false,
        isPlaceholder: true,
        userId: null,
        turnNumber: null,
      });
      return { previous };
    },
    onSuccess: (data) => {
      if (!id) return;
      patchMemberAdded(queryClient, id, data.member);
      deferStructureSideEffects(queryClient, id);
    },
    onError: (_err, _body, context) => {
      if (!id || !context?.previous) return;
      queryClient.setQueryData(groupQueryKey(id), context.previous);
    },
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => api.removeMember(id!, memberId),
    onMutate: async (memberId) => {
      if (!id) return;
      await queryClient.cancelQueries({ queryKey: groupQueryKey(id) });
      const previous = queryClient.getQueryData<GroupDetail>(groupQueryKey(id));
      patchMemberRemoved(queryClient, id, memberId);
      return { previous, memberId };
    },
    onSuccess: (_data, memberId) => {
      if (!id) return;
      deferStructureSideEffects(queryClient, id);
      void queryClient.invalidateQueries({ queryKey: groupQueryKey(id) });
      setClaimUrls((prev) => {
        if (!(memberId in prev)) return prev;
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    },
    onError: (_err, _memberId, context) => {
      if (!id || !context?.previous) return;
      queryClient.setQueryData(groupQueryKey(id), context.previous);
    },
  });

  const groupInvite = useMutation({
    mutationFn: () => api.createInvite(id!, { type: "group_invite" }),
  });

  const claimInvite = useMutation({
    mutationFn: (membershipId: string) =>
      api.createInvite(id!, { type: "membership_claim", membershipId }),
  });

  const leaveGroup = useMutation({
    mutationFn: () => api.leaveGroup(id!),
  });

  const deleteGroup = useMutation({
    mutationFn: () => api.deleteGroup(id!),
  });

  const persistPayoutOrder = useMutation({
    mutationFn: (order: { membershipId: string; turnNumber: number }[]) =>
      api.setPayoutOrder(id!, { method: "manual", order }),
  });

  const saveStartDate = useMutation({
    mutationFn: (date: string) => api.setStartDate(id!, date),
  });

  const activate = useMutation({
    mutationFn: (body?: { startDate?: string }) => api.activateGroup(id!, body),
  });

  const advanceRound = useMutation({
    mutationFn: () => api.advanceRound(id!),
  });

  const showDemoTools = import.meta.env.DEV;

  const sortedMembers = useMemo(() => {
    if (!data?.members) return [];
    return [...data.members].sort((a, b) => {
      if (a.turnNumber != null && b.turnNumber != null) return a.turnNumber - b.turnNumber;
      if (a.turnNumber != null) return -1;
      if (b.turnNumber != null) return 1;
      return 0;
    });
  }, [data?.members]);

  if (isPending && !data) return <p className={ui.muted}>Loading group…</p>;
  if (groupUnavailable) return <p className={ui.muted}>This paluwagan is no longer available…</p>;
  if (error || !data) {
    return (
      <div>
        <p className={ui.error}>
          {error instanceof ApiError ? error.message : "Failed to load group"}
        </p>
        <Link to="/home" className={`mt-4 inline-block ${ui.backLink}`}>
          <span className={ui.backLinkArrow}>←</span>
          Back to home
        </Link>
      </div>
    );
  }

  const { group, members, pending, currentRound, schedule } = data;
  const isManager = group.role === "manager";
  const isForming = group.status === "forming";
  const isActive = group.status === "active";
  const reliability = reliabilityData?.reliability ?? [];
  const reliabilityByMember = new Map(reliability.map((r: MemberReliability) => [r.membershipId, r]));
  const displayStartDate =
    startDate || (group.startDate ? String(group.startDate).slice(0, 10) : "");

  async function promptPartialAmount(expected: string): Promise<number | undefined | null> {
    const input = await dialog.prompt({
      title: "Amount paid",
      description: `Leave blank for the full ₱${Number(expected).toLocaleString()}.`,
      label: "Amount (₱)",
      placeholder: "Full amount",
      submitLabel: "Continue",
      validate: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const amount = Number(trimmed);
        if (Number.isNaN(amount) || amount <= 0) return "Enter a valid positive amount.";
        return null;
      },
    });
    if (input == null) return null;
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    return Number(trimmed);
  }

  async function handleReportPayment(contributionId: string, expectedAmount: string) {
    setFormError("");
    const amount = await promptPartialAmount(expectedAmount);
    if (amount === null) return;

    const groupKey = groupQueryKey(id!);
    const previous = queryClient.getQueryData<GroupDetail>(groupKey);
    const paidAmount = amount != null ? String(amount) : undefined;

    patchGroupCurrentRoundContribution(queryClient, id!, contributionId, (c) =>
      patchReportedContribution(c, paidAmount, { isManager }),
    );

    setActionPending(contributionId);
    try {
      const res = await api.reportContribution(id!, contributionId, amount != null ? { amount } : undefined);
      patchGroupCurrentRoundContribution(queryClient, id!, contributionId, (c) =>
        patchReportedContribution({ ...c, ...res.contribution }, res.contribution.amount, { isManager }),
      );
      deferContributionSideEffects(queryClient, id!);
    } catch (err) {
      if (previous) queryClient.setQueryData(groupKey, previous);
      setFormError(err instanceof ApiError ? err.message : "Failed to report payment");
    } finally {
      setActionPending(null);
    }
  }

  async function handleConfirmPayment(contributionId: string) {
    setFormError("");

    const groupKey = groupQueryKey(id!);
    const previous = queryClient.getQueryData<GroupDetail>(groupKey);

    patchGroupCurrentRoundContribution(queryClient, id!, contributionId, patchConfirmedContribution);

    setActionPending(contributionId);
    try {
      const res = await api.confirmContribution(id!, contributionId);
      patchGroupCurrentRoundContribution(queryClient, id!, contributionId, (c) =>
        patchConfirmedContribution({ ...c, ...res.contribution }),
      );
      deferContributionSideEffects(queryClient, id!);
    } catch (err) {
      if (previous) queryClient.setQueryData(groupKey, previous);
      setFormError(err instanceof ApiError ? err.message : "Failed to confirm payment");
    } finally {
      setActionPending(null);
    }
  }

  async function handleRecordPayment(contributionId: string, expectedAmount: string) {
    setFormError("");
    const amount = await promptPartialAmount(expectedAmount);
    if (amount === null) return;

    const groupKey = groupQueryKey(id!);
    const previous = queryClient.getQueryData<GroupDetail>(groupKey);
    const paidAmount = amount != null ? String(amount) : undefined;

    patchGroupCurrentRoundContribution(queryClient, id!, contributionId, (c) =>
      patchRecordedContribution(c, paidAmount),
    );

    setActionPending(contributionId);
    try {
      const res = await api.recordContribution(id!, contributionId, amount != null ? { amount } : undefined);
      patchGroupCurrentRoundContribution(queryClient, id!, contributionId, (c) =>
        patchRecordedContribution({ ...c, ...res.contribution }, res.contribution.amount),
      );
      deferContributionSideEffects(queryClient, id!);
    } catch (err) {
      if (previous) queryClient.setQueryData(groupKey, previous);
      setFormError(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setActionPending(null);
    }
  }

  async function handleSettleMemberDebts(memberId: string, memberName: string) {
    setFormError("");
    const result = await dialog.settleDebt({
      title: `Settle debt for ${memberName}`,
      description: "Enter the settlement amount and an optional note.",
    });
    if (result == null) return;
    setActionPending(`settle-${memberId}`);
    try {
      const settleResult = await api.settleMemberDebts(id!, memberId, {
        amount: result.amount,
        note: result.note,
      });
      invalidateIssues();
      const unapplied = Number(settleResult.unapplied);
      if (unapplied > 0) {
        await dialog.alert({
          title: "Partial settlement applied",
          description: `₱${Number(settleResult.applied).toLocaleString()} was applied to outstanding debt. ₱${unapplied.toLocaleString()} could not be applied (no remaining balance).`,
        });
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to settle debt");
    } finally {
      setActionPending(null);
    }
  }

  async function handleCoverObligationExternally(obligationId: string, memberName: string) {
    setFormError("");
    const note = await dialog.prompt({
      title: `Cover ${memberName}'s shortfall externally`,
      description:
        "Record that you fronted the round pot for this member. Their debt to you continues until settled.",
      label: "Note",
      required: true,
      multiline: true,
      submitLabel: "Record coverage",
    });
    if (note == null || !note.trim()) return;
    setActionPending(`cover-${obligationId}`);
    try {
      await api.coverObligationExternally(id!, obligationId, { note: note.trim() });
      invalidateIssues();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to record external coverage");
    } finally {
      setActionPending(null);
    }
  }

  async function handleRaiseDispute(contributionId: string, memberName: string) {
    setFormError("");
    const note = await dialog.prompt({
      title: "Raise dispute",
      description: `Why are you disputing ${memberName}'s payment?`,
      label: "Reason",
      required: true,
      multiline: true,
      submitLabel: "Submit dispute",
    });
    if (note == null || !note.trim()) return;
    setActionPending(`dispute-${contributionId}`);
    try {
      await api.raiseDispute(id!, contributionId, { note: note.trim() });
      invalidateIssues();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to raise dispute");
    } finally {
      setActionPending(null);
    }
  }

  async function handleResolveDispute(disputeId: string) {
    setFormError("");
    const resolution = await dialog.prompt({
      title: "Resolve dispute",
      label: "Resolution note",
      placeholder: "Describe how this was resolved",
      required: true,
      multiline: true,
      submitLabel: "Resolve",
    });
    if (resolution == null || !resolution.trim()) return;
    setActionPending(`resolve-${disputeId}`);
    try {
      await api.resolveDispute(id!, disputeId, resolution.trim());
      invalidateIssues();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to resolve dispute");
    } finally {
      setActionPending(null);
    }
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    const displayName = addName.trim();
    const contact = addContact.trim();
    if (!displayName) return;
    setAddName("");
    setAddContact("");
    try {
      await addMember.mutateAsync({
        displayName,
        contact: contact || undefined,
      });
    } catch (err) {
      setAddName(displayName);
      setAddContact(contact);
      setFormError(err instanceof ApiError ? err.message : "Failed to add member");
    }
  }

  async function handleRemoveMember(memberId: string) {
    setFormError("");
    try {
      await removeMember.mutateAsync(memberId);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to remove member");
    }
  }

  async function handleGroupInvite() {
    setFormError("");
    try {
      const res = await groupInvite.mutateAsync();
      setInviteUrl(res.invite.url);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create invite");
    }
  }

  async function handleClaimInvite(membershipId: string) {
    setFormError("");
    try {
      const res = await claimInvite.mutateAsync(membershipId);
      setClaimUrls((prev) => ({ ...prev, [membershipId]: res.invite.url }));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create claim link");
    }
  }

  async function handleLeave() {
    setFormError("");
    try {
      await leaveGroup.mutateAsync();
      await clearGroupQueries(queryClient, id!);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["home-overview"] });
      navigate("/home", { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to leave group");
    }
  }

  async function handleDeleteGroup() {
    const joinedMembers = members.filter((m) => !m.isManager && !m.isPlaceholder).length;
    const description =
      joinedMembers > 0
        ? `${joinedMembers} member${joinedMembers === 1 ? "" : "s"} will be notified and lose access. Invite links will stop working. This cannot be undone.`
        : "Invite links will stop working. This cannot be undone.";
    const confirmed = await dialog.confirm({
      title: `Delete "${group.name}"?`,
      description,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!confirmed) return;

    setFormError("");
    try {
      await deleteGroup.mutateAsync();
      await clearGroupQueries(queryClient, id!);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["home-overview"] });
      navigate("/home", { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to delete paluwagan");
    }
  }

  function syncManualOrderFromMembers(nextMembers: GroupMember[]) {
    setManualOrder(
      Object.fromEntries(
        nextMembers
          .filter((member) => member.turnNumber != null)
          .map((member) => [member.id, member.turnNumber as number]),
      ),
    );
  }

  function handleReorderMembers(orderedIds: string[]) {
    if (!id || !data?.members.length) return;
    const order = orderedIds.map((membershipId, index) => ({
      membershipId,
      turnNumber: index + 1,
    }));
    const nextManualOrder = Object.fromEntries(order.map((entry) => [entry.membershipId, entry.turnNumber]));
    setManualOrder(nextManualOrder);
    patchPayoutOrder(queryClient, id, applyManualTurnOrder(data.members, order));
    setPayoutDraftActive(true);
  }

  function handleBeginPayoutDraft() {
    if (!id || !data?.members.length || payoutDraftActive) return;
    const hasAnyTurn = data.members.some((member) => member.turnNumber != null);
    if (hasAnyTurn) {
      syncManualOrderFromMembers(data.members);
      setPayoutDraftActive(true);
      return;
    }
    const orderedIds = [...data.members]
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map((member) => member.id);
    handleReorderMembers(orderedIds);
  }

  async function handleRandomizeOrder() {
    if (!id) return;
    setFormError("");

    const current = queryClient.getQueryData<GroupDetail>(groupQueryKey(id));
    if (!current?.members.length) return;

    const shuffled = shuffleMemberTurnOrder(current.members);
    patchPayoutOrder(queryClient, id, shuffled);
    syncManualOrderFromMembers(shuffled);
    setPayoutDraftActive(true);
  }

  async function handleLockInPayoutOrder() {
    if (!id || !data?.members.length) return;
    setFormError("");

    const order = data.members.map((member) => ({
      membershipId: member.id,
      turnNumber: manualOrder[member.id] ?? member.turnNumber ?? 0,
    }));
    if (order.some((entry) => entry.turnNumber < 1)) {
      setFormError("Assign a turn number to every member");
      return;
    }

    try {
      const result = await persistPayoutOrder.mutateAsync(order);
      patchPayoutOrder(queryClient, id, result.members);
      deferStructureSideEffects(queryClient, id);
      syncManualOrderFromMembers(result.members);
      setPayoutDraftActive(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to lock in payout order");
    }
  }

  async function handleSaveStartDate() {
    setFormError("");
    if (!displayStartDate) {
      setFormError("Choose a start date");
      return;
    }
    try {
      await saveStartDate.mutateAsync(displayStartDate);
      invalidateStructure();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to save start date");
    }
  }

  const readyToActivate =
    pending.openSlots === 0 && !pending.payoutOrder && !!displayStartDate;

  const rosterFilled = group.filledCount ?? members.length;
  const rosterFillPercent =
    group.slotCount > 0 ? Math.min(100, Math.round((rosterFilled / group.slotCount) * 100)) : 0;

  async function handleActivate() {
    setFormError("");
    try {
      await activate.mutateAsync(displayStartDate ? { startDate: displayStartDate } : undefined);
      await refreshGroupView(queryClient, id!);
      void queryClient.invalidateQueries({ queryKey: ["member-reliability", id] });
      void queryClient.invalidateQueries({ queryKey: ["audit-log", id] });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to activate group");
    }
  }

  async function handleAdvanceRound() {
    if (!id) return;
    const confirmed = await dialog.confirm({
      title: "Advance round?",
      description:
        "This demo action closes the current round immediately, records any shortfalls, and opens the next payout.",
      confirmLabel: "Advance round",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!confirmed) return;

    setFormError("");
    try {
      const { group: nextGroup, completed, closedRound } = await advanceRound.mutateAsync();
      queryClient.setQueryData(groupQueryKey(id), nextGroup);
      void queryClient.invalidateQueries({ queryKey: ["dashboard", id] });
      void queryClient.invalidateQueries({ queryKey: ["ledger", id] });
      void queryClient.invalidateQueries({ queryKey: ["obligations", id] });
      void queryClient.invalidateQueries({ queryKey: ["disputes", id] });
      void queryClient.invalidateQueries({ queryKey: ["member-reliability", id] });
      void queryClient.invalidateQueries({ queryKey: ["audit-log", id] });
      void queryClient.invalidateQueries({ queryKey: ["completion-summary", id] });
      if (completed) {
        await dialog.alert({
          title: "Cycle complete",
          description: `Round ${closedRound} was the final payout. The paluwagan is now completed.`,
        });
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to advance round");
    }
  }

  const openDisputeCount = data?.issueCounts?.openDisputes ?? 0;
  const unsettledObligationCount = data?.issueCounts?.unsettledObligations ?? 0;
  const issuesCount = openDisputeCount + unsettledObligationCount;

  const cycleTabs: { id: CycleTab; label: string; badge?: number }[] = [
    { id: "overview", label: isActive ? "This round" : "Summary" },
    { id: "schedule", label: "Schedule" },
    { id: "ledger", label: "Ledger" },
    { id: "issues", label: "Issues", badge: issuesCount },
    { id: "members", label: "Members" },
    ...(isManager ? [{ id: "audit" as const, label: "Audit log" }] : []),
  ];

  const phase: GroupPhase = isForming ? "forming" : isActive ? "active" : "completed";
  const headerFacts: GroupFact[] = [
    { label: "Contribution", value: `₱${Number(group.contributionAmount).toLocaleString()}` },
    { label: "Schedule", value: formatFrequency(group.frequency, group.frequencyDays) },
    { label: "Roster", value: `${group.filledCount ?? members.length} / ${group.slotCount}` },
  ];
  if (isActive && currentRound) {
    headerFacts.push({
      label: "Current round",
      value: `#${currentRound.number} · due ${currentRound.dueDate}`,
    });
  } else if (isForming && displayStartDate) {
    headerFacts.push({ label: "Starts", value: formatGroupDate(displayStartDate) });
  }

  const headerAction =
    isManager && !isForming && issuesCount > 0 ? (
      <button type="button" onClick={() => setCycleTab("issues")} className={ui.btnSecondary}>
        {issuesCount} issue{issuesCount === 1 ? "" : "s"}
      </button>
    ) : undefined;

  return (
    <div className="min-w-0">
      <GroupHeader title={group.name} phase={phase} facts={headerFacts} action={headerAction} />

      {isForming && (
        <div className="space-y-6">
          {isManager ? (
            <FormingManagerPanel
              group={group}
              members={members}
              sortedMembers={sortedMembers}
              pending={pending}
              rosterFilled={rosterFilled}
              rosterFillPercent={rosterFillPercent}
              displayStartDate={displayStartDate}
              readyToActivate={readyToActivate}
              payoutDraftActive={payoutDraftActive}
              manualOrder={manualOrder}
              addName={addName}
              addContact={addContact}
              inviteUrl={inviteUrl}
              claimUrls={claimUrls}
              addMemberPending={addMember.isPending}
              removeMemberPending={removeMember.isPending}
              claimInvitePending={claimInvite.isPending}
              groupInvitePending={groupInvite.isPending}
              lockingInPayout={persistPayoutOrder.isPending}
              saveStartDatePending={saveStartDate.isPending}
              activatePending={activate.isPending}
              deleteGroupPending={deleteGroup.isPending}
              onAddNameChange={setAddName}
              onAddContactChange={setAddContact}
              onAddMember={handleAddMember}
              onRemoveMember={(memberId) => void handleRemoveMember(memberId)}
              onClaimInvite={(memberId) => void handleClaimInvite(memberId)}
              onGroupInvite={() => void handleGroupInvite()}
              onReorderMembers={handleReorderMembers}
              onRandomize={handleRandomizeOrder}
              onLockIn={() => void handleLockInPayoutOrder()}
              onBeginDraft={handleBeginPayoutDraft}
              onStartDateChange={setStartDate}
              onSaveStartDate={() => void handleSaveStartDate()}
              onActivate={() => void handleActivate()}
              onDeleteGroup={() => void handleDeleteGroup()}
            />
          ) : (
            <FormingMemberPanel
              group={group}
              members={members}
              sortedMembers={sortedMembers}
              pending={pending}
              rosterFilled={rosterFilled}
              rosterFillPercent={rosterFillPercent}
              displayStartDate={displayStartDate}
              onLeave={() => void handleLeave()}
              leavePending={leaveGroup.isPending}
            />
          )}

          {formError && <p className={ui.error}>{formError}</p>}
        </div>
      )}

      {cycleStarted && (
        <GroupSectionLayout
          items={cycleTabs}
          active={cycleTab}
          onSelect={(tabId) => setCycleTab(tabId as CycleTab)}
        >
          <GroupCycleTabPanels
            cycleTab={cycleTab}
            group={group}
            currentRound={currentRound}
            schedule={schedule}
            isManager={isManager}
            isActive={isActive}
            isCompleted={isCompleted}
            sortedMembers={sortedMembers}
            reliabilityByMember={reliabilityByMember}
            dashboard={dashboardData?.dashboard}
            completionSummary={completionData?.summary}
            completionSummaryLoading={completionSummaryLoading}
            completionSummaryError={completionSummaryError}
            obligations={obligationsData?.obligations ?? []}
            disputes={disputesData?.disputes ?? []}
            ledgerEntries={ledgerData?.entries ?? []}
            auditEntries={auditData?.entries ?? []}
            actionPending={actionPending}
            onReportPayment={(cid, amount) => void handleReportPayment(cid, amount)}
            onConfirmPayment={(cid) => void handleConfirmPayment(cid)}
            onRecordPayment={(cid, amount) => void handleRecordPayment(cid, amount)}
            onRaiseDispute={(cid, name) => void handleRaiseDispute(cid, name)}
            onSettleMemberDebts={(memberId, name) => void handleSettleMemberDebts(memberId, name)}
            onCoverObligationExternally={(oid, name) => void handleCoverObligationExternally(oid, name)}
            onResolveDispute={(disputeId) => void handleResolveDispute(disputeId)}
            onAdvanceRound={() => void handleAdvanceRound()}
            advanceRoundPending={advanceRound.isPending}
            showDemoTools={showDemoTools}
            claimUrls={claimUrls}
            onClaimInvite={(membershipId) => void handleClaimInvite(membershipId)}
            claimPending={claimInvite.isPending}
            unclaimedSeats={pending.unclaimedSeats}
          />
        </GroupSectionLayout>
      )}

      {formError && <p className={`mt-4 ${ui.error}`}>{formError}</p>}
    </div>
  );
}
