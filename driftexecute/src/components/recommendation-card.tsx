import type { Recommendation } from "@/lib/types";

interface RecommendationCardProps {
  recommendation: Recommendation;
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  return (
    <article className="rounded-none border border-zinc-500 bg-panelSoft p-5 shadow-panel">
      <div className="mb-3 flex items-center gap-2">
        <span className="white-chip">Suggested</span>
      </div>
      <h3 className="text-xl font-bold text-zinc-100">{recommendation.destination}</h3>
      <p className="read-box mt-3 text-sm">
        Suggested length: {recommendation.suggestedLengthDays} days
      </p>
      <p className="read-box mt-2 text-sm">
        Estimated cost: {recommendation.estimatedCostRange}
      </p>
      <p className="mt-4 rounded-none border border-orange-500/40 bg-zinc-700 p-3 text-sm leading-relaxed text-orange-300">
        {recommendation.rationale}
      </p>
    </article>
  );
}





