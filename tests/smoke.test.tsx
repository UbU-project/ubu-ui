import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "../src/App";

describe("UbU UI scaffold", () => {
  it("renders the default Next Task work surface", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Validate orchestrator bootstrap contract" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect Plan" })).toBeInTheDocument();
  });

  it("keeps ProjectionPreview batch approval visible", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Projection" }));

    expect(await screen.findByRole("heading", { name: "Projection preview and approval" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve ProjectionPreview batch" })).toBeInTheDocument();
  });
});
