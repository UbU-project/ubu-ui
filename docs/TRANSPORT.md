# Transport

Every request from the app to the orchestrator is made by the Tauri HTTP
plugin, in Rust. The webview's own `fetch` is not used, and there is no
fallback to it. This page records why, what now carries the security
property, and what is still open.

## Why plain `fetch` could not work

The app runs at one origin and the orchestrator listens at another. In a
bundle the app's origin is `tauri://localhost`; under `npm run tauri:dev` it
is `http://127.0.0.1:1420`. The orchestrator is at
`http://127.0.0.1:<port>`, 17890 by default. A different scheme or a
different port is a different origin, so every request from the webview to
the orchestrator is cross-origin.

`src-tauri/tauri.conf.json` has always allowed the connection:

```text
connect-src 'self' http://127.0.0.1:*
```

That is a Content Security Policy, and **CSP is not CORS**. CSP is the page
telling the browser where the page may connect. CORS is the *server* telling
the browser which origins may read its responses. Permission from the first
does nothing for the second. The orchestrator serves no
`Access-Control-Allow-Origin` header, has no `OPTIONS` handler, and answers
`OPTIONS` with 405. So from a webview:

- a JSON `POST` or `PATCH` is preflighted; the preflight `OPTIONS` returns
  405 and the request itself is never sent;
- a `GET` is sent, and its response is withheld from JavaScript.

This was true of every screen — bootstrap, next action, planning, the
Calendar preview, projection approval and Tasks — for as long as the app has
existed.

## Why a careful verification missed it

**`curl` does not enforce CORS.** CORS is enforced by browsers, on behalf of
the page's user; `curl` is not a browser, sends no preflight, and shows any
response it receives. P1B-38 checked the client's exact requests with `curl`
against a live orchestrator and every one succeeded, because the check that
was run is the one check that cannot see this failure. The test suite could
not see it either: it replaced `fetch` with a stub, and a stub has no origin.

The rule this leaves behind: a transport is verified only somewhere that
enforces what the transport is subject to. For this app that is the Tauri
shell, and nothing the agent or the test suite runs is a substitute.

## How the plugin replaces the browser's request path

`src/api/client.ts` imports `fetch` from `@tauri-apps/plugin-http` and calls
it inside `request<T>`. The plugin's `fetch` has the signature of
`window.fetch` and returns a real `Response`, so nothing else in the client
changed. What differs is where the request is made:

1. the webview passes the request to the Tauri core over IPC;
2. the core checks the window's capability and the URL against the scope;
3. the request is made in Rust, by `reqwest`, from the app's own process;
4. the response is handed back to the webview.

No browser makes the request, so no origin is attached to it, no preflight
is sent, and CORS never applies. The orchestrator needs no CORS headers and
still has none.

The Rust side is `tauri-plugin-http`, registered in
`src-tauri/src/main.rs` with `.plugin(tauri_plugin_http::init())`.

## The allowlist lives in the capability file

The URLs the app may reach are listed in
`src-tauri/capabilities/default.json`:

```json
{
  "identifier": "http:allow-fetch",
  "allow": [{ "url": "http://127.0.0.1:*" }]
}
```

The scope is a URL pattern. Measured against the pattern code of the pinned
plugin version:

| URL | Result |
| --- | --- |
| `http://127.0.0.1:17890/tasks?status=active` | allowed |
| `http://127.0.0.1:8080/health` | allowed |
| `http://127.0.0.1/health` | allowed |
| `https://127.0.0.1:17890/health` | denied |
| `http://localhost:17890/health` | denied |
| `http://127.0.0.2:17890/health` | denied |
| `http://127.0.0.1.example.com:17890/health` | denied |
| `http://[::1]:17890/health` | denied |
| `http://example.com/` | denied |

`localhost` is denied because it is a different host string. The client
builds its URL from `127.0.0.1`, so nothing needs it. If
`VITE_UBU_ORCHESTRATOR_URL` is set to anything that is not
`http://127.0.0.1:<port>`, requests will be refused by the scope.

This allowlist is enforced in Rust. A page cannot reach it and a server
header cannot relax it, which is the property being bought. The CSP in
`tauri.conf.json` is unchanged; it was never what blocked requests, and
narrowing it is a separate decision.

The capability lists the five fetch permissions individually rather than
`http:default`. `http:default` is exactly those five with no URL allowed;
listing them puts the scope on the one command that opens a URL,
`http:allow-fetch`, where it can be read at a glance.

## The capability file is load-bearing

Until P1B-39 there was no `src-tauri/capabilities/` directory and
`src-tauri/gen/schemas/capabilities.json` was `{}`. That was harmless only
because nothing in `src/` used Tauri's IPC.

It matters now. In Tauri v2 a window that matches no capability has no
access to the IPC layer at all. Without `capabilities/default.json`, or with
the window's label missing from it, or with the fetch permissions removed,
every request fails inside the plugin before anything is sent, and every
screen shows its failure message. With the permissions present but the scope
removed, the same happens with a message that the URL is not allowed.

The file grants the window labelled `main`, which is the label Tauri gives
the single window in `tauri.conf.json`. A second window would need its own
entry. `src-tauri/gen/schemas/capabilities.json` is generated from this file
at build time and is committed; after a change to the capability, build and
commit both.

## `npm run dev` no longer exercises the app

In a plain browser there is no Tauri runtime behind the plugin. The client
does not fall back to the browser's `fetch`. It throws:

> The Tauri HTTP plugin is unavailable, so the orchestrator cannot be
> reached. Start the app with `npm run tauri:dev`; a plain browser cannot
> make these requests.

The screens show that message in place of data. A fallback would make the
app behave one way in the shell and another way outside it, and that
difference is what hid the original failure. `npm run dev` still serves the
pages and is still what `tauri:dev` starts underneath; on its own it is a
way to look at layout, not to use the app.

**`npm run tauri:dev` is the way to run the app.** `npm test` is unaffected:
the tests mock `@tauri-apps/plugin-http`, and the test setup fails any test
that reaches the global `fetch`.

When a request fails inside the shell for any other reason, the client logs
the plugin's error to the webview console before passing it on, so the
cause can be read there.

## Versions

Both halves of the plugin are held on the 2.6 line: `tauri-plugin-http`
`~2.6` in `src-tauri/Cargo.toml`, `@tauri-apps/plugin-http` `~2.6.1` in
`package.json`. The newest 2.x release of the JavaScript package requires
`@tauri-apps/api` 2.12, and the repository is on `tauri` 2.11.2 and
`@tauri-apps/api` 2.11.0. Taking it would have moved packages this change
has no business moving, and would have left the JavaScript and Rust halves
of Tauri on different minor versions. Raise the two together, along with
Tauri itself.

The plugin's HTTP client honours the system proxy settings. If `http_proxy`
is set in the environment the app is started from, make sure `no_proxy`
covers `127.0.0.1`.

## Security position

`src-tauri/src/commands.rs` carries two notes:

```rust
// TODO: add Tauri command bridge once local HTTP API stabilizes; it supersedes the HTTP surface.
// TODO(security): loopback-only binding does not fully protect mutating endpoints such as
// projection approval; Phase 1 defers per-run bearer-token/CSRF work because this surface is
// temporary and test-heavy.
```

What this change answers:

- **The app no longer depends on the orchestrator being reachable from a
  web page.** The orchestrator has no CORS headers, so a page the operator
  visits cannot read its responses and cannot send it a JSON write. Adding
  CORS to make the app work would have opened exactly that. The plugin made
  it unnecessary.
- **What the app itself may reach is an allowlist in Rust**, scoped to the
  loopback address.

What it does not answer:

- **The per-run bearer token is still open.** The orchestrator accepts any
  request that arrives on its port. The scope narrows what *this app* may
  ask for; it does nothing about what another local process may do.
- **The command bridge is still unbuilt.** `orchestrator_bridge_status`
  reports `command_bridge_ready: false`, and that remains accurate. The
  plugin is the small step; the bridge remains available later.

## Known limits

1. **No per-run bearer token.** `commands.rs`'s security TODO stands; the plugin scope narrows who can ask, not what any local process may do.
2. **Browser-only development no longer exercises the app.** `npm run tauri:dev` is the path. Vitest is unaffected.
3. **The command bridge is still unbuilt.** `orchestrator_bridge_status` still reports `command_bridge_ready: false`, and that remains accurate.
4. **The orchestrator still has no CORS and still answers `OPTIONS` with 405.** Nothing needs it now, and adding it would re-expose the port to any page the operator visits.
5. **Overlap is checked for Static routines only**, matching `static_overlaps`. Dynamic routines are placed by the planner and do not collide this way.
6. **The overlap window is one year**, matching the importer. A collision beginning in thirteen months is admitted by both paths.
7. **The UI still covers a small fraction of the route surface.** Preferences, decomposition, Containers, routines, the occurrence override, the advisory queue and the Google Calendar chain remain unreachable from the app.
