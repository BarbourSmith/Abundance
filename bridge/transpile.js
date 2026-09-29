import { transform } from "esbuild";

/**
 * Transpile a TypeScript Code atom to JavaScript. Mirrors the settings the
 * in-page Monaco editor uses (ES2020 target, ES module output) so the page can
 * run code the agent wrote even when the code editor has never been opened.
 * Throws an Error whose message lists esbuild's diagnostics.
 * @param {string} source
 * @returns {Promise<string>}
 */
export async function transpileCodeAtom(source) {
  try {
    const result = await transform(source, {
      loader: "ts",
      format: "esm",
      target: "es2020",
      sourcefile: "code-atom.ts",
    });
    return result.code;
  } catch (err) {
    const details = (err.errors || [])
      .map((e) =>
        e.location
          ? `line ${e.location.line}:${e.location.column} ${e.text}`
          : e.text,
      )
      .join("; ");
    throw new Error(`TypeScript did not compile: ${details || err.message}`);
  }
}
