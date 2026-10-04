import { numericComparisonWords } from "../presentation/precondition";

/// A precondition, said in words. A shape this screen does not know is shown as it came.
export function PreconditionWords({ precondition }: { precondition: unknown }) {
  const value = (precondition ?? {}) as { all_of?: unknown[]; any_of?: unknown[]; target?: unknown; predicate?: unknown; expected?: unknown };
  const group = Array.isArray(value.all_of) ? { parts: value.all_of, word: " and " } : Array.isArray(value.any_of) ? { parts: value.any_of, word: " or " } : null;
  if (group) {
    return (
      <>
        {group.parts.map((part, index) => (
          <span key={index}>
            {index > 0 && group.word}
            <PreconditionWords precondition={part} />
          </span>
        ))}
      </>
    );
  }
  if (typeof value.target === "string" && value.predicate === "equals") {
    return (
      <>
        <code>{value.target}</code> is <code>{JSON.stringify(value.expected)}</code>
      </>
    );
  }
  if (typeof value.target === "string" && value.predicate === "member_of") {
    return (
      <>
        <code>{value.target}</code> is one of <code>{JSON.stringify(value.expected)}</code>
      </>
    );
  }
  if (typeof value.target === "string" && value.predicate === "absent") {
    return (
      <>
        <code>{value.target}</code> is not set
      </>
    );
  }
  const comparison = numericComparisonWords(value.predicate);
  if (comparison && typeof value.target === "string" && value.target.startsWith("numeric_values.") && typeof value.expected === "number" && Number.isFinite(value.expected)) {
    return <><code>{value.target}</code> {comparison} <code>{JSON.stringify(value.expected)}</code></>;
  }
  return <code>{JSON.stringify(precondition)}</code>;
}

