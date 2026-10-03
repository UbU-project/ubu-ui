/** Wording shared by the rendered preview and the HTTP contract runner. */
export function matchingPlacementsSentence(count: number): string {
  if (count <= 0) return "";
  return count === 1
    ? "1 placement already matches the calendar and needs no operation."
    : `${count} placements already match the calendar and need no operation.`;
}
