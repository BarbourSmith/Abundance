/**
 * Helpers for "jog by caret position" on numeric inputs.
 *
 * The ▲/▼ buttons next to a numeric input step the digit just to the left of the
 * text caret: with the caret at the right edge of "123" the step is 1, between the
 * "2" and "3" it is 10, after the "1" it is 100. After a decimal point the step
 * keeps shrinking ("12.3|4" jogs by 0.1).
 *
 * The caret position is described as `placesFromPoint`: how many characters the
 * caret sits to the left of the decimal point (or the end of the string when
 * there is no decimal point). It stays meaningful when the text changes length
 * (99 → 100, 5 → -5), so it is used to put the caret back after a jog.
 */

const PLAIN_DECIMAL = /^([-+]?)(\d*)(?:\.(\d*))?$/;

/** Number of digits after the decimal point in a value's plain string form. */
const decimalsOf = (n) => {
  const s = String(n);
  const i = s.indexOf(".");
  return i === -1 || /e/i.test(s) ? 0 : s.length - i - 1;
};

/**
 * Works out the step implied by a caret position within a numeric string.
 *
 * @param {string} text - The input's text, e.g. "12.34"
 * @param {number} caret - Caret index within text
 * @returns {{ step: number, placesFromPoint: number } | null} null when the text
 *   is not a plain decimal number (e.g. "1e5", an equation)
 */
export function stepFromCaret(text, caret) {
  const match = PLAIN_DECIMAL.exec(text.trim());
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) return null;
  const signLen = match[1].length;
  const pointIndex = signLen + match[2].length;
  // A caret before the first digit steps the next place up ("|10" jogs by 100);
  // a caret before the sign counts as just after it
  const p = Math.min(Math.max(caret, signLen), match[0].length);
  const exponent = p <= pointIndex ? pointIndex - p : -(p - pointIndex - 1);
  return {
    step: Number((10 ** exponent).toFixed(Math.max(0, -exponent))),
    placesFromPoint: pointIndex - p,
  };
}

/**
 * Computes the jogged value of a numeric input.
 *
 * @param {HTMLInputElement|null} input - The input element; its caret is only used
 *   while it is focused
 * @param {*} currentValue - The value currently shown in the input
 * @param {1|-1} direction - +1 for ▲, -1 for ▼
 * @param {number} [fallbackStep=1] - Step used when there is no usable caret
 * @returns {{ value: number, text: string, placesFromPoint: number|null }}
 *   `text` keeps the original number of decimal places ("1.50" → "1.60");
 *   `placesFromPoint` is null when the caret wasn't used
 */
export function jogValue(input, currentValue, direction, fallbackStep = 1) {
  const focused =
    input != null &&
    typeof document !== "undefined" &&
    document.activeElement === input;
  const text = String(focused ? input.value : (currentValue ?? "")).trim();
  let val = Number(text);
  if (text === "" || isNaN(val)) val = 0;

  let step = fallbackStep;
  let placesFromPoint = null;
  if (focused && input.selectionEnd != null) {
    const fromCaret = stepFromCaret(text, input.selectionEnd);
    if (fromCaret) ({ step, placesFromPoint } = fromCaret);
  }

  const match = PLAIN_DECIMAL.exec(text);
  const textDecimals = match ? (match[3] ?? "").length : decimalsOf(val);
  const places = Math.min(20, Math.max(textDecimals, decimalsOf(step)));
  const value = Number((val + direction * step).toFixed(places));
  return { value, text: value.toFixed(places), placesFromPoint };
}

/**
 * Restores the caret after React has re-rendered the input with its new text.
 *
 * @param {HTMLInputElement|null} input
 * @param {number|null} placesFromPoint - From jogValue; null leaves the caret alone
 */
export function restoreCaret(input, placesFromPoint) {
  if (!input || placesFromPoint == null) return;
  requestAnimationFrame(() => {
    if (document.activeElement !== input) return;
    const text = input.value;
    const point = text.indexOf(".");
    const pointIndex = point === -1 ? text.length : point;
    const caret = Math.min(
      Math.max(pointIndex - placesFromPoint, 0),
      text.length,
    );
    input.setSelectionRange(caret, caret);
  });
}
