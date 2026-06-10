# Security Policy

## Supported Versions

Phase 1 is pre-release. Security fixes are accepted on the `main` branch.

## Reporting a Vulnerability

Please open a private security advisory in GitHub when available. If that is unavailable, contact the maintainers through the UbU project coordination channel before publishing details.

## Phase 1 Security Notes

The desktop UI talks to the local orchestrator over loopback HTTP.

TODO(security): loopback-only binding does not fully protect mutating endpoints such as projection approval; Phase 1 defers per-run bearer-token/CSRF work because this surface is temporary and test-heavy.

The UI must not persist or log user-provided GitHub personal access tokens. Tokens pasted into the UI are sent only to the loopback orchestrator for in-memory session use.
