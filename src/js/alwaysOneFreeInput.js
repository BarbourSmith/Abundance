import { Status } from "../prototypes/observableEntity.js";

//This module is used to create atoms which do not have a set number of inputs, but instead always have one input free.

/**
 * Computes the number of inputs which are curently available on a target atom.
 * @param {object} target - The atom which should have it's number of inputs computed.
 */
const howManyInputPortsAvailable = function (target, prefix = "Shape") {
  var portsAvailable = 0;
  target.inputs
    .filter((i) => i.name.startsWith(prefix))
    .forEach((io) => {
      if (io.type == "input" && io.connectors.length == 0) {
        //if this port is available
        portsAvailable = portsAvailable + 1; //Add one to the count
      }
    });
  return portsAvailable;
};

/**
 * Deletes one free input from an atom which has more than one free input available.
 * @param {object} target - The atom which should have one input deleted (if there are more than two free).
 */
const deleteExtraEmpties = function (target, prefix = "Shape") {
  target.inputs
    .filter(
      (i) =>
        i.name.startsWith(prefix) &&
        i.type == "input" &&
        i.connectors.length == 0,
    )
    .filter((io, index) => index != 0) // Don't delete first available
    .forEach((io) => target.removeIO("input", io.name, target));
};

/**
 * Finds the highest number input currently used by this atom
 * @param {object} target - The atom which should be inspected for inputs.
 */
const findHighestInput = function (target, prefix = "Shape") {
  var maxInput = 0;
  target.inputs
    .filter((i) => i.name.startsWith(prefix))
    .forEach((input) => {
      maxInput = Math.max(maxInput, parseInt(input.name.match(/\d+$/)[0]));
    });
  return maxInput;
};

/**
 * Adds or deletes inputs from a target atom until there is exactly one input available.
 * @param {object} target - The atom which should have it's number of inputs adjusted.
 */
export const addOrDeletePorts = (target, prefix = "Shape") => {
  if (howManyInputPortsAvailable(target, prefix) >= 2) {
    deleteExtraEmpties(target, prefix);
  }

  //Add or delete ports as needed
  if (howManyInputPortsAvailable(target, prefix) == 0) {
    //We need to make a new port available
    const highest = findHighestInput(target, prefix);

    // Create new AP and subscribe but avoid a callback right away.
    const newAp = target._addIOWithoutSubscribing(
      prefix + (highest + 1),
      "geometry",
    );
    newAp.subscribe(
      () => {
        target.onUpstreamChange();
      },
      target.uniqueID,
      false,
    );
  }
};

/**
 * Determines if inputs are ready for an alwaysOneFreeInput atom.
 * Specifically, returns true iff:
 *  * there is at least one other input with a connector
 *  * and all other inputs have a connection and are in the READY status.
 */
export const inputsReadyIgnoringFreeAP = (target, prefix = undefined) => {
  deleteExtraEmpties(target, prefix);
  const connected = target.inputs
    .filter((i) => prefix == undefined || i.name.startsWith(prefix))
    .filter((input) => input.connectors.length > 0);
  return (
    connected.length > 0 &&
    connected.every((input) => input.getState().status == Status.READY)
  );
};

export const initializeInputsFromSaved = (
  target,
  ioValues,
  prefix = "Shape",
) => {
  const ioList = [{ name: "geometry", valueType: "geometry", type: "output" }];
  if (typeof ioValues !== "undefined") {
    ioValues.forEach((ioValue) => {
      //for each saved value
      ioList.push({
        name: ioValue.name,
        valueType: "geometry",
      });
    });
  }
  if (ioList.length === 1) {
    //If there are no inputs, add a default input
    ioList.push({
      name: prefix + " 1",
      valueType: "geometry",
    });
  }
  target.addAllIOs(ioList);
};
