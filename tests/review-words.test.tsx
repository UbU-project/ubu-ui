import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { PreconditionWords } from "../src/components/PreconditionWords";

it("the reviewer's numeric word fixtures match the screen's actual text", () => {
  for (const [raw, words] of [["25.0","25"],["-0.0","0"],["1e-7","1e-7"],["1e21","1e+21"],["0.000001","0.000001"],["9007199254740993","9007199254740992"]]) {
    const view=render(<PreconditionWords precondition={{target:"numeric_values.synthetic.orbital_teapot_charge",predicate:"at_least",expected:JSON.parse(raw)}} />);
    expect(view.container.textContent).toBe(`numeric_values.synthetic.orbital_teapot_charge is at least ${words}`);view.unmount();
  }
});
