# Contributing

Thanks for contributing to `ubu-ui`.

## Local Setup

Install JavaScript dependencies:

```sh
npm install
```

Run the app in browser mode:

```sh
npm run dev
```

Run the Tauri desktop shell:

```sh
npm run tauri:dev
```

## Checks

Before opening a pull request, run:

```sh
npm run build
npm run test
```

When Tauri system dependencies are installed, also run:

```sh
cd src-tauri
cargo check
```

## Linux Tauri Dependencies

Ubuntu CI runners must install Tauri v2 system dependencies before any `src-tauri` build or check. Install at least:

```sh
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libsoup-3.0-dev \
  build-essential \
  curl \
  wget \
  file \
  pkg-config
```

Adjust package names to match the Ubuntu runner release.

## Code Generation

Do not add build-time network fetches for generated code. Use the `ubu-devshell` scripts:

```sh
npm run generate:api
npm run generate:types
```

Those commands must copy or generate from pinned source revisions.

## Pull Requests

- Keep UI changes focused on Phase 1 desktop behavior.
- Do not add direct GitHub mutation from the UI.
- Do not add direct store mutation from the UI.
- Keep token handling transient. Do not persist or log pasted tokens.
