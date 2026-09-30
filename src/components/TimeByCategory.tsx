import { FormEvent, useState } from "react";

import { orchestratorClient, OrchestratorError, type BootstrapDiagnostic, type TimeByCategoryResponse } from "../api/client";
import { DiagnosticsList } from "./DiagnosticsList";

// The orchestrator's own default, Quick UbU's `--days 7`.
const DEFAULT_DAYS = 7;

export function hoursAndMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// Whole percentages that add up to exactly 100: the largest remainders take the leftover points.
export function shares(seconds: number[]): number[] {
  const total = seconds.reduce((sum, value) => sum + value, 0);
  if (total === 0) return seconds.map(() => 0);
  const exact = seconds.map((value) => (value * 100) / total);
  const floored = exact.map(Math.floor);
  let leftover = 100 - floored.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - floored[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (leftover === 0) break;
    floored[index] += 1;
    leftover -= 1;
  }
  return floored;
}

function whenInWords(instant: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

const iso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

export function TimeByCategory() {
  const [days, setDays] = useState(String(DEFAULT_DAYS));
  const [report, setReport] = useState<TimeByCategoryResponse | null>(null);
  const [shown, setShown] = useState(DEFAULT_DAYS);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [diagnostics, setDiagnostics] = useState<BootstrapDiagnostic[]>([]);

  async function load(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setFormError("");
    setDiagnostics([]);
    const span = Number(days);
    if (!Number.isInteger(span) || span < 1 || span > 366) {
      setFormError("Enter the range as a whole number of days, from 1 to 366.");
      return;
    }
    setLoading(true);
    try {
      // Seven days is the orchestrator's default and is asked for as such; any other span names its start.
      const range = span === DEFAULT_DAYS ? {} : { from: iso(new Date(Date.now() - span * 86_400_000)) };
      setReport((await orchestratorClient.timeByCategory(range)).data);
      setShown(span);
    } catch (error) {
      if (error instanceof OrchestratorError) {
        setFormError(error.message);
        setDiagnostics(error.diagnostics);
      } else {
        setFormError("Could not read the report from the local orchestrator.");
      }
    } finally {
      setLoading(false);
    }
  }

  const percentages = report ? shares(report.categories.map((row) => row.seconds)) : [];

  return (
    <section className="calendar-panel" aria-labelledby="time-by-category-heading">
      <div>
        <h2 id="time-by-category-heading">Time by category</h2>
        <p className="muted">
          Where the time went. A Static Task counts the part of its window inside the range, ticked or not. A Dynamic Task counts
          once, from its latest completion, by the window observed on the calendar or else by its estimate.
        </p>
      </div>
      <form className="actions-row" aria-label="Report range" onSubmit={(event) => void load(event)}>
        <label htmlFor="time-by-category-days">Last</label>
        <input
          id="time-by-category-days"
          type="number"
          min="1"
          max="366"
          step="1"
          value={days}
          disabled={loading}
          onChange={(event) => setDays(event.target.value)}
        />
        <span>days</span>
        <button type="submit" className="secondary-action" disabled={loading}>
          {loading ? "Reading" : report ? "Reload report" : "Show report"}
        </button>
      </form>
      <p>
        {report
          ? `Showing the last ${shown} ${shown === 1 ? "day" : "days"}: ${whenInWords(report.from)} to ${whenInWords(report.to)}.`
          : `Not loaded yet. The report covers the last ${DEFAULT_DAYS} days ending now unless another span is entered.`}
      </p>
      {formError && <span className="error-text">{formError}</span>}
      <DiagnosticsList diagnostics={diagnostics} />
      {report && report.categories.length === 0 && (
        <p>No recorded time between {whenInWords(report.from)} and {whenInWords(report.to)}: no Static window fell inside the range and no Dynamic Task was completed in it.</p>
      )}
      {report && report.categories.length > 0 && (
        <table aria-label="Time by category">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Time</th>
              <th scope="col">Share</th>
              <th scope="col">Tasks</th>
            </tr>
          </thead>
          <tbody>
            {report.categories.map((row, index) => (
              <tr key={row.category}>
                <th scope="row">{row.category}</th>
                <td>{hoursAndMinutes(row.seconds)}</td>
                <td>{percentages[index]}%</td>
                <td>{row.task_count}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{hoursAndMinutes(report.total_seconds)}</td>
              <td>100%</td>
              <td>{report.categories.reduce((sum, row) => sum + row.task_count, 0)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      {report && report.unmeasured.length > 0 && (
        <div>
          <h3>Happened, but could not be measured</h3>
          <p className="muted">These Tasks were completed in the range and contribute no time, because nothing recorded how long they took.</p>
          <ul aria-label="Unmeasured Tasks">
            {report.unmeasured.map((task) => (
              <li key={task.task_id}>
                <strong>{task.title}</strong> (<code>{task.task_id}</code>): {task.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
