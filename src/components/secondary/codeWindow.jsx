import React from "react";
import { useEffect, useState } from "react";
import ReactCodeEditor from "@uiw/react-codemirror";
import { keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import {
  loadLanguage,
  langNames,
  langs,
} from "@uiw/codemirror-extensions-langs";
import { javascript, esLint } from "@codemirror/lang-javascript";
import { linter, lintGutter } from "@codemirror/lint";
import { andromeda, andromedaInit } from "@uiw/codemirror-theme-andromeda";

// Uses linter.mjs
import * as eslint from "eslint-linter-browserify";

/*
 * CodeWindow component is a code editor window that allows the user to edit the code of the active code atom.
 */
export default function CodeWindow(props) {
  const [docvalue, setdocValue] = useState("");
  const extensions = [keymap.of(defaultKeymap)];

  loadLanguage("javascript");

  langs.javascript();

  useEffect(() => {
    if (props.activeAtom != null) {
      setdocValue(props.activeAtom.code);
    }
  }, [props.activeAtom]);

  /**
   * Closes the code editor window.
   */
  function closeEditor() {
    const codeWindow = document.getElementById("code-window");
    codeWindow.classList.add("code-off");
  }

  const config = {
    parserOptions: {
      ecmaVersion: 6,
      ecmaFeatures: {
        jsx: true,
        globalReturn: true,
      },
    },
    rules: {
      semi: "error",
      "callback-return": "off",
    },

  };

  return (
    <div id="code-window" className=" code-off login-page code-window-div">
      <ReactCodeEditor
        width="100%"
        height="500px"
        extensions={[
          keymap.of({
            key: "Mod-s",
            run: () => {
              console.log("mod-s pressed, attempting to save code");
              if (props.activeAtom != null) {
                props.activeAtom.saveCode();
              }
              return true;
            },
            preventDefault: true,
          }),
          langs.javascript(),
          linter(
            esLint(new eslint.Linter(), {
              rules: {
                semi: ["error", "never"],
                "no-undef": ["warn"],
              },
            })
          ),
          lintGutter(),
        ]}
        value={docvalue}
        onChange={(value) => {
          setdocValue(value);
        }}
        theme={andromeda}
      />
      <button
        type="button"
        onClick={() => props.activeAtom.updateCode(docvalue)}
        style={{ display: "none" }}
        id="save-code-button"
      >
        Save Code
      </button>
      <button
        type="button"
        style={{ display: "none" }}
        id="close-code-button"
        onClick={() => closeEditor()}
      >
        Close Editor
      </button>
    </div>
  );
}
