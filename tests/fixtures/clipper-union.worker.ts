import { ready } from "wasm-nesting";
import {
  Clipper,
  ClipType,
  PolyFillType,
  PolyType,
} from "../../vendor/geometry-utils/src/clipper";
import { PointI32 } from "../../vendor/geometry-utils/src/geometry";

// Unions the posted paths in a worker, so a test can time out on a hang
// instead of freezing the page.
self.onmessage = async (event: MessageEvent<number[][][]>) => {
  await ready;
  const clipper = new Clipper();
  const solution: PointI32[][] = [];
  clipper.addPaths(
    event.data.map((path) => path.map(([x, y]) => PointI32.create(x, y))),
    PolyType.SUBJECT,
  );
  clipper.execute(ClipType.UNION, solution, PolyFillType.NON_ZERO);
  self.postMessage(solution.map((path) => path.map((p) => [p.x, p.y])));
};
