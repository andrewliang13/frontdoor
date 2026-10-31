import type { CompareResult, PlaceResult } from "./types";

/** CompareResult is the two place scores. Shared-factor diffs are read from each factors list. */
export function comparePlaces(first: PlaceResult, second: PlaceResult): CompareResult {
  return { first, second };
}
