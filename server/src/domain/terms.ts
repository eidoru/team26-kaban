/**
 * R-SET-07, R-DEC-38: the terms a member agrees to before joining or claiming a slot (R-INV-08,
 * R-CLM-07). Purely textual: nothing in the app enforces or penalizes them. Every paluwagan gets
 * this text for now; each group keeps its own copy, so changing it here never changes terms
 * someone already agreed to.
 */
export const STANDARD_TERMS = [
  "1. I will pay my full contribution on or before every payout date, until the last round, including after I receive my payout.",
  "2. Every payment I record will have a real, clear proof photo. I won't record a payment I didn't make.",
  "3. If I pay short, the missing amount becomes my debt to the organizer, plus any interest set for this paluwagan, and it can be taken from my payout.",
  "4. When I receive my payout, I will confirm it promptly.",
  "5. I will report a problem only when there is a real mistake.",
  "6. My payments, their status and any debt I owe are visible to every member of this paluwagan.",
  "7. Kaban only keeps records. Money moves directly between members and the organizer; Kaban doesn't hold, guarantee or recover it.",
].join("\n");

/** R-INV-08, R-CLM-07: why a join or claim without agreement is refused. */
export const TERMS_NOT_ACCEPTED = "Agree to the terms to continue.";
