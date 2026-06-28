// Lightweight cross-component channel for the "drag subtree together" gesture.
// Kept out of the Zustand store so arming it (on long-press) doesn't trigger a
// re-render that would interrupt React Flow's in-progress drag.
export const subtreeDrag: { armedId: string | null } = { armedId: null };
