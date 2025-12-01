import { describe, it, expect } from 'vitest';
import { parse } from 'mathjs';

describe('Hyphenated variable names', () => {
  it('should parse wood as a variable', () => {
    const node = parse('wood');
    let vars = [];
    node.traverse((n, path, parent) => {
      if (n.isSymbolNode && !(parent && parent.isFunctionNode && parent.fn && parent.fn.name === n.name)) {
        vars.push(n.name);
      }
    });
    console.log('wood variables:', vars);
    expect(vars).toEqual(['wood']);
  });

  it('should parse wood-thick as subtraction of two variables', () => {
    const node = parse('wood-thick');
    let vars = [];
    node.traverse((n, path, parent) => {
      if (n.isSymbolNode && !(parent && parent.isFunctionNode && parent.fn && parent.fn.name === n.name)) {
        vars.push(n.name);
      }
    });
    console.log('wood-thick variables:', vars);
    // mathjs parses this as wood - thick (subtraction)
    expect(vars).toEqual(['wood', 'thick']);
  });

  it('should parse wood_thick as a single variable', () => {
    const node = parse('wood_thick');
    let vars = [];
    node.traverse((n, path, parent) => {
      if (n.isSymbolNode && !(parent && parent.isFunctionNode && parent.fn && parent.fn.name === n.name)) {
        vars.push(n.name);
      }
    });
    console.log('wood_thick variables:', vars);
    expect(vars).toEqual(['wood_thick']);
  });
});
