import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { userEvent } from "@vitest/browser/context";
import React from "react";
import { SimpleControlPanel } from "../src/components/secondary/SimpleControlPanel.jsx";
import { useControls } from "../src/hooks/useControls";

/** Renders the panel the same way ParamsMenu does */
function Harness({ config }) {
  const [, , { controls }] = useControls(config, []);
  return <SimpleControlPanel controls={controls} />;
}

const nextFrame = () => new Promise(requestAnimationFrame);

/** Places the caret in the input, then clicks the arrow with a real mouse click */
async function jog(input, caret, label) {
  await userEvent.click(input);
  input.setSelectionRange(caret, caret);
  const button = input.parentElement.querySelector(
    `button[aria-label="${label}"]`,
  );
  await userEvent.click(button);
  await act(nextFrame);
}

describe("SimpleControlPanel caret-position jog", () => {
  afterEach(cleanup);

  it("jogs a number control by the digit left of the caret", async () => {
    const { container } = render(
      <Harness
        config={{ height: { type: "number", value: 123, label: "Height" } }}
      />,
    );
    const input = container.querySelector("input");

    await jog(input, 2, "Increment"); // 12|3 → +10
    expect(input.value).toBe("133");
    expect(document.activeElement).toBe(input);
    expect(input.selectionEnd).toBe(2);

    await jog(input, 1, "Decrement"); // 1|33 → -100
    expect(input.value).toBe("33");

    await jog(input, 2, "Increment"); // 33| → +1
    expect(input.value).toBe("34");
  });

  it("jogs a numeric string control, keeping decimal places", async () => {
    const { container } = render(
      <Harness
        config={{ height: { type: "string", value: "1.50", label: "Height" } }}
      />,
    );
    const input = container.querySelector("input");

    await jog(input, 3, "Increment"); // 1.5|0 → +0.1
    expect(input.value).toBe("1.60");
    expect(input.selectionEnd).toBe(3);

    await jog(input, 1, "Increment"); // 1|.60 → +1
    expect(input.value).toBe("2.60");
  });

  it("lets a number control accept an in-progress decimal while typing", async () => {
    const { container } = render(
      <Harness
        config={{ height: { type: "number", value: 5, label: "Height" } }}
      />,
    );
    const input = container.querySelector("input");
    await userEvent.click(input);
    await userEvent.fill(input, "");
    await userEvent.type(input, "2.5");
    expect(input.value).toBe("2.5");
  });
});
