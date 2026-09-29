// Bundle bridge/ and the shared src/agent/ files into dist/index.js so the
// package runs without the rest of the Abundance repo. npm dependencies stay
// external and install from this package's package.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const outfile = path.join(here, "dist", "index.js");

fs.rmSync(path.join(here, "dist"), { recursive: true, force: true });
await build({
  entryPoints: [path.join(here, "..", "..", "bridge", "index.js")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  packages: "external",
  logLevel: "warning",
});
fs.chmodSync(outfile, 0o755);
console.log(`built ${path.relative(process.cwd(), outfile)}`);
