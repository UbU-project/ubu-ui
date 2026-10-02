// A duration, said in the unit it is in. The orchestrator's planning coordinates are whole
// seconds, and so is every length it reports from them. A number of seconds is never labelled
// "min".

/**
 * Seconds as a duration a person reads: seconds alone under a minute, minutes alone under an
 * hour, and hours and minutes from there. Minutes are rounded to the nearest one.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "not known";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
