import { solveLayout } from "../lib/layout-engine";
import { RouteCache } from "../lib/layout-engine/route-cache";
import type { LayoutInput } from "../lib/layout-engine/types";
const cache = new RouteCache();
self.onmessage = (event: MessageEvent<LayoutInput>) => {
  // Cancellation terminates this worker. The client resolves cancelled jobs
  // itself; it never waits for a message from a terminated synchronous solve.
  self.postMessage(solveLayout(event.data, cache));
};
