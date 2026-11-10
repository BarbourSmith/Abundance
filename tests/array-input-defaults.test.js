/**
 * An array Input outputs its default values. It used to output 10, the number
 * default, while the panel showed the defaults it had saved.
 *
 * Run: npx vitest run --config=vitest.headless.config.ts tests/array-input-defaults.test.js
 */
import { describe, expect, it } from "vitest";
import AttachmentPoint from "../src/prototypes/attachmentpoint.js";
import Input, { arrayDefaults } from "../src/molecules/input.js";
import GlobalVariables from "../src/js/globalvariables.js";
import { Status } from "../src/prototypes/observableEntity.js";

function parentMolecule() {
  const parent = {
    inputs: [],
    propagateInputChange: () => {},
    addIO(name, valueType, defaultValue, type, options) {
      const ap = new AttachmentPoint({
        parentMolecule: parent,
        type,
        valueType,
        name,
        value: defaultValue,
        defaultValue,
        options,
        uniqueID: GlobalVariables.generateUniqueID(),
      });
      parent.inputs.push(ap);
      return ap;
    },
  };
  return parent;
}

/**
 * Builds an array Input and enables it, as its molecule does once it has
 * loaded. savedValue is what the molecule restored from its saved ioValues
 * before that.
 */
function arrayInput(options, savedValue) {
  const input = new Input({
    x: 0.1,
    y: 0.1,
    name: "positions",
    type: "array",
    options,
    uniqueID: GlobalVariables.generateUniqueID(),
    parent: parentMolecule(),
  });
  if (savedValue !== undefined) input.parentAP.value = savedValue;
  input.enable();
  return input;
}

describe("Array Input defaults", () => {
  it("reads numeric text as numbers and leaves other text alone", () => {
    expect(arrayDefaults(["1", "2.5", "4"])).toEqual([1, 2.5, 4]);
    expect(arrayDefaults(["1", "a"])).toEqual(["1", "a"]);
    expect(arrayDefaults(undefined)).toEqual([]);
  });

  it("outputs the saved defaults, as numbers", () => {
    const input = arrayInput(["1", "2.5", "4"]);
    expect(input.status).toBe(Status.READY);
    expect(input.getState().value).toEqual([1, 2.5, 4]);
    expect(input.parentAP.getValue()).toEqual([1, 2.5, 4]);
  });

  it("replaces the 10 that older projects saved for the molecule", () => {
    const input = arrayInput(["1", "2"], 10);
    expect(input.status).toBe(Status.READY);
    expect(input.getState().value).toEqual([1, 2]);
    expect(input.parentAP.getValue()).toEqual([1, 2]);
  });

  it("replaces a 10 that arrives after loading", () => {
    const input = arrayInput([1, 2]);
    input.parentAP.setValue(10);
    expect(input.getState().value).toEqual([1, 2]);
  });

  it("keeps an array saved for the molecule", () => {
    const input = arrayInput([1, 2], [5, 6]);
    expect(input.getState().value).toEqual([5, 6]);
  });

  it("keeps an array set from the parent's panel", () => {
    const input = arrayInput([1, 2]);
    input.parentAP.setValue([7, 8, 9]);
    expect(input.getState().value).toEqual([7, 8, 9]);
  });

  it("sends changed defaults downstream", () => {
    const input = arrayInput([1, 2]);
    input.setArrayDefaults(["3", "4", "5"]);
    expect(input.options).toEqual([3, 4, 5]);
    expect(input.getState().value).toEqual([3, 4, 5]);
  });

  it("doesn't overwrite a value changed in the parent when defaults change", () => {
    const input = arrayInput([1, 2]);
    input.parentAP.setValue([7]);
    input.setArrayDefaults([3]);
    expect(input.getState().value).toEqual([7]);
  });
});
