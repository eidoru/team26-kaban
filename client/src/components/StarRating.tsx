import { useId, useState } from "react";
import { MAX_STARS } from "@domain/constants";
import { ratingCountLabel, ratingLabel, starFills } from "@domain/ratings";
import type { RatingSummary, UserProfile } from "../api/client";

const STAR_PATH =
  "M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95L12 2.6z";

function StarShape({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path d={STAR_PATH} />
    </svg>
  );
}

const SIZES = { sm: "h-4 w-4", md: "h-5 w-5" } as const;

/**
 * An average as five stars, each filled with gold to its exact share (R-DEC-43): 4.7 is four full
 * stars and 70% of the fifth. The gold is a clipped copy of the star over a neutral one, so any
 * fraction draws precisely. Screen readers get `label` instead of the shapes.
 */
export function Stars({ value, label, size = "md" }: { value: number; label: string; size?: keyof typeof SIZES }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-0.5">
      {starFills(value).map((fill, i) => (
        <span key={i} className={`relative shrink-0 ${SIZES[size]}`}>
          <StarShape className="absolute inset-0 h-full w-full fill-ink-200" />
          <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
            <StarShape className={`max-w-none fill-sun-400 ${SIZES[size]}`} />
          </span>
        </span>
      ))}
    </span>
  );
}

/** One role's average with its count, or "Not Yet Rated" (never zero stars) before the first rating. */
export function RatingValue({ rating, size }: { rating: RatingSummary; size?: keyof typeof SIZES }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
      {rating.average == null ? (
        <span className="text-sm font-bold text-ink-600">Not Yet Rated</span>
      ) : (
        <Stars value={rating.average} label={ratingLabel(rating.average, rating.count)} size={size} />
      )}
      {/* The stars' label already says the count. */}
      <span className="text-xs tabular-nums text-ink-500" aria-hidden={rating.average != null}>
        {ratingCountLabel(rating.count)}
      </span>
    </span>
  );
}

/** A profile's two reputations, side by side in one card: as a member, and as an organizer. */
export function ProfileRatings({ profile }: { profile: UserProfile }) {
  const rows = [
    { label: "Member rating", rating: profile.memberRating },
    { label: "Organizer rating", rating: profile.organizerRating },
  ];
  return (
    <dl className="divide-y divide-ink-100 rounded-3xl border border-ink-200 bg-white">
      {rows.map((row) => (
        <div key={row.label} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3">
          <dt className="shrink-0 text-sm text-ink-600">{row.label}</dt>
          <dd className="min-w-0">
            <RatingValue rating={row.rating} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Giving a rating: whole stars from 1 to 5 (R-DEC-43). Native radios under the stars, so arrow keys
 * and screen readers work; hovering previews the choice.
 */
export function StarInput({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: number | null;
  onChange: (stars: number) => void;
  /** What's being rated, read before the choices ("Rate Ana"). */
  label: string;
  disabled?: boolean;
}) {
  const name = useId();
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <fieldset className="flex min-w-0 shrink-0" onMouseLeave={() => setHover(null)} disabled={disabled}>
      <legend className="sr-only">{label}</legend>
      {Array.from({ length: MAX_STARS }, (_, i) => i + 1).map((n) => (
        <label
          key={n}
          onMouseEnter={() => !disabled && setHover(n)}
          className="cursor-pointer rounded-full p-0.5 has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500"
        >
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="sr-only"
          />
          <span className="sr-only">
            {n} star{n === 1 ? "" : "s"}
          </span>
          <StarShape className={`h-9 w-9 transition-colors ${n <= shown ? "fill-sun-400" : "fill-ink-200"}`} />
        </label>
      ))}
    </fieldset>
  );
}
