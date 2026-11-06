import { useState } from "react";
import { Star } from "lucide-react";
import type { GroupDetail, RatingsView } from "../../../api/client";
import { Avatar } from "../../../components/Avatar";
import { Sheet } from "../../../components/flow/Sheet";
import { SheetDone } from "../../../components/flow/SheetDone";
import { Stars, StarInput } from "../../../components/StarRating";
import { memberRatingsError } from "@domain/ratings";
import { ui } from "../../../lib/ui";

type MembersRatings = Extract<RatingsView, { kind: "members" }>;

/**
 * R-DEC-43: the organizer rates every member holding a slot, all at once; members who left by
 * hand-over are optional, listed after. Opens on the stars already given, so it also changes them.
 * Mount it only while open, so it starts from the saved ratings each time.
 */
export function RateMembersSheet({
  ratings,
  pending,
  error,
  onClose,
  onSave,
}: {
  ratings: MembersRatings;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (ratings: { userId: string; stars: number }[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(ratings.members.filter((m) => m.stars != null).map((m) => [m.userId, m.stars!])),
  );
  const [saved, setSaved] = useState(false);
  const staying = ratings.members.filter((m) => !m.left);
  const left = ratings.members.filter((m) => m.left);
  const given = Object.entries(draft).map(([userId, stars]) => ({ userId, stars }));
  // The server's own check, so the form says exactly what it would refuse.
  const problem = memberRatingsError(given, {
    organizerUserId: "",
    required: staying.map((m) => m.userId),
    optional: left.map((m) => m.userId),
  });

  if (saved) {
    return (
      <SheetDone title="Ratings saved" onClose={onClose}>
        You can change them any time.
      </SheetDone>
    );
  }

  const row = (m: MembersRatings["members"][number]) => (
    <li key={m.userId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={m.name} size="md" />
        <span className="truncate text-sm font-bold text-ink-900">{m.name}</span>
      </span>
      <StarInput
        value={draft[m.userId] ?? null}
        onChange={(stars) => setDraft((d) => ({ ...d, [m.userId]: stars }))}
        label={`Rate ${m.name}`}
        disabled={pending}
      />
    </li>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title="Rate your members"
      footer={
        <div className="space-y-2">
          {problem && <p className="text-center text-xs text-ink-500">{problem}</p>}
          <button
            type="button"
            onClick={() => void onSave(given).then((ok) => ok && setSaved(true))}
            disabled={!!problem || pending}
            className={`${ui.btnPrimaryFull} min-h-11`}
          >
            {pending ? "Saving…" : "Save ratings"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-ink-100">{staying.map(row)}</ul>
        {left.length > 0 && (
          <section aria-labelledby="left-heading">
            <h3 id="left-heading" className="text-xs font-bold uppercase tracking-wide text-ink-500">
              Left before the end · optional
            </h3>
            <ul className="divide-y divide-ink-100">{left.map(row)}</ul>
          </section>
        )}
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** R-DEC-43: a member rates the organizer, if they like; it can be changed later. Mount only while open. */
export function RateOrganizerSheet({
  organizerName,
  stars,
  pending,
  error,
  onClose,
  onSave,
}: {
  organizerName: string;
  stars: number | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (stars: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<number | null>(stars);
  const [saved, setSaved] = useState(false);
  if (saved) {
    return (
      <SheetDone title="Rating saved" onClose={onClose}>
        You can change it any time.
      </SheetDone>
    );
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Rate ${organizerName}`}
      footer={
        <button
          type="button"
          onClick={() => draft != null && void onSave(draft).then((ok) => ok && setSaved(true))}
          disabled={draft == null || draft === stars || pending}
          className={`${ui.btnPrimaryFull} min-h-11`}
        >
          {pending ? "Saving…" : "Save rating"}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center py-2">
          <StarInput value={draft} onChange={setDraft} label={`Rate ${organizerName}`} disabled={pending} />
        </div>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/**
 * On the dashboard once the viewer has rated (from the last round's close for members, R-DEC-47): what they gave, with Change
 * (R-DEC-43: ratings can be changed any time). Before that, the to-do list asks instead.
 */
export function YourRatingsCard({ detail, onChange }: { detail: GroupDetail; onChange: () => void }) {
  const ratings = detail.ratings;
  if (!ratings) return null;
  if (ratings.kind === "members" && (!ratings.done || ratings.members.length === 0)) return null;
  if (ratings.kind === "organizer" && ratings.stars == null) return null;
  const rated = ratings.kind === "members" ? ratings.members.filter((m) => m.stars != null).length : 0;
  return (
    <section aria-labelledby="your-ratings-heading" className="flex items-center gap-3 rounded-3xl border border-ink-200 bg-white p-4 sm:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sun-100 text-sun-800" aria-hidden>
        <Star className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="your-ratings-heading" className="text-sm font-bold text-ink-900">
          {ratings.kind === "members"
            ? `You rated ${rated === 1 ? "1 member" : `${rated} members`}`
            : `You rated ${detail.group.organizerName}`}
        </h2>
        {ratings.kind === "organizer" && ratings.stars != null && (
          <Stars value={ratings.stars} size="sm" label={`${ratings.stars} out of 5 stars`} />
        )}
      </div>
      <button type="button" onClick={onChange} className={`shrink-0 ${ui.btnSecondarySm}`}>
        Change
      </button>
    </section>
  );
}
