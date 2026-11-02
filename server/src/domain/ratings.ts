import { MAX_STARS } from "./constants.js";

/**
 * R-DEC-43: what a rating is about. MEMBER: the organizer rates a member. ORGANIZER: a member rates
 * the organizer. Each role has its own average on the profile.
 */
export type RatingRole = "MEMBER" | "ORGANIZER";

/** A rating is a whole number of stars, 1 to MAX_STARS (R-DEC-43). */
export function starsError(stars: number): string | null {
  return Number.isInteger(stars) && stars >= 1 && stars <= MAX_STARS ? null : `Pick 1 to ${MAX_STARS} stars.`;
}

export interface MemberRating {
  userId: string;
  stars: number;
}

/**
 * R-DEC-43: the organizer's ratings of members. `required` are the registered members holding a slot
 * at completion (never the organizer, never placeholders); `optional` are members who left by
 * hand-over (R-WDR-09). Every required member needs a rating before any is saved.
 */
export function memberRatingsError(
  ratings: MemberRating[],
  who: { organizerUserId: string; required: string[]; optional: string[] },
): string | null {
  const seen = new Set<string>();
  for (const rating of ratings) {
    if (rating.userId === who.organizerUserId) return "You can't rate yourself.";
    if (!who.required.includes(rating.userId) && !who.optional.includes(rating.userId)) {
      return "You can only rate members of this paluwagan.";
    }
    if (seen.has(rating.userId)) return "Rate each member once.";
    seen.add(rating.userId);
    const error = starsError(rating.stars);
    if (error) return error;
  }
  const missing = who.required.filter((id) => !seen.has(id)).length;
  if (missing > 0) return `Rate every member first: ${missing} still to rate.`;
  return null;
}

/**
 * The average of the ratings received, to one decimal place (R-DEC-43). Null when there are none:
 * no ratings is "Not Yet Rated", never zero stars. Works from the integer sum, so it stays exact
 * however many ratings there are.
 */
export function ratingAverage(sum: number, count: number): number | null {
  if (count === 0) return null;
  return Math.round((sum * 10) / count) / 10;
}

/** How full each of the MAX_STARS stars is, 0 to 1, for an average (4.7 → 1, 1, 1, 1, 0.7). */
export function starFills(rating: number): number[] {
  return Array.from({ length: MAX_STARS }, (_, i) => Math.min(1, Math.max(0, Math.round((rating - i) * 100) / 100)));
}

/** "(1 rating)", "(1,000 ratings)". */
export function ratingCountLabel(count: number): string {
  return `(${count.toLocaleString("en-US")} rating${count === 1 ? "" : "s"})`;
}

/** "Rated 4.7 out of 5 from 1,000 ratings", for screen readers. */
export function ratingLabel(average: number | null, count: number): string {
  if (average == null) return "Not yet rated";
  return `Rated ${average} out of ${MAX_STARS} from ${count.toLocaleString("en-US")} rating${count === 1 ? "" : "s"}`;
}
