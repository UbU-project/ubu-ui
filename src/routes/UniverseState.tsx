import { FormEvent, useEffect, useState } from "react";

import {
  orchestratorClient,
  OrchestratorError,
  type BootstrapDiagnostic,
  type ProvenanceKind,
  type UniverseMutation,
  type UniverseStateResponse
} from "../api/client";
import { DiagnosticsList } from "../components/DiagnosticsList";
import { StatusBadge } from "../components/StatusBadge";

/// The four collections, in the order the orchestrator names them. The name is what a target starts
/// with, so it is shown as it is spelled.
export const COLLECTIONS = ["facts", "numeric_values", "set_memberships", "event_markers"] as const;
type Collection = (typeof COLLECTIONS)[number];

const HEADINGS: Record<Collection, string> = {
  facts: "Facts",
  numeric_values: "Numbers",
  set_memberships: "Sets",
  event_markers: "Event markers"
};

/// What was typed, as a value: JSON when it is JSON, and text when it is not. So `true` is the
/// boolean, `3` is the number, `"3"` is the text, and `ready` is the text.
export function readValue(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

/// A value as it is stored, so the boolean `true` and the text `"true"` never look the same.
function shown(value: unknown): string {
  return JSON.stringify(value);
}

function entryCount(state: UniverseStateResponse, collection: Collection): number {
  return Object.keys(state[collection]).length;
}

function recordedAt(instant: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) {
    return instant;
  }
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/// How a value was established, in a word beside it. A measured value is evidence and an asserted one
/// is someone's word, and this is the first screen where the two look different. A value with no
/// recorded provenance shows nothing: the screen does not guess one.
const KIND_TONE: Record<ProvenanceKind, "neutral" | "success" | "warning"> = {
  asserted: "neutral",
  measured: "success",
  derived: "neutral",
  proposed: "warning"
};

function Established({ state, target }: { state: UniverseStateResponse; target: string }) {
  const entry = state.fact_provenance[target];
  if (!entry) {
    return null;
  }
  return (
    <span aria-label={`${target} was ${entry.kind}`} title={`recorded ${recordedAt(entry.recorded_at)}`}>
      <StatusBadge label={entry.kind} tone={KIND_TONE[entry.kind] ?? "neutral"} />
    </span>
  );
}

type Draft = { key: string; value: string };
const emptyDraft: Draft = { key: "", value: "" };

export function UniverseState() {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "failed">("loading");
  const [state, setState] = useState<UniverseStateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [refusal, setRefusal] = useState<BootstrapDiagnostic[]>([]);
  const [factKind, setFactKind] = useState<"asserted" | "measured">("asserted");
  const [numberKind, setNumberKind] = useState<"asserted" | "measured">("asserted");
  const [fact, setFact] = useState<Draft>(emptyDraft);
  const [number, setNumber] = useState<Draft>(emptyDraft);
  const [member, setMember] = useState<Draft>(emptyDraft);

  function clearMessages() {
    setFormError("");
    setRefusal([]);
  }

  async function load() {
    try {
      const response = await orchestratorClient.readUniverseState();
      setState(response.data);
      setLoadState("ready");
    } catch (error) {
      setFormError(error instanceof OrchestratorError ? error.message : "Could not load the UniverseState from the local orchestrator.");
      setLoadState("failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  /// Send one edit. The screen changes only when the orchestrator answers with the state after it:
  /// a refusal leaves everything on it as it was.
  async function apply(mutations: UniverseMutation[]): Promise<boolean> {
    clearMessages();
    setBusy(true);
    try {
      const response = await orchestratorClient.editUniverseState(mutations);
      setState(response.data);
      return true;
    } catch (error) {
      if (error instanceof OrchestratorError && error.status === 409) {
        setFormError("The UniverseState changed while this was being saved, so nothing was saved. It has been reloaded.");
        await load();
      } else if (error instanceof OrchestratorError) {
        setRefusal(error.diagnostics);
        setFormError(error.diagnostics.length > 0 ? "The orchestrator refused this, and nothing was changed." : error.message);
      } else {
        setFormError("Could not change the UniverseState through the local orchestrator.");
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitFact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fact.value.trim() === "") {
      clearMessages();
      setFormError('Enter a value. For empty text, type "".');
      return;
    }
    if (await apply([{ operation: "set_fact", target: `facts.${fact.key.trim()}`, payload: readValue(fact.value), ...(factKind === "measured" ? { provenance_kind: "measured" as const } : {}) }])) {
      setFact(emptyDraft); setFactKind("asserted");
    }
  }

  /// A number is set to the value typed, outright. Whatever was there is replaced.
  async function submitNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(number.value);
    if (number.value.trim() === "" || !Number.isFinite(value)) {
      clearMessages();
      setFormError("Enter a number.");
      return;
    }
    if (await apply([{ operation: "set_numeric", target: `numeric_values.${number.key.trim()}`, payload: value, ...(numberKind === "measured" ? { provenance_kind: "measured" as const } : {}) }])) {
      setNumber(emptyDraft); setNumberKind("asserted");
    }
  }

  async function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (member.value.trim() === "") {
      clearMessages();
      setFormError('Enter a member. For empty text, type "".');
      return;
    }
    if (await apply([{ operation: "add_membership", target: `set_memberships.${member.key.trim()}`, payload: readValue(member.value) }])) {
      setMember(emptyDraft);
    }
  }

  const stored = state !== null && state.version !== null;
  const total = state ? COLLECTIONS.reduce((sum, collection) => sum + entryCount(state, collection), 0) : 0;

  function heading(collection: Collection) {
    const count = state ? entryCount(state, collection) : 0;
    return (
      <div className="title-row">
        <h2 id={`universe-${collection}`}>
          {HEADINGS[collection]} <code>{collection}</code>
        </h2>
        <StatusBadge label={count === 1 ? "1 entry" : `${count} entries`} />
      </div>
    );
  }

  return (
    <section className="route-stack">
      <div>
        <div className="section-kicker">UniverseState</div>
        <h1>UniverseState</h1>
        <p className="muted">
          A Task can ask that something be true before UbU will plan it. This is where that something is recorded. A Task whose condition is not met
          here is left out of the Plan as not ready, and Today names what it is waiting for by the names on this screen.
        </p>
      </div>

      {loadState === "loading" && <p role="status">Loading the UniverseState</p>}
      {loadState === "failed" && (
        <button type="button" className="secondary-action fit" onClick={() => { clearMessages(); setLoadState("loading"); void load(); }}>
          Retry
        </button>
      )}
      {formError && (
        <p className="error-text" role="alert">
          {formError}
        </p>
      )}
      <DiagnosticsList diagnostics={refusal} />

      {state && (
        <>
          <div className="settings-panel" aria-label="What is recorded">
            {!stored && (
              <p>
                Nothing is recorded here yet. This store has no UniverseState, so a Task that waits for something to be so is not ready. The first
                entry you set creates it.
              </p>
            )}
            {stored && total === 0 && <p>This UniverseState holds no entries.</p>}
            {stored && (
              <p className="muted">
                Version {state.version}. First recorded <time dateTime={state.captured_at}>{recordedAt(state.captured_at)}</time>. {state.source_summary}
                {state.confidence_summary ? ` ${state.confidence_summary}` : ""}
              </p>
            )}
            {/* One line that can be read out: the names and the counts, and no value. */}
            <p aria-label="Entries in each collection">
              Entries:{" "}
              {COLLECTIONS.map((collection, index) => (
                <span key={collection}>
                  {index > 0 && ", "}
                  <code>{collection}</code> {entryCount(state, collection)}
                </span>
              ))}
              .
            </p>
            <p className="muted">
              Each entry is shown by its target, the name a precondition uses for it: the collection, a dot, then the key. A value is shown as it is
              stored, so the text <code>"true"</code> and the value <code>true</code> are told apart. Beside a value, one word says how it was
              established: <strong>asserted</strong> is someone's word, <strong>measured</strong> is a reading, <strong>derived</strong> was worked out
              from other entries, and <strong>proposed</strong> was suggested and not confirmed. What you set on this screen is recorded as asserted unless you choose “A reading”; the choice is yours.
              An entry with no such word was written before UbU recorded this.
            </p>
          </div>

          <section className="settings-panel" aria-labelledby="universe-facts">
            {heading("facts")}
            {entryCount(state, "facts") === 0 ? (
              <p className="muted">No facts.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table aria-label="Facts">
                  <thead><tr><th>Target</th><th>Value</th><th>Change or clear</th></tr></thead>
                  <tbody>
                    {Object.entries(state.facts).map(([key, value]) => (
                      <tr key={key} aria-label={`facts.${key}`}>
                        <th scope="row"><code>facts.{key}</code></th>
                        <td><code>{shown(value)}</code> <Established state={state} target={`facts.${key}`} /></td>
                        <td>
                          <div className="actions-row">
                            <button type="button" className="secondary-action" disabled={busy} aria-label={`Change facts.${key}`} onClick={() => setFact({ key, value: shown(value) })}>
                              Change
                            </button>
                            <button type="button" className="secondary-action" disabled={busy} aria-label={`Clear facts.${key}`} onClick={() => void apply([{ operation: "clear_fact", target: `facts.${key}` }])}>
                              Clear
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <form className="bootstrap-form" aria-label="Set a fact" onSubmit={(event) => void submitFact(event)}>
              <label htmlFor="universe-fact-key">Fact key, the part after <code>facts.</code></label>
              <input id="universe-fact-key" type="text" value={fact.key} disabled={busy} onChange={(event) => setFact({ ...fact, key: event.target.value })} />
              <p aria-label="Fact target">Target: <code>{`facts.${fact.key.trim()}`}</code></p>
              <label htmlFor="universe-fact-value">Fact value</label>
              <input id="universe-fact-value" type="text" value={fact.value} disabled={busy} onChange={(event) => setFact({ ...fact, value: event.target.value })} />
              <label htmlFor="universe-fact-kind">How this fact was established</label>
              <select id="universe-fact-kind" value={factKind} disabled={busy} onChange={(event) => setFactKind(event.target.value === "measured" ? "measured" : "asserted")}>
                <option value="asserted">My assertion</option><option value="measured">A reading</option>
              </select>
              <p className="muted">
                A value is read as JSON when it is JSON: <code>true</code>, <code>false</code>, a number, or text in double quotes. Anything else is
                taken as text. Setting a key that is already here replaces its value.
              </p>
              <button type="submit" className="primary-action fit" disabled={busy}>Set fact</button>
            </form>
          </section>

          <section className="settings-panel" aria-labelledby="universe-numeric_values">
            {heading("numeric_values")}
            {entryCount(state, "numeric_values") === 0 ? (
              <p className="muted">No numbers.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table aria-label="Numbers">
                  <thead><tr><th>Target</th><th>Value</th><th>Change or clear</th></tr></thead>
                  <tbody>
                    {Object.entries(state.numeric_values).map(([key, value]) => (
                      <tr key={key} aria-label={`numeric_values.${key}`}>
                        <th scope="row"><code>numeric_values.{key}</code></th>
                        <td><code>{shown(value)}</code> <Established state={state} target={`numeric_values.${key}`} /></td>
                        <td>
                          <div className="actions-row">
                            <button type="button" className="secondary-action" disabled={busy} aria-label={`Change numeric_values.${key}`} onClick={() => setNumber({ key, value: String(value) })}>
                              Change
                            </button>
                            <button type="button" className="secondary-action" disabled={busy} aria-label={`Clear numeric_values.${key}`} onClick={() => void apply([{ operation: "clear_numeric", target: `numeric_values.${key}` }])}>
                              Clear
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <form className="bootstrap-form" aria-label="Set a number" onSubmit={(event) => void submitNumber(event)}>
              <label htmlFor="universe-number-key">Number key, the part after <code>numeric_values.</code></label>
              <input id="universe-number-key" type="text" value={number.key} disabled={busy} onChange={(event) => setNumber({ ...number, key: event.target.value })} />
              <p aria-label="Number target">Target: <code>{`numeric_values.${number.key.trim()}`}</code></p>
              <label htmlFor="universe-number-value">Number value</label>
              <input id="universe-number-value" type="text" inputMode="decimal" value={number.value} disabled={busy} onChange={(event) => setNumber({ ...number, value: event.target.value })} />
              <label htmlFor="universe-number-kind">How this number was established</label>
              <select id="universe-number-kind" value={numberKind} disabled={busy} onChange={(event) => setNumberKind(event.target.value === "measured" ? "measured" : "asserted")}>
                <option value="asserted">My assertion</option><option value="measured">A reading</option>
              </select>
              <p className="muted">The number is set to the value you enter, exactly. Setting a key that is already here replaces its value.</p>
              <button type="submit" className="primary-action fit" disabled={busy}>Set number</button>
            </form>
          </section>

          <section className="settings-panel" aria-labelledby="universe-set_memberships">
            {heading("set_memberships")}
            {entryCount(state, "set_memberships") === 0 ? (
              <p className="muted">No sets.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table aria-label="Sets">
                  <thead><tr><th>Target</th><th>Members</th></tr></thead>
                  <tbody>
                    {Object.entries(state.set_memberships).map(([key, members]) => (
                      <tr key={key} aria-label={`set_memberships.${key}`}>
                        <th scope="row"><code>set_memberships.{key}</code></th>
                        <td>
                          <Established state={state} target={`set_memberships.${key}`} />
                          {members.map((value) => (
                            <div className="actions-row" key={shown(value)}>
                              <code>{shown(value)}</code>
                              <button
                                type="button"
                                className="secondary-action"
                                disabled={busy}
                                aria-label={`Remove ${shown(value)} from set_memberships.${key}`}
                                onClick={() => void apply([{ operation: "remove_membership", target: `set_memberships.${key}`, payload: value }])}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <form className="bootstrap-form" aria-label="Add a member to a set" onSubmit={(event) => void submitMember(event)}>
              <label htmlFor="universe-set-key">Set key, the part after <code>set_memberships.</code></label>
              <input id="universe-set-key" type="text" value={member.key} disabled={busy} onChange={(event) => setMember({ ...member, key: event.target.value })} />
              <p aria-label="Set target">Target: <code>{`set_memberships.${member.key.trim()}`}</code></p>
              <label htmlFor="universe-set-member">Member</label>
              <input id="universe-set-member" type="text" value={member.value} disabled={busy} onChange={(event) => setMember({ ...member, value: event.target.value })} />
              <p className="muted">A member is read the way a fact's value is. A set that loses its last member is removed.</p>
              <button type="submit" className="primary-action fit" disabled={busy}>Add member</button>
            </form>
          </section>

          <section className="settings-panel" aria-labelledby="universe-event_markers">
            {heading("event_markers")}
            <p className="muted">
              Event markers can only be added to, never changed or removed, and this screen does not add them. They are shown as recorded, oldest
              first.
            </p>
            {entryCount(state, "event_markers") === 0 ? (
              <p className="muted">No event markers.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table aria-label="Event markers">
                  <thead><tr><th>Target</th><th>Markers</th></tr></thead>
                  <tbody>
                    {Object.entries(state.event_markers).map(([key, markers]) => (
                      <tr key={key} aria-label={`event_markers.${key}`}>
                        <th scope="row"><code>event_markers.{key}</code></th>
                        <td>
                          <Established state={state} target={`event_markers.${key}`} />
                          {markers.map((marker, index) => (
                            <div key={index}><code>{shown(marker)}</code></div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
