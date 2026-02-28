import type { Recommendation } from "@/lib/types";

interface RecommendationCardProps {
  recommendation: Recommendation;
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  return (
    <article className="rounded-none bg-panel p-5 shadow-panel">
      <h3 className="text-xl font-bold text-slate-900">{recommendation.destination}</h3>
      <p className="mt-2 text-sm text-slate-600">
        Suggested length: {recommendation.suggestedLengthDays} days
      </p>
      <p className="text-sm text-slate-600">
        Estimated cost: {recommendation.estimatedCostRange}
      </p>
      <p className="mt-4 rounded-none bg-sky-50 p-3 text-sm leading-relaxed text-sky-900">
        {recommendation.rationale}
      </p>
    </article>
  );
}


