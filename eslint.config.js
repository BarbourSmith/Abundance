import tseslint from "typescript-eslint";

export default tseslint.config({
  files: ["src/**/*.ts", "src/**/*.tsx"],
  extends: [...tseslint.configs.recommended],
  languageOptions: {
    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    // Most important: catch missing awaits on async calls
    "@typescript-eslint/no-floating-promises": "error",
    // Warn on explicit any usage
    "@typescript-eslint/no-explicit-any": "warn",
  },
});
