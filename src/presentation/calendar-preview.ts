/** Server-computed Dynamic matches; Static timing is a rule, not an inferred count. */
export function matchingPlacementsSentence(count: number): string {
  const matches = count === 1
    ? "1 Dynamic placement already matches the calendar and needs no operation"
    : `${count} Dynamic placements already match the calendar and need no operation`;
  return `${matches}; Static commitments keep their fixed times.`;
}
