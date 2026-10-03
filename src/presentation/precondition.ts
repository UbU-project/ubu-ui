/** Core's numeric predicate spellings, expressed for a human reader. */
export function numericComparisonWords(predicate: unknown): string | null {
  switch (predicate) {
    case "at_least": return "is at least";
    case "at_most": return "is at most";
    case "greater_than": return "is greater than";
    case "less_than": return "is less than";
    default: return null;
  }
}
