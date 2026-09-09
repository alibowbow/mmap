import { cancelledResult, solveLayoutSteps } from "./index";
import { RouteCache } from "./route-cache";
import type { LayoutInput, LayoutResult } from "./types";

export interface WorkerLike {
  onmessage: ((event: MessageEvent<LayoutResult>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(input: LayoutInput): void;
  terminate(): void;
}
export class LayoutWorkerClient {
  private worker: WorkerLike | null = null;
  private pending: {
    input: LayoutInput;
    resolve: (result: LayoutResult) => void;
  } | null = null;
  private fallbackCache = new RouteCache();
  private timer: ReturnType<typeof setTimeout> | null = null;
  // Injectable factory tests real late messages, creation failure, termination.
  constructor(private factory?: () => WorkerLike) {}
  cancel() {
    const pending = this.pending;
    this.pending = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (pending) {
      this.worker?.terminate();
      this.worker = null;
    }
    if (pending) pending.resolve(cancelledResult(pending.input));
  }
  run(input: LayoutInput): Promise<LayoutResult> {
    if (this.pending) this.cancel();
    return new Promise((resolve) => {
      const task = { input, resolve };
      this.pending = task;
      const fallback = () => {
        this.worker?.terminate();
        this.worker = null;
        const work = solveLayoutSteps(input, this.fallbackCache);
        const tick = () => {
          this.timer = null;
          if (this.pending !== task) return;
          const started = performance.now();
          try {
            let step = work.next();
            while (!step.done && performance.now() - started < 6)
              step = work.next();
            if (step.done) {
              this.pending = null;
              resolve(step.value);
              return;
            }
            this.timer = setTimeout(tick, 0);
          } catch {
            this.pending = null;
            resolve({
              ...cancelledResult(input),
              status: "invalid",
              terminationReason: "invalid-input",
            });
          }
        };
        this.timer = setTimeout(tick, 0);
      };
      try {
        if (!this.worker) {
          if (this.factory) this.worker = this.factory();
          else if (
            typeof window !== "undefined" &&
            typeof Worker !== "undefined"
          )
            this.worker = new Worker(
              new URL("../../workers/layout.worker.ts", import.meta.url),
              { type: "module" },
            );
        }
        if (!this.worker) {
          fallback();
          return;
        }
        this.worker.onmessage = (event) => {
          if (this.pending !== task) return;
          const stamp = event.data.stamp;
          if (
            stamp.requestGeneration !== input.stamp.requestGeneration ||
            stamp.documentEpoch !== input.stamp.documentEpoch
          )
            return;
          this.pending = null;
          resolve(event.data);
        };
        this.worker.onerror = () => {
          if (this.pending === task) fallback();
        };
        this.worker.postMessage(input);
      } catch {
        fallback();
      }
    });
  }
}
