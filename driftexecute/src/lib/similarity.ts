import type { SimilarTripResult, Trip } from "@/lib/types";

const minTokenLength = 2;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= minTokenLength);
}

export function tripToDocument(trip: Trip): string {
  return [
    trip.title,
    trip.destinations.join(" "),
    trip.tags.join(" "),
    trip.highlights,
    trip.painPoints,
    trip.notes,
  ].join(" ");
}

export function jaccardSimilarity(aTokens: string[], bTokens: string[]): number {
  const setA = new Set(aTokens);
  const setB = new Set(bTokens);
  const intersection = [...setA].filter((token) => setB.has(token)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function rankTripsBySimilarity(
  trips: Trip[],
  queryText: string,
  topK = 3,
): SimilarTripResult[] {
  const queryTokens = tokenize(queryText);

  return trips
    .map((trip) => {
      const score = jaccardSimilarity(queryTokens, tokenize(tripToDocument(trip)));
      return {
        trip,
        score: Number(score.toFixed(3)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}


