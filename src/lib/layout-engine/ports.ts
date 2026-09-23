import { center } from "./geometry";
import type {
  EngineEdge,
  EngineNode,
  EnginePort,
  Face,
  LayoutMode,
  Point,
} from "./types";
export const normals: Record<Face, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};
export function defaultPorts(
  width: number,
  height: number,
  line = false,
): EnginePort[] {
  const offsets: Record<Face, Point> = {
    left: { x: 0, y: line ? height - 1 : height / 2 },
    right: { x: width, y: line ? height - 1 : height / 2 },
    top: { x: width / 2, y: 0 },
    bottom: { x: width / 2, y: height },
  };
  return (["left", "right", "top", "bottom"] as Face[]).flatMap((face) =>
    ["source", "target"].map((kind) => ({
      handleId: `${face}-${kind}`,
      face,
      offset: offsets[face],
    })),
  );
}
export function choosePorts(
  source: EngineNode,
  target: EngineNode,
  edge: EngineEdge,
  mode: LayoutMode,
): [EnginePort, EnginePort] {
  const a = center(source),
    b = center(target),
    dx = b.x - a.x,
    dy = b.y - a.y;
  const effective = source.effectiveMode ?? mode;
  // Radial/relations: pick the axis along which the two boxes are actually
  // SEPARATED. Comparing center deltas fails for wide cards: a child up and
  // to the right of the root can have the larger horizontal center delta yet
  // overlap it horizontally, so a right→left pairing would hook backwards
  // around the target (7-bend loops). The larger positive gap is the clear
  // corridor; center deltas only break ties when neither axis is clear.
  const free = edge.kind === "relation" || effective === "radial";
  const gapX = Math.max(
      target.x - (source.x + source.width),
      source.x - (target.x + target.width),
    ),
    gapY = Math.max(
      target.y - (source.y + source.height),
      source.y - (target.y + target.height),
    );
  const vertical = free
    ? gapX < 0 && gapY < 0
      ? Math.abs(dy) > Math.abs(dx)
      : gapY > gapX
    : effective === "vertical";
  const sf: Face = vertical
    ? dy < 0
      ? "top"
      : "bottom"
    : dx < 0
      ? "left"
      : "right";
  const tf: Face =
    sf === "left"
      ? "right"
      : sf === "right"
        ? "left"
        : sf === "top"
          ? "bottom"
          : "top";
  const select = (n: EngineNode, f: Face, kind: string) =>
    n.ports.find((p) => p.handleId === `${f}-${kind}`) ??
    defaultPorts(n.width, n.height).find((p) => p.handleId === `${f}-${kind}`)!;
  return [select(source, sf, "source"), select(target, tf, "target")];
}
export const worldPort = (node: EngineNode, port: EnginePort): Point => ({
  x: node.x + port.offset.x,
  y: node.y + port.offset.y,
});
