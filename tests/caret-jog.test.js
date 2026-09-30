import { describe, it, expect, afterEach } from "vitest";
import {
  stepFromCaret,
  jogValue,
  restoreCaret,
} from "../src/utils/caretJog.js";

describe("stepFromCaret", () => {
  it("steps the integer digit left of the caret", () => {
    expect(stepFromCaret("123", 3).step).toBe(1);
    expect(stepFromCaret("123", 2).step).toBe(10);
    expect(stepFromCaret("123", 1).step).toBe(100);
  });

  it("steps the next place up when the caret is before the first digit", () => {
    expect(stepFromCaret("10", 0).step).toBe(100);
    expect(stepFromCaret("1", 0).step).toBe(10);
    expect(stepFromCaret("123", 0).step).toBe(1000);
    // A caret before the sign counts as just after it
    expect(stepFromCaret("-123", 0).step).toBe(1000);
    expect(stepFromCaret("-123", 1).step).toBe(1000);
  });

  it("steps fractional digits after the decimal point", () => {
    expect(stepFromCaret("12.34", 2).step).toBe(1);
    expect(stepFromCaret("12.34", 3).step).toBe(1);
    expect(stepFromCaret("12.34", 4).step).toBe(0.1);
    expect(stepFromCaret("12.34", 5).step).toBe(0.01);
  });

  it("returns null for text that isn't a plain decimal", () => {
    expect(stepFromCaret("1e5", 1)).toBeNull();
    expect(stepFromCaret("width*2", 2)).toBeNull();
    expect(stepFromCaret("", 0)).toBeNull();
    expect(stepFromCaret("-", 1)).toBeNull();
  });
});

describe("jogValue", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  /** A real, focused input with the caret at `caret` */
  const focusedInput = (value, caret) => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    document.body.appendChild(input);
    input.focus();
    input.setSelectionRange(caret, caret);
    return input;
  };

  it("uses the caret position when the input is focused", () => {
    expect(jogValue(focusedInput("123", 2), "123", 1).value).toBe(133);
    expect(jogValue(focusedInput("123", 1), "123", -1).value).toBe(23);
    expect(jogValue(focusedInput("1.25", 3), "1.25", 1).value).toBe(1.35);
  });

  it("avoids floating point noise and keeps trailing zeros in text", () => {
    expect(jogValue(focusedInput("0.2", 3), "0.2", 1).value).toBe(0.3);
    expect(jogValue(focusedInput("1.50", 3), "1.50", 1).text).toBe("1.60");
  });

  it("reports the caret position relative to the decimal point", () => {
    expect(jogValue(focusedInput("99", 1), "99", 1).placesFromPoint).toBe(1);
    expect(jogValue(focusedInput("1.25", 4), "1.25", 1).placesFromPoint).toBe(
      -3,
    );
  });

  it("falls back to the given step when the input isn't focused", () => {
    const input = focusedInput("123", 1);
    input.blur();
    const result = jogValue(input, 123, 1, 0.1);
    expect(result.value).toBe(123.1);
    expect(result.placesFromPoint).toBeNull();
    expect(jogValue(null, "7", -1).value).toBe(6);
  });

  it("restores the caret onto the same digit after the text grows", async () => {
    const input = focusedInput("99", 1);
    const { value, placesFromPoint } = jogValue(input, "99", 1);
    input.value = String(value); // what React would render: "109"
    restoreCaret(input, placesFromPoint);
    await new Promise(requestAnimationFrame);
    expect(input.selectionEnd).toBe(2); // "10|9" — still on the tens digit
  });
});
