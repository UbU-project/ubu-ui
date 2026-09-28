import { FormEvent, useState } from "react";

type SelectedRepo = {
  owner: string;
  repo: string;
};

type OnboardingProps = {
  sessionReady: boolean;
  onComplete: (repo: SelectedRepo) => void;
};

function parseRepo(value: string): SelectedRepo | null {
  const [owner, repo, ...rest] = value.trim().split("/");

  if (!owner || !repo || rest.length > 0) {
    return null;
  }

  return { owner, repo };
}

// The repository step of GitHub onboarding, shown in Setup's GitHub card. The
// token is taken by the Desktop session card, which posts to the same endpoint.
export function Onboarding({ sessionReady, onComplete }: OnboardingProps) {
  const [repoInput, setRepoInput] = useState("UbU-project/ubu-ui");
  const [formError, setFormError] = useState("");

  function submitOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const selectedRepo = parseRepo(repoInput);
    if (!selectedRepo) {
      setFormError("Enter the repository as owner/repo.");
      return;
    }

    onComplete(selectedRepo);
  }

  return (
    <div>
      <h3>Repository</h3>
      {!sessionReady && (
        <p className="muted">
          No token has been sent in this window. Seeding needs one: send it in Desktop session above, or run the orchestrator with{" "}
          <code>GITHUB_TOKEN</code>.
        </p>
      )}
      <form className="token-form" onSubmit={submitOnboarding}>
        <label htmlFor="selected-repo">Repository</label>
        <input
          id="selected-repo"
          autoComplete="off"
          spellCheck={false}
          type="text"
          value={repoInput}
          onChange={(event) => setRepoInput(event.target.value)}
          placeholder="owner/repo"
        />
        <button type="submit" className="primary-action fit">
          Continue to bootstrap
        </button>
      </form>
      {formError && <span className="error-text">{formError}</span>}
    </div>
  );
}
