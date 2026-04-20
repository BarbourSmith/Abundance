import React, { useEffect, useRef } from "react";
import MonacoEditor, { OnMount } from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";

type ApiDef = {
  type?: string;
  requiredParams?: string[];
  optionalParams?: string[];
  usage?: string;
  returns?: string;
  detail?: string;
  properties?: string[];
};

type ApiJson = Record<string, ApiDef> | null | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a markdown documentation string for Monaco hover/completion tooltips. */
function buildDocString(key: string, def: ApiDef): string {
  const params = [...(def.requiredParams ?? []), ...(def.optionalParams ?? [])];
  const sig = def.usage ?? `${key}(${params.join(", ")})`;
  const lines: string[] = [`**${key}**`, "```\n" + sig + "\n```"];
  if (params.length) lines.push(`*Parameters:* ${params.join(", ")}`);
  if (def.returns) lines.push(`*Returns:* ${def.returns}`);
  return lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// Build Monaco completion items from an API JSON blob
// ---------------------------------------------------------------------------
// Minimal local alias so we don't need a direct monaco-editor package import.
type IRange = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

// ---------------------------------------------------------------------------
// Build Monaco completion items from an API JSON blob
// ---------------------------------------------------------------------------
function buildCompletionItems(
  monaco: Monaco,
  apiJson: ApiJson,
  isReplicad: boolean,
  range: IRange,
): any[] {
  if (!apiJson) return [];
  const items: any[] = [];

  for (const [key, def] of Object.entries(apiJson)) {
    const params = [
      ...(def.requiredParams ?? []),
      ...(def.optionalParams ?? []),
    ];
    const paramsStr = params.join(", ");
    const isInstanceMethod = key.includes(".");
    const methodName = isInstanceMethod ? key.split(".")[1] : key;

    // AbundanceObject structure template
    if (
      key === "AbundanceObject" &&
      def.type === "object" &&
      Array.isArray(def.properties)
    ) {
      const propLines = (def.properties as string[]).map((prop) => {
        const [propName, propType] = prop.split(":").map((s) => s.trim());
        const example =
          propName === "geometry"
            ? "[createdShape]"
            : propName === "dimension"
              ? '"3D"'
              : propName === "tags"
                ? '["createdShape"]'
                : propName === "color"
                  ? "'#A3CE5B'"
                  : propName === "plane"
                    ? "newPlane"
                    : propName === "bom"
                      ? "[]"
                      : propType === "String"
                        ? '""'
                        : propType === "Array"
                          ? "[]"
                          : "null";
        return `  ${propName}: ${example},`;
      });
      items.push({
        label: "AbundanceObject",
        kind: monaco.languages.CompletionItemKind.Struct,
        detail: "AbundanceObject structure",
        documentation: { value: buildDocString(key, def) },
        insertText: "{\n" + propLines.join("\n") + "\n}",
        range,
      });
      continue;
    }

    let insertText: string;
    if (isReplicad) {
      insertText = isInstanceMethod
        ? `${methodName}(${paramsStr})`
        : `replicad.${key}(${paramsStr})`;
    } else {
      // Abundance functions are always awaited
      insertText = `await ${key}(${paramsStr})`;
    }

    const kind =
      def.type === "class_constructor"
        ? monaco.languages.CompletionItemKind.Constructor
        : isInstanceMethod
          ? monaco.languages.CompletionItemKind.Method
          : monaco.languages.CompletionItemKind.Function;

    items.push({
      label: isReplicad && !isInstanceMethod ? `replicad.${key}` : methodName,
      kind,
      detail: def.usage ?? `(${paramsStr}) → ${def.returns ?? ""}`,
      documentation: { value: buildDocString(key, def) },
      insertText,
      range,
      sortText: isReplicad ? `0_${key}` : `1_${key}`,
    });
  }

  return items;
}

// (Monaco's built-in JS language service already provides completions for
// console, Math, JSON, Object, etc. — no need to duplicate them here.)

// ---------------------------------------------------------------------------
// Ambient type declarations injected into Monaco's JS language service.
// These enable type-aware completions (e.g. cyl.translate()) in JS mode
// without any red squiggles (checkJs: false).
// ---------------------------------------------------------------------------

/** Abundance built-in async globals available inside every code atom. */
const ABUNDANCE_AMBIENT_TYPES = `
declare const replicad: typeof import("replicad");
declare const library: Record<string, any>;
declare function Move(shape: any, x?: number, y?: number, z?: number): Promise<any>;
declare function Rotate(shape: any, x?: number, y?: number, z?: number): Promise<any>;
declare function Scale(shape: any, factor: number): Promise<any>;
declare function Assembly(shapes: any[]): Promise<any>;
declare function Intersect(a: any, b: any): Promise<any>;
declare function CutAssembly(shape: any, cutters: any[]): Promise<any>;
declare function Fillet(shape: any, radius: number): Promise<any>;
declare function Chamfer(shape: any, size: number): Promise<any>;
declare function AssemblyMap(assembly: any, fn: (s: any) => Promise<any>): Promise<any>;
declare function AssemblyAsIterable(assembly: any): Promise<any[]>;
declare function GetBounds(shape: any): any;
`;

// ---------------------------------------------------------------------------
// Variable type inference (lightweight – mirrors the old CodeMirror version)
// ---------------------------------------------------------------------------
function inferVariableType(
  varName: string,
  code: string,
  api: ApiJson,
): string | null {
  if (!api) return null;

  // replicad top-level: let x = replicad.method(...)
  const m1 = code.match(
    new RegExp(
      `\\b(?:let|const|var)\\s+${varName}\\s*=\\s*replicad\\.([a-zA-Z_$][\\w$]*)\\s*\\(`,
    ),
  );
  if (m1) return api[m1[1]]?.returns ?? null;

  // chained: let x = someVar.method(...)
  const m2 = code.match(
    new RegExp(
      `\\b(?:let|const|var)\\s+${varName}\\s*=\\s*([a-zA-Z_$][\\w$]*)\\.([a-zA-Z_$][\\w$]*)\\s*\\(`,
    ),
  );
  if (m2) {
    const sourceType = inferVariableType(m2[1], code, api);
    if (sourceType) return api[`${sourceType}.${m2[2]}`]?.returns ?? null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReactCodeEditorWithApiAutocomplete(props: {
  value: string;
  onChange: (v: string) => void;
  apiJson?: ApiJson;
  abundanceJson?: ApiJson;
  activeAtom?: { saveCode: () => void } | null;
}) {
  const { value, onChange, apiJson, abundanceJson, activeAtom } = props;

  // Use refs so the completion provider closure always sees latest values
  // without needing to be re-registered.
  const activeAtomRef = useRef(activeAtom);
  const apiJsonRef = useRef(apiJson);
  const abundanceJsonRef = useRef(abundanceJson);

  useEffect(() => {
    activeAtomRef.current = activeAtom;
  }, [activeAtom]);
  useEffect(() => {
    apiJsonRef.current = apiJson;
  }, [apiJson]);
  useEffect(() => {
    abundanceJsonRef.current = abundanceJson;
  }, [abundanceJson]);

  const handleMount: OnMount = (editor, monaco) => {
    // Ctrl/Cmd + S  →  save code
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      activeAtomRef.current?.saveCode();
    });

    // ---------------------------------------------------------------------------
    // Inject type definitions into Monaco's JS language service so it can infer
    // variable types (e.g. cyl → Shape3D → shows only valid .translate() etc.)
    // checkJs: false means completions work but no red squiggles in JS mode.
    // ---------------------------------------------------------------------------
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      checkJs: false,
      noEmit: true,
    });

    // Inject Abundance globals (Move, Assembly, library, replicad namespace, etc.)
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      ABUNDANCE_AMBIENT_TYPES,
      "ts:abundance-ambient.d.ts",
    );

    // Inject replicad's shipped .d.ts (copied to public/ at build time).
    // This gives Monaco full type info for Shape3D, Drawing, Sketch, etc.,
    // enabling correct per-type member completions on user-defined variables.
    fetch("/replicad.d.ts")
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((dts) => {
        monaco.languages.typescript.javascriptDefaults.addExtraLib(
          dts,
          "ts:replicad.d.ts",
        );
      })
      .catch(() => {
        // If the file isn't available (e.g. first run before copy-types), the
        // custom completion providers below still work as a fallback.
        console.warn(
          "replicad.d.ts not found in /public — run `npm run copy-types` to enable full type inference",
        );
      });

    // ---------------------------------------------------------------------------
    // Provider 1: replicad.XXX  — fires ONLY after the literal token "replicad."
    // Offers every top-level replicad function as a member of the replicad namespace.
    // ---------------------------------------------------------------------------
    monaco.languages.registerCompletionItemProvider("javascript", {
      triggerCharacters: ["."],
      provideCompletionItems(model: any, position: any) {
        const linePrefix = model
          .getLineContent(position.lineNumber)
          .substring(0, position.column - 1);

        // Bail out unless the text immediately before the cursor is "replicad."
        if (!/\breplicad\.$/.test(linePrefix)) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        // Only top-level (non-instance) replicad entries — strip the "replicad." prefix
        // from the label/insertText because we're already after "replicad."
        return {
          suggestions: buildCompletionItems(
            monaco,
            apiJsonRef.current,
            true,
            range,
          )
            .filter((item) => !(item.label as string).includes("."))
            .map((item) => ({
              ...item,
              // label was "replicad.foo" → show just "foo"
              label: (item.label as string).replace(/^replicad\./, ""),
              // insertText was "replicad.foo(...)" → strip the namespace prefix
              insertText: (item.insertText as string).replace(
                /^replicad\./,
                "",
              ),
            })),
        };
      },
    });

    // ---------------------------------------------------------------------------
    // Provider 2: variable instance methods — fires after "someVar." when the
    // variable's type can be inferred from the code (e.g. let s = replicad.makeBox(...))
    // Skips "replicad." (handled above) and known JS globals like "console.", "Math."
    // ---------------------------------------------------------------------------
    const JS_GLOBALS = new Set([
      "console",
      "Math",
      "JSON",
      "Object",
      "Array",
      "String",
      "Number",
      "Promise",
    ]);

    monaco.languages.registerCompletionItemProvider("javascript", {
      triggerCharacters: ["."],
      provideCompletionItems(model: any, position: any) {
        const linePrefix = model
          .getLineContent(position.lineNumber)
          .substring(0, position.column - 1);

        // Only fire when there's a dot at the end
        if (!linePrefix.endsWith(".")) return { suggestions: [] };

        const varName = linePrefix
          .slice(0, -1)
          .trim()
          .match(/([a-zA-Z_$][\w$]*)$/)?.[1];
        if (!varName) return { suggestions: [] };

        // Let the other provider (or Monaco's built-in service) handle these
        if (varName === "replicad" || JS_GLOBALS.has(varName))
          return { suggestions: [] };

        const api = apiJsonRef.current;
        if (!api) return { suggestions: [] };

        const allCode = model.getValue();
        const varType = inferVariableType(varName, allCode, api);
        if (!varType) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const typeList = varType.includes("AnyShape")
          ? ["Shape", "Shape3D", "Sketch", "Sketches", "Wire", "Face", "Solid"]
          : varType.split("|").map((t) => t.trim());

        const suggestions: any[] = [];
        for (const t of typeList) {
          for (const [key, def] of Object.entries(api)) {
            if (!key.startsWith(t + ".")) continue;
            const mName = key.split(".")[1];
            const params = [
              ...(def.requiredParams ?? []),
              ...(def.optionalParams ?? []),
            ];
            suggestions.push({
              label: mName,
              kind: monaco.languages.CompletionItemKind.Method,
              detail: `(${params.join(", ")}) → ${def.returns ?? ""}`,
              documentation: { value: buildDocString(key, def) },
              insertText: `${mName}(${params.join(", ")})`,
              range,
            });
          }
        }
        return { suggestions };
      },
    });

    // ---------------------------------------------------------------------------
    // Provider 3: Abundance top-level functions (Move, Assembly, Rotate, etc.)
    // These are bare async calls — NOT member access — so we suppress this provider
    // whenever the cursor is after a "." to avoid polluting member completions.
    // ---------------------------------------------------------------------------
    monaco.languages.registerCompletionItemProvider("javascript", {
      // No triggerCharacters: fires on word characters only (the default)
      provideCompletionItems(model: any, position: any) {
        const linePrefix = model
          .getLineContent(position.lineNumber)
          .substring(0, position.column - 1);

        // Suppress inside any member-access expression (anything.__)
        if (/\w+\.$/.test(linePrefix)) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        // Only top-level (non-instance) abundance entries
        return {
          suggestions: buildCompletionItems(
            monaco,
            abundanceJsonRef.current,
            false,
            range,
          ).filter((item) => !(item.label as string).includes(".")),
        };
      },
    });
  };

  return (
    <MonacoEditor
      height="100%"
      language="javascript"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        automaticLayout: true,
        tabSize: 2,
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        parameterHints: { enabled: true },
        formatOnPaste: true,
        scrollbar: { vertical: "auto" },
      }}
    />
  );
}
