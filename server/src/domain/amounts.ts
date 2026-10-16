import { CENTAVOS_PER_PESO, type Centavos } from "./money.js";

/** R-SET-03: which amount the organizer entered. Stored, because it drives recalculation (R-LOB-10). */
export type AmountMode = "CONTRIBUTION" | "POT";

export interface GroupAmounts {
  contribution: Centavos;
  pot: Centavos;
  /** Pot mode only: the pot was rounded up from what was entered (R-AMT-02). Show this to the organizer. */
  potAdjustedFrom: Centavos | null;
}

/**
 * R-AMT-01 / R-AMT-02. `entered` is the contribution (contribution mode) or the pot (pot mode).
 * In pot mode the contribution is rounded up to a whole peso, so the real pot can exceed what was
 * entered: 10,000 over 3 slots → 3,334 each, pot 10,002.
 */
export function computeAmounts(mode: AmountMode, entered: Centavos, slots: number): GroupAmounts {
  if (mode === "CONTRIBUTION") {
    return { contribution: entered, pot: entered * slots, potAdjustedFrom: null };
  }
  const contribution = Math.ceil(entered / slots / CENTAVOS_PER_PESO) * CENTAVOS_PER_PESO;
  const pot = contribution * slots;
  return { contribution, pot, potAdjustedFrom: pot === entered ? null : entered };
}

/**
 * R-LOB-10: what changes when the slot count changes. Contribution mode keeps the contribution (the
 * pot moves); pot mode keeps the pot the organizer entered (the contribution moves).
 */
export function recomputeForSlots(
  mode: AmountMode,
  current: { contribution: Centavos; enteredPot: Centavos },
  slots: number,
): GroupAmounts {
  return computeAmounts(mode, mode === "CONTRIBUTION" ? current.contribution : current.enteredPot, slots);
}
