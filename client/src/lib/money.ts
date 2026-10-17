import { CENTAVOS_PER_PESO, formatPeso, type Centavos } from "@domain/money";

export { formatPeso };

/**
 * A typed peso amount ("1,500" or "1500.50") as centavos, or NaN when it isn't a plain number
 * with at most 2 decimals. Scientific notation and signs are rejected.
 */
export function parsePesoInput(raw: string): Centavos {
  const text = raw.trim().replace(/,/g, "");
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(text)) return NaN;
  return Math.round(Number(text) * CENTAVOS_PER_PESO);
}

/** Centavos back into an input-friendly string: 150050 → "1500.50", 150000 → "1500". */
export function pesoInputValue(amount: Centavos): string {
  const pesos = amount / CENTAVOS_PER_PESO;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

/** A stored rate (hundredths of a percent) for people: 125 → "1.25%". */
export function formatRate(basisPoints: number): string {
  return `${basisPoints / 100}%`;
}
