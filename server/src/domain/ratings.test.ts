import { describe, expect, it } from "vitest";
import { can } from "./lifecycle.js";
import { memberRatingsError, ratingAverage, ratingCountLabel, ratingLabel, starFills, starsError } from "./ratings.js";

describe("starsError (R-DEC-43)", () => {
  it("takes whole stars from 1 to 5", () => {
    for (const stars of [1, 2, 3, 4, 5]) expect(starsError(stars)).toBeNull();
  });

  it("refuses zero, more than 5 and fractions", () => {
    for (const stars of [0, -1, 6, 4.5, Number.NaN]) expect(starsError(stars)).toBe("Pick 1 to 5 stars.");
  });
});

describe("can.rate (R-DEC-43)", () => {
  it("opens only once the paluwagan is completed, debts or not", () => {
    expect(can.rate("COMPLETED")).toBe(true);
    expect(can.rate("COMPLETED_WITH_OUTSTANDING_DEBT")).toBe(true);
    for (const state of ["LOBBY", "LAUNCHED", "ACTIVE", "CANCELLED"] as const) expect(can.rate(state)).toBe(false);
  });
});

describe("memberRatingsError (R-DEC-43)", () => {
  const who = { organizerUserId: "org", required: ["ana", "ben"], optional: ["left"] };

  it("accepts a rating for every member, with or without the ones who left", () => {
    const all = [
      { userId: "ana", stars: 5 },
      { userId: "ben", stars: 3 },
    ];
    expect(memberRatingsError(all, who)).toBeNull();
    expect(memberRatingsError([...all, { userId: "left", stars: 2 }], who)).toBeNull();
  });

  it("needs every member holding a slot", () => {
    expect(memberRatingsError([{ userId: "ana", stars: 5 }], who)).toBe("Rate every member first: 1 still to rate.");
    expect(memberRatingsError([], who)).toBe("Rate every member first: 2 still to rate.");
  });

  it("refuses the organizer rating themselves", () => {
    expect(memberRatingsError([{ userId: "org", stars: 5 }], who)).toBe("You can't rate yourself.");
  });

  it("refuses anyone who isn't a member, such as a placeholder (no user)", () => {
    expect(memberRatingsError([{ userId: "stranger", stars: 4 }], who)).toBe("You can only rate members of this paluwagan.");
  });

  it("refuses rating someone twice in one go", () => {
    const twice = [
      { userId: "ana", stars: 5 },
      { userId: "ana", stars: 1 },
      { userId: "ben", stars: 3 },
    ];
    expect(memberRatingsError(twice, who)).toBe("Rate each member once.");
  });

  it("refuses stars outside 1 to 5", () => {
    const bad = [
      { userId: "ana", stars: 0 },
      { userId: "ben", stars: 3 },
    ];
    expect(memberRatingsError(bad, who)).toBe("Pick 1 to 5 stars.");
  });
});

describe("ratingAverage (R-DEC-43)", () => {
  it("is null without ratings, never zero", () => {
    expect(ratingAverage(0, 0)).toBeNull();
  });

  it("averages to one decimal place", () => {
    expect(ratingAverage(5, 1)).toBe(5);
    expect(ratingAverage(7, 2)).toBe(3.5);
    expect(ratingAverage(14, 3)).toBe(4.7); // 4.666…
    expect(ratingAverage(13, 3)).toBe(4.3); // 4.333…
  });

  it("stays exact over many ratings", () => {
    // 700 fives and 300 fours: 4.7 exactly.
    expect(ratingAverage(700 * 5 + 300 * 4, 1000)).toBe(4.7);
    // 1,000,001 ratings averaging just under 4.65 round down; just over rounds up.
    expect(ratingAverage(4_649_999, 1_000_000)).toBe(4.6);
    expect(ratingAverage(4_650_000, 1_000_000)).toBe(4.7);
  });
});

describe("starFills (R-DEC-43)", () => {
  it("fills 4.7 as four full stars and 70% of the fifth", () => {
    expect(starFills(4.7)).toEqual([1, 1, 1, 1, 0.7]);
  });

  it("fills 3.5 as three full stars, half the fourth and none of the fifth", () => {
    expect(starFills(3.5)).toEqual([1, 1, 1, 0.5, 0]);
  });

  it("fills whole ratings exactly", () => {
    expect(starFills(5)).toEqual([1, 1, 1, 1, 1]);
    expect(starFills(1)).toEqual([1, 0, 0, 0, 0]);
  });

  it("matches the fill to the rounded average without float noise", () => {
    expect(starFills(1.1)).toEqual([1, 0.1, 0, 0, 0]);
    expect(starFills(2.3)).toEqual([1, 1, 0.3, 0, 0]);
  });
});

describe("rating labels (R-DEC-43)", () => {
  it("counts ratings with thousands separators", () => {
    expect(ratingCountLabel(0)).toBe("(0 ratings)");
    expect(ratingCountLabel(1)).toBe("(1 rating)");
    expect(ratingCountLabel(1000)).toBe("(1,000 ratings)");
  });

  it("reads the rating for screen readers", () => {
    expect(ratingLabel(4.7, 1000)).toBe("Rated 4.7 out of 5 from 1,000 ratings");
    expect(ratingLabel(5, 1)).toBe("Rated 5 out of 5 from 1 rating");
    expect(ratingLabel(null, 0)).toBe("Not yet rated");
  });
});
