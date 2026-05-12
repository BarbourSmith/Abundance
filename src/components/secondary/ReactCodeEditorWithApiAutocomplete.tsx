import React, { useEffect, useRef } from "react";
import MonacoEditor, { OnMount } from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";
// Generated from src/worker/ts-framework.ts — run `npm run build:ts-framework` to regenerate.
import ABUNDANCE_TS_AMBIENT_TYPES from "../../worker/generated/ts-framework.generated.d.ts?raw";

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

/** Abundance built-in async globals available inside every JS code atom. */
const ABUNDANCE_JS_AMBIENT_TYPES = `
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

// ABUNDANCE_TS_AMBIENT_TYPES is imported at the top of this file from
// src/worker/generated/ts-framework.generated.d.ts (generated from
// src/worker/ts-framework.ts). Do not maintain types inline here.

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
  /** 0 = JavaScript (default, backwards-compatible). 1 = TypeScript (strict). */
  interpreterVersion?: number;
  /** Called once the Monaco editor has mounted, so callers can use the
   *  TypeScript worker (e.g. to transpile TS → JS at save time). */
  onEditorReady?: (editor: any, monaco: Monaco) => void;
}) {
  const {
    value,
    onChange,
    apiJson,
    abundanceJson,
    activeAtom,
    interpreterVersion = 0,
    onEditorReady,
  } = props;
  const language = interpreterVersion >= 1 ? "typescript" : "javascript";

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

    // Expose editor + monaco to the parent so it can, for example,
    // invoke the TypeScript worker to transpile the current model.
    onEditorReady?.(editor, monaco);

    // ---------------------------------------------------------------------------
    // Configure the TS/JS language service based on interpreter version.
    // v0 (JS): completions only, no squiggles.
    // v1 (TS): full strict type checking with red squiggles.
    // We configure both javascriptDefaults and typescriptDefaults so the
    // settings are ready whichever language the editor switches to.
    // ---------------------------------------------------------------------------
    const jsOpts = {
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      checkJs: false, // v0: no squiggles in JS mode
      // noEmit intentionally false: Code atoms call getEmitOutput() at save
      // time to transpile TS -> JS. Setting noEmit: true makes the TS worker
      // return { emitSkipped: true, outputFiles: [] }.
      noEmit: false,
    };
    const tsOpts = {
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      // Emit ESNext module syntax (`import`/`export`) rather than CommonJS
      // so that user `import` statements survive transpilation. Code atoms
      // run as real ES modules via Blob URL in the worker — see
      // `src/worker/code.ts#executeTsCode`.
      module: monaco.languages.typescript.ModuleKind.ESNext,
      allowNonTsExtensions: true,
      strict: true,
      noEmit: false,
    };
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(jsOpts);
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(tsOpts);

    // Inject per-language Abundance globals. Both language services have
    // their own ambient type set so that switching modes swaps the visible
    // API surface (TS drops the JS helper functions like Chamfer/Move).
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      ABUNDANCE_JS_AMBIENT_TYPES,
      "ts:abundance-ambient-js.d.ts",
    );
    // Register the TS ambient lib under a `file:///` URI (rather than the
    // `ts:` scheme) so that the `import * as _replicad from "replicad"`
    // statement at the top of the generated ts-framework .d.ts can be
    // resolved by Monaco's node-style module resolver — it walks up from
    // this file looking for `node_modules/replicad/index.d.ts`, which we
    // inject below at exactly that path. Without a `file:///` URI here,
    // resolution fails and `_replicad.AnyShape` collapses to `any`,
    // making `AbundanceObj.geometry` show up as `any` in Monaco.
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      ABUNDANCE_TS_AMBIENT_TYPES,
      "file:///abundance-ts-framework.d.ts",
    );

    // Replicad .d.ts applies to both (user may import types in TS mode).
    const injectLib = (dts: string, filename: string) => {
      monaco.languages.typescript.javascriptDefaults.addExtraLib(dts, filename);
      monaco.languages.typescript.typescriptDefaults.addExtraLib(dts, filename);
    };

    // Inject replicad's shipped .d.ts (copied to public/ at build time).
    fetch("/replicad.d.ts")
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((dts) => {
        injectLib(dts, "file:///replicad.d.ts");
      })
      .catch(() => {
        console.warn(
          "replicad.d.ts not found in /public — run `npm run copy-types` to enable full type inference",
        );
      });

    // ---------------------------------------------------------------------------
    // Auto-fetch types for external `import ... from 'https://esm.sh/...'`
    // statements. The types live at the URL esm.sh returns in the
    // `X-TypeScript-Types` response header. Fetched .d.ts strings are added
    // as extra libs so Monaco resolves the bare module specifier seen by its
    // TS worker when `moduleResolution` walks the HTTPS import spec.
    //
    // Silent on failure — user falls back to `any` typing, which is still
    // usable. Cached per-URL to avoid re-fetching on every keystroke.
    // ---------------------------------------------------------------------------
    const fetchedExternalTypes = new Set<string>();
    const EXTERNAL_IMPORT_RE =
      /\bimport\s+(?:(?:[\w*{}\s,]+?)\s+from\s+)?["'](https:\/\/esm\.sh\/[^"']+)["']/g;

    const syncExternalTypes = (source: string) => {
      for (const match of source.matchAll(EXTERNAL_IMPORT_RE)) {
        const url = match[1];
        if (fetchedExternalTypes.has(url)) continue;
        fetchedExternalTypes.add(url);
        // HEAD request first to read the X-TypeScript-Types header without
        // pulling the JS bundle.
        fetch(url, { method: "HEAD" })
          .then((r) => {
            const typesUrl = r.headers.get("X-TypeScript-Types");
            if (!typesUrl) return Promise.reject("no types header");
            return fetch(typesUrl).then((tr) =>
              tr.ok ? tr.text() : Promise.reject("types fetch failed"),
            );
          })
          .then((dts) => {
            // Register the types under the exact import URL so Monaco's TS
            // worker matches them to the user's `from 'https://esm.sh/...'`.
            injectLib(dts, `ts:external-${url}.d.ts`);
          })
          .catch(() => {
            // Silent — user code still works, just with `any` types.
          });
      }
    };

    editor.onDidChangeModelContent(() => {
      syncExternalTypes(editor.getValue());
    });
    // Also scan the initial content on mount.
    syncExternalTypes(editor.getValue());

    // ---------------------------------------------------------------------------
    // Provider 1: replicad.XXX  — fires ONLY after the literal token "replicad."
    // Registered for both "javascript" and "typescript" so it works in either mode.
    // ---------------------------------------------------------------------------
    for (const lang of ["javascript", "typescript"] as const) {
      monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ["."],
        provideCompletionItems(model: any, position: any) {
          const linePrefix = model
            .getLineContent(position.lineNumber)
            .substring(0, position.column - 1);

          if (!/\breplicad\.$/.test(linePrefix)) return { suggestions: [] };

          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

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
                label: (item.label as string).replace(/^replicad\./, ""),
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
      // Skips "replicad." (handled above) and known JS/TS globals.
      // In TS mode, Monaco's own service handles this better; we still register as
      // a fallback for variables whose types come from our custom API JSON.
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

      monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ["."],
        provideCompletionItems(model: any, position: any) {
          const linePrefix = model
            .getLineContent(position.lineNumber)
            .substring(0, position.column - 1);

          if (!linePrefix.endsWith(".")) return { suggestions: [] };

          const varName = linePrefix
            .slice(0, -1)
            .trim()
            .match(/([a-zA-Z_$][\w$]*)$/)?.[1];
          if (!varName) return { suggestions: [] };
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
            ? [
                "Shape",
                "Shape3D",
                "Sketch",
                "Sketches",
                "Wire",
                "Face",
                "Solid",
              ]
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
      // Only registered for JavaScript; TypeScript users are pushed toward
      // `geometry.chamfer(...)` style method calls instead.
      // ---------------------------------------------------------------------------
      if (lang === "javascript") {
        monaco.languages.registerCompletionItemProvider(lang, {
          provideCompletionItems(model: any, position: any) {
            const linePrefix = model
              .getLineContent(position.lineNumber)
              .substring(0, position.column - 1);

            if (/\w+\.$/.test(linePrefix)) return { suggestions: [] };

            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };

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
      }
    }
  };

  return (
    <MonacoEditor
      height="100%"
      language={language}
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
