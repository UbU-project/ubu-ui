import { useState } from "react";

import type { ClarificationCandidate, ClarificationQuestion } from "../api/client";

type Answers = Record<string, string>;

type ClarificationCardProps = {
  candidate: ClarificationCandidate;
  title: string;
  busy: boolean;
  age: string;
  // Answering is what admits a clarification proposal, so there is no Admit here.
  onAnswer: (answers: Answers) => void;
  onDefer: () => void;
  onResurface: () => void;
  onReject: () => void;
};

function given(answers: Answers, id: string): string {
  return (answers[id] ?? "").trim();
}

// A question applies when it depends on nothing, or when the question it depends
// on applies and is answered as required. A dependency is always an earlier
// question, so one pass in question order decides every question.
function applicable(questions: ClarificationQuestion[], answers: Answers): Set<string> {
  const shown = new Set<string>();
  for (const question of questions) {
    const dependency = question.depends_on;
    if (
      !dependency ||
      (shown.has(dependency[0]) && given(answers, dependency[0]).toLowerCase() === dependency[1].trim().toLowerCase())
    ) {
      shown.add(question.id);
    }
  }
  return shown;
}

// An answer to a question that no longer applies is dropped, so a hidden answer can never be sent.
function pruned(questions: ClarificationQuestion[], answers: Answers): Answers {
  const shown = applicable(questions, answers);
  const kept = Object.fromEntries(Object.entries(answers).filter(([id]) => shown.has(id)));
  // Dropping one answer can hide a question further down the chain.
  return Object.keys(kept).length === Object.keys(answers).length ? kept : pruned(questions, kept);
}

export function ClarificationCard({ candidate, title, busy, age, onAnswer, onDefer, onResurface, onReject }: ClarificationCardProps) {
  const [answers, setAnswers] = useState<Answers>({});
  const id = candidate.advisory_candidate_id;
  const { questions, round } = candidate.normalized_proposal;
  const deferred = candidate.lifecycle_state === "deferred";
  const shown = applicable(questions, answers);
  const visible = questions.filter((question) => shown.has(question.id));
  const toSend = Object.fromEntries(
    visible.map((question) => [question.id, given(answers, question.id)] as const).filter(([, answer]) => answer !== "")
  );

  function answer(questionId: string, value: string) {
    setAnswers((current) => pruned(questions, { ...current, [questionId]: value }));
  }

  return (
    <article className="settings-panel" aria-label={`Proposal ${id}`}>
      <h3>
        Questions about {title}, round {round}
      </h3>
      <p>
        Target: <strong>{title}</strong> — <code>{candidate.target_refs[0]?.id}</code>
      </p>
      {deferred ? (
        <p>
          {questions.length} {questions.length === 1 ? "question was" : "questions were"} put aside. Resurface them to answer them.
        </p>
      ) : (
        <form
          className="bootstrap-form"
          aria-label={`Answer the questions about ${title}`}
          onSubmit={(event) => {
            event.preventDefault();
            onAnswer(toSend);
          }}
        >
          {visible.map((question) =>
            question.kind === "YesNo" ? (
              <fieldset key={question.id}>
                <legend>{question.text}</legend>
                {(
                  [
                    ["y", "Yes"],
                    ["n", "No"]
                  ] as const
                ).map(([value, label]) => (
                  <label className="checkbox-row" key={value}>
                    <input
                      type="radio"
                      name={`${id}-${question.id}`}
                      value={value}
                      checked={given(answers, question.id) === value}
                      disabled={busy}
                      onChange={() => answer(question.id, value)}
                    />
                    {label}
                  </label>
                ))}
                {given(answers, question.id) !== "" && (
                  <button type="button" className="secondary-action fit" disabled={busy} onClick={() => answer(question.id, "")}>
                    Clear this answer
                  </button>
                )}
              </fieldset>
            ) : (
              <div key={question.id}>
                <label htmlFor={`${id}-${question.id}`}>{question.text}</label>
                <input
                  id={`${id}-${question.id}`}
                  autoComplete="off"
                  type="text"
                  value={answers[question.id] ?? ""}
                  disabled={busy}
                  onChange={(event) => answer(question.id, event.target.value)}
                />
              </div>
            )
          )}
          <p className="muted">
            Leave a question blank to give no answer. Saving writes the questions you answered, and your answers, to the Task's
            description. Nothing else about the Task changes.
          </p>
          <button type="submit" className="primary-action fit" disabled={busy || Object.keys(toSend).length === 0}>
            Save answers
          </button>
        </form>
      )}
      <dl className="task-meta">
        <div>
          <dt>Proposing actor</dt>
          <dd>
            {candidate.proposing_actor.model_or_tool_name} ({candidate.proposing_actor.version})
          </dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd>
            <time dateTime={candidate.proposed_at} title={candidate.proposed_at}>
              {age}
            </time>
          </dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{candidate.lifecycle_state}</dd>
        </div>
      </dl>
      <div className="actions-row">
        {deferred ? (
          <button type="button" className="secondary-action" disabled={busy} onClick={onResurface}>
            Resurface
          </button>
        ) : (
          <button type="button" className="secondary-action" disabled={busy} onClick={onDefer}>
            Defer
          </button>
        )}
        <button type="button" className="secondary-action" disabled={busy} onClick={onReject}>
          Reject
        </button>
      </div>
    </article>
  );
}
