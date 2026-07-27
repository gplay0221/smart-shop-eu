import { ECO_CLASS, ECO_LABEL, isEcoScore } from "@/lib/eco";
import { Leaf } from "lucide-react";

export function EcoBadge({
  score,
  size = "md",
}: {
  score: string | null | undefined;
  size?: "sm" | "md";
}) {
  if (!isEcoScore(score)) return null;
  return (
    <span
      title={`Sustainability score ${score} — ${ECO_LABEL[score]}`}
      className={`inline-flex items-center gap-1 rounded-full border font-bold ${ECO_CLASS[score]} ${
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
    >
      <Leaf className={size === "sm" ? "size-2.5" : "size-3"} />
      Eco {score}
    </span>
  );
}
