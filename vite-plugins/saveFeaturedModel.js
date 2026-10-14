import fs from "node:fs/promises";
import path from "node:path";

const ROUTE = "/__dev/featured-model";
const OUTPUT_DIR = "public/featured/models";
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Dev-server-only endpoint that saves a GLB posted by the Developer settings
 * "Export GLB" button into public/featured/models/, where the landing page loads
 * its featured models from. Not part of production builds.
 *
 * POST /__dev/featured-model?name=<owner_repo> with the GLB as the body.
 */
export default function saveFeaturedModel() {
  return {
    name: "save-featured-model",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ROUTE, async (req, res) => {
        const reply = (status, body) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        if (req.method !== "POST") return reply(405, { error: "POST only" });

        const name = new URL(req.url, "http://localhost").searchParams.get(
          "name",
        );
        if (!name || !/^[A-Za-z0-9_.-]+$/.test(name)) {
          return reply(400, { error: "Invalid name" });
        }

        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BYTES) return reply(413, { error: "File too large" });
          chunks.push(chunk);
        }

        const dir = path.join(server.config.root, OUTPUT_DIR);
        const file = path.join(dir, `${name}.glb`);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(file, Buffer.concat(chunks));
        return reply(200, { path: `${OUTPUT_DIR}/${name}.glb`, bytes: size });
      });
    },
  };
}
