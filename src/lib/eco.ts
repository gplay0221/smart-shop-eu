// Sustainability helpers — client safe.

export type EcoScore = "A" | "B" | "C" | "D" | "E";

export const ECO_LABEL: Record<EcoScore, string> = {
  A: "Excellent",
  B: "Good",
  C: "Average",
  D: "Poor",
  E: "Very poor",
};

/** Semantic token classes per grade. */
export const ECO_CLASS: Record<EcoScore, string> = {
  A: "bg-savings/15 text-savings border-savings/30",
  B: "bg-savings/10 text-savings border-savings/20",
  C: "bg-accent/15 text-accent-foreground border-accent/40",
  D: "bg-destructive/10 text-destructive border-destructive/20",
  E: "bg-destructive/15 text-destructive border-destructive/30",
};

export function isEcoScore(v: string | null | undefined): v is EcoScore {
  return v === "A" || v === "B" || v === "C" || v === "D" || v === "E";
}

export function ecoBetter(a: string | null, b: string | null) {
  if (!isEcoScore(a) || !isEcoScore(b)) return false;
  return a < b;
}
