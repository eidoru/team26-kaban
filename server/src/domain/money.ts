/**
 * Money is integer centavos everywhere in the domain (R-AMT-03, assumption). Contributions and pots
 * are whole pesos; partial payments, interest and debt may carry centavos.
 */
export type Centavos = number;

export const CENTAVOS_PER_PESO = 100;

export function pesos(amount: number): Centavos {
  return Math.round(amount * CENTAVOS_PER_PESO);
}

export function isWholePeso(amount: Centavos): boolean {
  return amount % CENTAVOS_PER_PESO === 0;
}

/**
 * An interest rate as integer hundredths of a percent ("basis points"): 1.25% → 125. Rates have at
 * most 2 decimal places (R-SET-06), so this is exact.
 */
export type RateBasisPoints = number;

export function rateFromPercent(percent: number): RateBasisPoints {
  return Math.round(percent * 100);
}

/** rate × amount, rounded to the nearest centavo, half up (R-AMT-04, assumption). */
export function interestOn(amount: Centavos, rate: RateBasisPoints): Centavos {
  if (amount <= 0 || rate <= 0) return 0;
  return Math.floor((amount * rate + 5_000) / 10_000);
}

/** "₱6,243.75", or "₱10,000" for whole pesos. */
export function formatPeso(amount: Centavos): string {
  const value = amount / CENTAVOS_PER_PESO;
  return `₱${value.toLocaleString("en-US", {
    minimumFractionDigits: isWholePeso(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
