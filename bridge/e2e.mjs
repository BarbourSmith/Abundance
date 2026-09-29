#!/usr/bin/env node
/**
 * End-to-end check of the local agent bridge against a running Abundance.
 *
 * Starts the real bridge (WebSocket hub + MCP server) in this process, opens a
 * public project in headless Chromium, pairs it through the Connect an AI
 * agent dialog, and drives it with an MCP client exactly as Claude Code would.
 *
 * Usage (with `npm start` running):
 *   node bridge/e2e.mjs [--base http://localhost:4444] [--project moatmaslow/Wall-Anchor] [--headed]
 *
 * Exits non-zero if any check fails. Makes no changes that outlive the page:
 * edits are undone and run mode never saves.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./mcpServer.js";
import { PageHub } from "./pageHub.js";
import { generateToken } from "./token.js";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = flag(
  "--base",
  process.env.ABUNDANCE_BASE_URL || "http://localhost:4444",
);
const PROJECT = flag("--project", "moatmaslow/Wall-Anchor");
const HEADED = args.includes("--headed");

const results = [];
async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ok   ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

const token = generateToken();
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "abundance-e2e-"));
const hub = new PageHub({ token, port: 0, bridgeVersion: "e2e" });
const port = await hub.start();
const { server } = createMcpServer(hub, {
  outDir,
  tokenInfo: { token, file: null },
  version: "e2e",
});
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "abundance-e2e", version: "1.0.0" });
await client.connect(clientTransport);

async function call(name, argsObj = {}) {
  const result = await client.callTool(
    { name, arguments: argsObj },
    undefined,
    { timeout: 300_000 },
  );
  const text = result.content.find((c) => c.type === "text")?.text;
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // plain text result
  }
  if (result.isError) {
    const err = new Error(`${name} failed: ${data?.message || text}`);
    err.payload = data;
    throw err;
  }
  return { data, content: result.content };
}

async function expectError(name, argsObj, errorName) {
  try {
    await call(name, argsObj);
  } catch (err) {
    assert.equal(
      err.payload?.error,
      errorName,
      `${name} should fail with ${errorName}, got ${err.message}`,
    );
    return err.payload;
  }
  throw new Error(`${name} should have failed with ${errorName}`);
}

const waitFor = async (predicate, timeoutMs, what) => {
  const start = Date.now();
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs)
      throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
};

console.log(`Bridge on port ${port}; opening ${BASE}/run/${PROJECT}`);
const browser = await chromium.launch({ headless: !HEADED });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (err) => console.log(`  [page error] ${err.message}`));

try {
  await page.goto(`${BASE}/run/${PROJECT}`);

  const dialog = () =>
    page.getByRole("dialog", { name: "Connect an AI agent" });

  await check("opens Connect an AI agent from an #agent link", async () => {
    await page.evaluate(() => {
      window.location.hash = "agent";
    });
    await dialog().waitFor({ timeout: 5000 });
    assert.equal(await page.evaluate(() => window.location.hash), "");
    await dialog().getByRole("button", { name: "Done" }).click();
    await dialog().waitFor({ state: "detached", timeout: 5000 });
  });

  await check(
    "saves a pasted token even when the dialog is closed with Escape",
    async () => {
      await page.getByRole("button", { name: "Connect an AI agent" }).click();
      await dialog().getByLabel("Pairing token").fill("abd-not-the-real-token");
      await page.keyboard.press("Escape");
      await dialog().waitFor({ state: "detached", timeout: 5000 });
      const saved = await page.evaluate(
        () => JSON.parse(localStorage.getItem("abundance-agent-bridge")).token,
      );
      assert.equal(saved, "abd-not-the-real-token");
    },
  );

  await check("pairs through the AI agent button", async () => {
    await page.getByRole("button", { name: "Connect an AI agent" }).click();
    await dialog().getByLabel("Pairing token").fill(token);
    await dialog().getByLabel("Port").fill(String(port));
    await dialog().getByLabel("Connect local AI agent").check();
    await waitFor(
      async () => hub.listSessions().length === 1,
      15_000,
      "the page to connect",
    );
    await dialog().getByRole("button", { name: "Done" }).click();
    const [owner, repo] = PROJECT.split("/");
    await waitFor(
      async () => hub.listSessions()[0]?.project?.repo === repo,
      60_000,
      "the project to be reported",
    );
    assert.equal(hub.listSessions()[0].project.owner, owner);
  });

  let firstGeometryAtom = null;

  await check("waits for the project to finish computing", async () => {
    const { data } = await call("wait_for_settle", { timeout_ms: 180_000 });
    assert.equal(data.settled, true, JSON.stringify(data));
    assert.ok(data.progress.total > 0);
  });

  await check("summarizes the project", async () => {
    const { data } = await call("get_project");
    assert.equal(`${data.project.owner}/${data.project.repo}`, PROJECT);
    assert.equal(data.edits_enabled, false);
  });

  await check("lists atoms and describes one in detail", async () => {
    const { data } = await call("list_atoms");
    assert.ok(data.atoms.length > 0);
    const candidate = data.atoms.find(
      (a) => a.type !== "Output" && a.status === "ready" && a.feeds?.length,
    );
    assert.ok(candidate, "a ready atom with downstream connections");
    const { data: detail } = await call("get_atom", { atom: candidate.id });
    assert.equal(detail.id, candidate.id);
    assert.ok(Array.isArray(detail.params));
    if (detail.output?.bounding_box) firstGeometryAtom = candidate;
  });

  await check("renders a PNG of the project", async () => {
    const { content } = await call("render_image", { view: "iso", size: 400 });
    const image = content.find((c) => c.type === "image");
    assert.ok(image, "image content");
    const bytes = Buffer.from(image.data, "base64");
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  });

  await check("exports STL to disk", async () => {
    const { data } = await call("export_geometry", { format: "STL" });
    assert.ok(fs.existsSync(data.path), data.path);
    assert.ok(data.bytes > 84, `STL is ${data.bytes} bytes`);
  });

  await check("refuses edits until the user allows them", async () => {
    await expectError("add_atom", { type: "Constant" }, "PERMISSION_DENIED");
  });

  await check("turns on edits from the chip", async () => {
    await page.getByLabel("Allow edits").check();
    await waitFor(
      async () => hub.listSessions()[0]?.mode === "edit",
      5000,
      "edit mode",
    );
  });

  await check(
    "adds, edits, and wires atoms as one undo step, then undoes it",
    async () => {
      const before = (await call("list_atoms")).data.atoms.length;
      const { data } = await call("apply_edits", {
        description: "e2e check",
        edits: [
          {
            tool: "add_atom",
            arguments: { type: "Constant", name: "E2E_Width" },
          },
          {
            tool: "add_atom",
            arguments: { type: "Equation", ref: "E2E_Double" },
          },
          {
            tool: "set_param",
            arguments: {
              atom: "E2E_Double",
              param: "Current Equation",
              value: "x * 2",
            },
          },
          {
            tool: "connect",
            arguments: { from: "E2E_Width", to: "E2E_Double", input: "x" },
          },
        ],
      });
      assert.equal(data.applied, 4);
      const doubleId = data.results[1].result.id;
      await call("wait_for_settle", { timeout_ms: 60_000 });
      const { data: doubled } = await call("get_atom", { atom: doubleId });
      assert.equal(doubled.output?.value, 20, JSON.stringify(doubled.output));

      const { data: history } = await call("get_undo_history");
      assert.deepEqual(history.steps[0], {
        description: "AI: e2e check",
        by_agent: true,
      });
      await call("undo");
      await call("wait_for_settle", { timeout_ms: 120_000 });
      const after = (await call("list_atoms")).data.atoms.length;
      assert.equal(after, before);
    },
  );

  await check("rolls back a batch that fails part way", async () => {
    const before = (await call("list_atoms")).data.atoms.length;
    await expectError(
      "apply_edits",
      {
        description: "should roll back",
        edits: [
          {
            tool: "add_atom",
            arguments: { type: "Constant", name: "E2E_Temp" },
          },
          {
            tool: "set_param",
            arguments: { atom: "E2E_Temp", param: "No such param", value: 1 },
          },
        ],
      },
      "NOT_FOUND",
    );
    assert.equal((await call("list_atoms")).data.atoms.length, before);
  });

  await check(
    "imports RotatePattern from the library and patterns a part",
    async () => {
      const { data: lib } = await call("list_library_molecules", {
        query: "pattern",
      });
      assert.ok(
        lib.molecules.some((m) => m.repo === "BarbourSmith/RotatePattern"),
      );
      const before = (await call("list_atoms")).data.atoms.length;
      await call("apply_edits", {
        description: "e2e pattern check",
        edits: [
          {
            tool: "add_atom",
            arguments: { type: "Rectangle", ref: "E2E_Blade" },
          },
          {
            tool: "add_github_molecule",
            arguments: {
              repo: "BarbourSmith/RotatePattern",
              name: "E2E_Pattern",
            },
          },
          {
            tool: "connect",
            arguments: { from: "E2E_Blade", to: "E2E_Pattern", input: "Shape" },
          },
          {
            tool: "set_param",
            arguments: { atom: "E2E_Pattern", param: "Number", value: 4 },
          },
          {
            tool: "set_param",
            arguments: { atom: "E2E_Pattern", param: "Angle", value: 90 },
          },
        ],
      });
      await call("wait_for_settle", { timeout_ms: 120_000 });
      const { data: pattern } = await call("get_atom", { atom: "E2E_Pattern" });
      assert.equal(pattern.type, "GitHubMolecule");
      assert.equal(
        pattern.status,
        "ready",
        JSON.stringify(pattern.error || pattern.status),
      );
      assert.equal(
        pattern.output?.part_count,
        4,
        JSON.stringify(pattern.output),
      );
      await call("undo");
      await call("wait_for_settle", { timeout_ms: 120_000 });
      assert.equal((await call("list_atoms")).data.atoms.length, before);
    },
  );

  if (firstGeometryAtom) {
    await check("selects an atom in the page", async () => {
      await call("select_atom", { atom: firstGeometryAtom.id });
    });
  }

  await check("reports no errors after all edits were undone", async () => {
    const { data } = await call("wait_for_settle", { timeout_ms: 180_000 });
    assert.equal(data.settled, true);
    assert.deepEqual(data.errors, []);
  });
} finally {
  await browser.close();
  await client.close();
  await hub.stop();
  fs.rmSync(outDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length ? 1 : 0);
