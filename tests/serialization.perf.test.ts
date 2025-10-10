import { rectangle } from "../src/worker/shapes";
import { clearCache } from "../src/worker/worker";
import { extrude, move, rotate } from "../src/worker/actions";
import { assembly } from "../src/worker/interaction";
import { AbundanceLeaf, AbundanceObject, init } from "../src/worker/util";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RequestContext } from "../src/worker/geometryProvider";
import { re } from "mathjs";

async function time<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  const duration = end - start;
  return { result, duration };
}

async function timeMultiple(
  fns: Array<() => Promise<any>>
): Promise<{ results: any[]; times: number[] }> {
  const results: any[] = [];
  const times: number[] = [];
  for (const fn of fns) {
    let r = await time(fn);
    results.push(r.result);
    times.push(r.duration);
  }
  return { results, times };
}

function showStats(label: string, times: number[]) {
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const max = Math.max(...times);
  const min = Math.min(...times);
  // Simple histogram: bucket by 10ms
  const buckets: Record<string, number> = {};
  for (const t of times) {
    const bucket = `${Math.floor(t / 10) * 10}-${
      Math.floor(t / 10) * 10 + 9
    }ms`;
    buckets[bucket] = (buckets[bucket] || 0) + 1;
  }
  console.log(
    `[perf] ${label}: avg=${avg.toFixed(2)}ms, min=${min.toFixed(
      2
    )}ms, max=${max.toFixed(2)}ms`
  );
  // eslint-disable-next-line no-console
  console.log(`[perf] histogram:`, buckets);

  return { avg, max, min, histogram: buckets };
}

describe("performance: rectangle + extrude + transform", () => {
  const context: RequestContext = { project: "perf-rect-blep" };
  const REPETITIONS = 100;

  beforeAll(async () => {
    await init();
  });

  it(`rectangle+extrude should compute in under 20ms on average`, async () => {
    const tasks: Array<() => Promise<any>> = [];
    for (let i = 0; i < REPETITIONS; i++) {
      tasks.push(async () => {
        const r = await rectangle(100, i + 1, context);
        return await extrude(r, 10, context);
      });
    }

    const { results, times } = await timeMultiple(tasks);
    const { avg, max, min, histogram } = showStats("rectangle+extrude", times);

    expect(avg).toBeLessThan(20);
  });

  it(`move and rotate of simple 3d shape should compute in under 20ms each on average`, async () => {
    const tasks: Array<() => Promise<any>> = [];
    for (let i = 0; i < REPETITIONS; i++) {
      tasks.push(async () => {
        // Allow cache hits for rectangle creation
        const r = await rectangle(100, 10, context);
        const v = await extrude(r, 10, context);

        return await rotate(await move(v, i, 0, 0, context), i, i, i, context);
      });
    }

    const { results, times } = await timeMultiple(tasks);
    const { avg, max, min, histogram } = showStats("move+rotate", times);

    expect(avg).toBeLessThan(20);
  });
});

describe("performance: assemblies", () => {
  const context: RequestContext = { project: "perf-assemblie-blahs" };
  const REPETITIONS = 100;
  let rectArray: AbundanceObject[] = [];

  beforeAll(async () => {
    await init();

    // Create an array of rectangles to use in the overlapping shapes test
    for (let i = 0; i < REPETITIONS; i++) {
      const r = await rectangle(100, 10, context);
      const v = await extrude(r, 10, context);

      rectArray.push(
        await rotate(await move(v, i, 0, 0, context), 0, i * 3, 32 * i, context)
      );
    }
  });

  it(`assembly with overlapping simple shapes`, async () => {
    const tasks: Array<() => Promise<any>> = [];
    for (let i = 0; i < rectArray.length; i++) {
      tasks.push(async () => {
        await assembly(
          [rectArray[i], rectArray[(i + 1) % rectArray.length]],
          context
        );
      });
    }

    const { results, times } = await timeMultiple(tasks);
    const { avg, max, min, histogram } = showStats("small-assembly", times);

    expect(avg).toBeLessThan(50);
  });

  it("create assembly with 10 simple shapes", async () => {
    const tasks: Array<() => Promise<any>> = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      tasks.push(async () => {
        return await assembly(
          rectArray.slice(i * (REPETITIONS / n), (i + 1) * (REPETITIONS / n)),
          context
        );
      });
    }
    console.profile("build-assembly");
    const { results, times } = await timeMultiple(tasks);
    console.profileEnd("build-assembly");
    const { avg, max, min, histogram } = showStats("big-assembly", times);

    expect(avg).toBeLessThan(50);
  }, 60000);

  // TODO: add test that involves deserializing then moving one of these complex assemblies.
  it("deserialize and move complex assembly", async () => {
    const complicatedAssembly = await assembly(rectArray.slice(0, 10), context);

    const tasks: Array<() => Promise<any>> = [];
    for (let i = 0; i < REPETITIONS / 2; i++) {
      tasks.push(async () => {
        return await rotate(
          await move(complicatedAssembly, i, 0, 0, context),
          i,
          10,
          0,
          context
        );
      });
    }

    console.profile("move-big-assembly");
    const { results, times } = await timeMultiple(tasks);
    console.profileEnd("move-big-assembly");
    const { avg, max, min, histogram } = showStats("move-big-assembly", times);

    // Expect similar timing to basic move+rotate
    expect(avg).toBeLessThan(20);
  }, 5000);

  afterAll(async () => {
    await clearCache(context);
  });
});
