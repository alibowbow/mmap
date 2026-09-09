import { finite } from "./layout-engine/geometry";
import type {
  LayoutInput,
  LayoutResult,
  RequestStamp,
} from "./layout-engine/types";
export function sameStamp(a: RequestStamp, b: RequestStamp): boolean {
  return (
    a.documentId === b.documentId &&
    a.documentEpoch === b.documentEpoch &&
    a.contentRevision === b.contentRevision &&
    a.geometryRevision === b.geometryRevision &&
    a.requestGeneration === b.requestGeneration &&
    a.transactionId === b.transactionId
  );
}
export function validateLayoutPatch(
  input: LayoutInput,
  result: LayoutResult,
  current: RequestStamp,
): boolean {
  if (
    !sameStamp(input.stamp, current) ||
    !sameStamp(result.stamp, current) ||
    result.status === "invalid" ||
    result.status === "cancelled"
  )
    return false;
  const ids = new Set<string>(),
    ns = new Map(input.nodes.map((n) => [n.id, n])),
    fixed = new Set(input.fixedNodeIds);
  for (const n of input.nodes) if (!n.parentId) fixed.add(n.id);
  const allowed = input.strategy === "subtree" ? new Set<string>() : null;
  if (allowed) {
    const children = new Map<string, string[]>();
    for (const n of input.nodes)
      if (n.parentId) {
        const cs = children.get(n.parentId) ?? [];
        cs.push(n.id);
        children.set(n.parentId, cs);
      }
    const stack = [input.subtreeRootId!];
    while (stack.length) {
      const id = stack.pop()!;
      if (allowed.has(id)) continue;
      allowed.add(id);
      stack.push(...(children.get(id) ?? []));
    }
    fixed.add(input.subtreeRootId!);
  }
  for (const p of result.positions) {
    const n = ns.get(p.id);
    if (
      !n ||
      ids.has(p.id) ||
      fixed.has(p.id) ||
      (allowed && !allowed.has(p.id)) ||
      !finite(p.x) ||
      !finite(p.y) ||
      Math.max(Math.abs(p.x), Math.abs(p.y)) > input.options.maxCoordinateAbs ||
      Math.hypot(p.x - n.x, p.y - n.y) > input.options.maxDisplacement
    )
      return false;
    ids.add(p.id);
  }
  return true;
}
