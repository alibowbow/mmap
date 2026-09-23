// Organic ("taper") branch thickness by depth — the Tony Buzan look: thick
// main branches near the centre, thinning toward the leaves. Shared by the
// layout engine (ribbon geometry, runs in a worker) and the node renderer
// (the word's underline), so a branch flows seamlessly into the underline of
// the word it carries and on into that word's own child branches:
//   ribbon(parent→child) starts at half(parentDepth), ends at half(childDepth)
//   child underline thickness = 2 × half(childDepth)
const HALF_BY_DEPTH = [6, 3.5, 2.25, 1.5];

// `edgeWidth` is the workspace thickness setting (1.5 / 2 / 3); 2 = 1×.
export function branchHalfWidth(depth: number, edgeWidth = 2): number {
  const base = HALF_BY_DEPTH[Math.min(Math.max(0, depth), HALF_BY_DEPTH.length - 1)];
  return base * (edgeWidth / 2);
}
