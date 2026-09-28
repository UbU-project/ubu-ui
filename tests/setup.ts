import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, vi } from "vitest";

// The app's transport is the Tauri HTTP plugin. A test that reaches the global
// fetch is exercising something the app no longer does, so it fails here.
const globalFetch = vi.fn(() => {
  throw new Error("a test reached the global fetch; mock @tauri-apps/plugin-http instead");
});

beforeEach(() => {
  vi.stubGlobal("fetch", globalFetch);
});

afterEach(() => {
  const calls = globalFetch.mock.calls.length;
  globalFetch.mockClear();
  expect(calls, "calls to the global fetch").toBe(0);
});
