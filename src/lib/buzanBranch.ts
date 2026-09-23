// Tony Buzan–style organic branch: ONE continuous, tapering brush stroke per
// node. It leaves the tip of the parent's branch, curves out, runs flat under
// the child's word (the word sits ON the branch; the flat run is exactly as
// long as the word), and ends at the tip where the child's own branches start.
//
//   parent word ─────╮                       ← parent branch tip
//                     ╰──── child word ────  ← one stroke: curve + word run
//
// Thickness tapers continuously along the whole stroke from the parent's tip
// width to the child's tip width, so consecutive branches join without knots.
import { branchHalfWidth } from "@/lib/branchWidth";

export type BranchBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  isRoot: boolean;
};

export type BuzanBranch = {
  // Filled polygons of the tapered stroke. Separate shapes (not subpaths of
  // one path): overlapping subpaths with opposite winding would cancel under
  // the nonzero fill rule and punch a hole at the joint.
  outlines: string[];
  center: string; // centreline (hit area)
};

// Where a word's branch runs: its centreline sits just under the word.
// The node reserves room for it with padding-bottom = buzanWordPad(depth).
export function buzanLineY(box: BranchBox, edgeWidth: number): number {
  return box.y + box.height - branchHalfWidth(box.depth - 1, edgeWidth) - 1;
}
export function buzanWordPad(depth: number, edgeWidth: number): number {
  return Math.ceil(branchHalfWidth(depth - 1, edgeWidth) * 2 + 4);
}

const CURVE_SAMPLES = 26;
const RUN_SAMPLES = 8;

export function buzanBranch(
  source: BranchBox,
  target: BranchBox,
  edgeWidth: number,
  // A leaf's branch tapers to a fine point (nothing grows from its tip).
  leaf = false,
): BuzanBranch {
  const sCx = source.x + source.width / 2,
    tCx = target.x + target.width / 2;
  // Which way the branch grows: toward the side the child sits on.
  const side = tCx >= sCx ? 1 : -1;
  const lineY = buzanLineY(target, edgeWidth);
  // The word run: from the child's near edge to its far edge (the tip).
  const near = { x: side > 0 ? target.x : target.x + target.width, y: lineY };
  const tip = { x: side > 0 ? target.x + target.width : target.x, y: lineY };

  let start: { x: number; y: number };
  let c1: { x: number; y: number };
  // Root branches leave radially and some sub-branches vertically; those
  // need a rounder landing into the word run than a straight-out branch.
  let leaveVertically = source.isRoot;
  const reach = Math.hypot(near.x - sCx, near.y - (source.y + source.height / 2));
  if (source.isRoot) {
    // Central topic: branches radiate from the bubble's rim toward each child
    // (not only from its left/right sides), leaving along the radial
    // direction — so branches above/below the centre don't jut sideways and
    // hook back.
    const cx = sCx,
      cy = source.y + source.height / 2,
      rx = source.width / 2 - 3,
      ry = source.height / 2 - 3;
    const ux = near.x - cx,
      uy = near.y - cy,
      ul = Math.hypot(ux, uy) || 1;
    const dirx = ux / ul,
      diry = uy / ul;
    // Ray/ellipse intersection from the centre.
    const t = 1 / Math.sqrt((dirx * dirx) / (rx * rx) + (diry * diry) / (ry * ry));
    start = { x: cx + dirx * t, y: cy + diry * t };
    const k0 = Math.max(18, Math.min(reach * 0.45, 140));
    c1 = { x: start.x + dirx * k0, y: start.y + diry * k0 };
  } else {
    // A sub-branch grows from the parent's branch: normally its tip, but if
    // the child sits "behind" the tip (directly above/below the parent, as
    // in radial maps) it springs from further along the parent's stroke,
    // like a real twig — never shooting forward then hooking back.
    const sLine = buzanLineY(source, edgeWidth);
    const lo = source.x,
      hi = source.x + source.width;
    let sx = side > 0 ? hi : lo;
    const MIN_FORWARD = 28;
    // Springing from mid-stroke is only safe DOWNWARD: the parent's word sits
    // on top of its stroke, so an upward twig from mid-stroke would cut
    // through the word. Upward children always leave from the tip.
    const below = near.y > sLine;
    if (below && (near.x - sx) * side < MIN_FORWARD)
      sx = Math.min(hi, Math.max(lo, near.x - side * MIN_FORWARD));
    start = { x: sx, y: sLine };
    const fwd = (near.x - start.x) * side;
    const dy = near.y - start.y;
    leaveVertically = fwd < MIN_FORWARD / 2;
    c1 = leaveVertically
      ? {
          x: start.x,
          y: start.y + Math.sign(dy || 1) * Math.max(18, Math.min(Math.abs(dy) * 0.5, 90)),
        }
      : { x: start.x + side * Math.max(18, fwd * 0.55), y: start.y };
  }

  // Landing point. Normally the child's near edge; but when the child
  // overlaps "behind" the take-off point (e.g. directly above its parent in a
  // radial map) reaching the near edge would force a hook, so the branch
  // lands partway along the child's stroke instead — from below, so it never
  // crosses the word, which sits on top of the stroke.
  const MIN_LAND = 28;
  let land = near;
  if (!source.isRoot && (near.x - start.x) * side < MIN_LAND) {
    const lo = Math.min(near.x, tip.x),
      hi = Math.max(near.x, tip.x);
    land = { x: Math.min(hi, Math.max(lo, start.x + side * MIN_LAND)), y: lineY };
    leaveVertically = true;
  }

  // Land tangent to the word run, like a hand-drawn stroke. After a vertical
  // or radial take-off, round the landing by the vertical drop too, so the
  // turn into the word is a sweep rather than a sharp corner.
  const dx = Math.abs(land.x - start.x);
  const k = leaveVertically
    ? Math.max(18, dx * 0.55, Math.min(Math.abs(land.y - start.y) * 0.4, 80))
    : Math.max(18, dx * 0.55);
  const c2 = { x: land.x - side * k, y: land.y };

  const curve: { x: number; y: number }[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES,
      mt = 1 - t;
    curve.push({
      x:
        mt * mt * mt * start.x +
        3 * mt * mt * t * c1.x +
        3 * mt * t * t * c2.x +
        t * t * t * land.x,
      y:
        mt * mt * mt * start.y +
        3 * mt * mt * t * c1.y +
        3 * mt * t * t * c2.y +
        t * t * t * land.y,
    });
  }
  const run = (from: { x: number; y: number }) => {
    const out: { x: number; y: number }[] = [];
    for (let i = 1; i <= RUN_SAMPLES; i++) {
      const t = i / RUN_SAMPLES;
      out.push({ x: from.x + (tip.x - from.x) * t, y: lineY });
    }
    return out;
  };

  const w0 = branchHalfWidth(source.depth, edgeWidth),
    w1 = leaf
      ? Math.max(0.9, branchHalfWidth(target.depth, edgeWidth) * 0.3)
      : branchHalfWidth(target.depth, edgeWidth);

  let outlines: string[];
  if (land === near) {
    // One continuous stroke: curve + the run under the word.
    outlines = [ribbonPath([...curve, ...run(near)], w0, w1)];
  } else {
    // Mid-stroke landing: the curve joins the word's stroke, which itself
    // runs the word's full length.
    const wm = (w0 + w1) / 2;
    outlines = [
      ribbonPath(curve, w0, wm),
      ribbonPath([near, ...run(near)], wm, w1),
    ];
  }
  const center = `M ${start.x},${start.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${land.x},${land.y} L ${tip.x},${tip.y}`;
  return { outlines, center };
}

// Filled outline of a stroke through `pts`, half-width tapering linearly by
// arc length from wStart to wEnd.
function ribbonPath(
  pts: readonly { x: number; y: number }[],
  wStart: number,
  wEnd: number,
): string {
  if (pts.length < 2) return "";
  const lens = [0];
  for (let i = 1; i < pts.length; i++)
    lens.push(
      lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y),
    );
  const total = lens[lens.length - 1] || 1;
  const left: string[] = [],
    right: string[] = [];
  let pnx = 0,
    pny = -1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x,
      ty = b.y - a.y,
      len = Math.hypot(tx, ty);
    let nx = pnx,
      ny = pny;
    if (len > 1e-6) {
      nx = -ty / len;
      ny = tx / len;
      // Keep the normal on a consistent side so the outline never twists.
      if (nx * pnx + ny * pny < 0) {
        nx = -nx;
        ny = -ny;
      }
      pnx = nx;
      pny = ny;
    }
    const w = wStart + (wEnd - wStart) * (lens[i] / total);
    left.push(`${(pts[i].x + nx * w).toFixed(1)},${(pts[i].y + ny * w).toFixed(1)}`);
    right.push(`${(pts[i].x - nx * w).toFixed(1)},${(pts[i].y - ny * w).toFixed(1)}`);
  }
  return `M ${left.join(" L ")} L ${right.reverse().join(" L ")} Z`;
}
