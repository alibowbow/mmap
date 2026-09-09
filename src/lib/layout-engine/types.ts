// Serializable, DOM-free contract shared by the worker and synchronous seeds.
export type LayoutMode = "right-tree" | "bidirectional" | "vertical" | "radial";
export type LayoutStrategy = "full" | "incremental" | "subtree";
export type LayoutStatus =
  | "ok"
  | "partial"
  | "infeasible"
  | "invalid"
  | "cancelled";
export type Point = Readonly<{ x: number; y: number }>;
export type Rect = Point & Readonly<{ width: number; height: number }>;
export type Face = "left" | "right" | "top" | "bottom";
export interface RequestStamp {
  readonly documentId: string;
  readonly documentEpoch: number;
  readonly contentRevision: number;
  readonly geometryRevision: number;
  readonly requestGeneration: number;
  readonly transactionId: string | null;
}
export interface EnginePort {
  readonly handleId: string;
  readonly face: Face;
  readonly offset: Point;
}
export interface EngineNode extends Rect {
  readonly id: string;
  readonly parentId: string | null;
  readonly isRoot?: boolean;
  readonly collapsed: boolean;
  readonly side?: "left" | "right";
  readonly effectiveMode?: LayoutMode;
  readonly stableOrder: number;
  readonly sizeSource: "measured" | "cached" | "estimated";
  readonly ports: readonly EnginePort[];
}
export interface EngineEdge {
  readonly id: string;
  readonly kind: "tree" | "relation";
  readonly source: string;
  readonly target: string;
  readonly style: "curved" | "step" | "straight" | "taper";
  readonly halfWidth: number;
  readonly arrowLength: number;
  readonly arrowHalfWidth: number;
  readonly labelSize?: Readonly<{ width: number; height: number }>;
}
export interface LayoutOptions {
  readonly nodeGap: number;
  readonly levelGap: number;
  readonly edgeClearance: number;
  readonly geometryEpsilon: number;
  readonly curveTolerance: number;
  readonly maxPasses: number;
  readonly maxCandidateChecks: number;
  readonly maxRouteExpansions: number;
  readonly maxInfluenceNodes: number;
  readonly maxCoordinateAbs: number;
  readonly maxDisplacement: number;
  readonly maxAddedExtent: number;
  readonly budgetMode: "operations" | "interactive";
  readonly maxElapsedMs: number;
  readonly straightPolicy: "strict" | "smart";
}
export const DEFAULT_OPTIONS: LayoutOptions = {
  nodeGap: 28,
  levelGap: 56,
  edgeClearance: 6,
  geometryEpsilon: 0.001,
  curveTolerance: 0.25,
  maxPasses: 32,
  maxCandidateChecks: 2_000_000,
  maxRouteExpansions: 6000,
  maxInfluenceNodes: 400,
  maxCoordinateAbs: 10_000_000,
  maxDisplacement: 2_000_000,
  maxAddedExtent: 2_000_000,
  budgetMode: "operations",
  maxElapsedMs: 3000,
  straightPolicy: "strict",
};
export interface LayoutInput {
  readonly stamp: RequestStamp;
  readonly mode: LayoutMode;
  readonly strategy: LayoutStrategy;
  readonly nodes: readonly EngineNode[];
  readonly edges: readonly EngineEdge[];
  readonly changedNodeIds: readonly string[];
  readonly changedEdgeIds: readonly string[];
  readonly affectedParentIds: readonly string[];
  readonly previousObstacleRects: readonly (Rect & { readonly id: string })[];
  readonly subtreeRootId?: string;
  readonly fixedNodeIds: readonly string[];
  readonly expansionBoundaryIds: readonly string[];
  readonly options: LayoutOptions;
  // Free drag/initial load/undo preserve geometry and only refresh routes.
  readonly routingOnly?: boolean;
  readonly compact?: boolean;
}
export type PathSegment =
  | Readonly<{ kind: "line"; from: Point; to: Point }>
  | Readonly<{ kind: "cubic"; from: Point; c1: Point; c2: Point; to: Point }>;
export interface EdgeRoute {
  readonly edgeId: string;
  readonly kind: "tree" | "relation";
  readonly sourcePort: EnginePort;
  readonly targetPort: EnginePort;
  readonly segments: readonly PathSegment[];
  readonly labelAnchor?: Point;
  readonly labelBounds?: Rect;
  readonly ribbon?: readonly Point[];
  readonly arrow?: readonly Point[];
  readonly bounds: Rect;
  readonly status: "ok" | "blocked" | "unverified";
}
export type DiagnosticCode =
  | "INVALID_GRAPH"
  | "INVALID_GEOMETRY"
  | "INVALID_OPTIONS"
  | "INVALID_EDGE"
  | "FIXED_OVERLAP"
  | "UNRESOLVED_OVERLAP"
  | "LIMIT_REACHED"
  | "ROUTE_BLOCKED"
  | "ROUTE_UNVERIFIED"
  | "LABEL_BLOCKED"
  | "ESTIMATED_SIZE"
  | "HIDDEN_FIXED"
  | "ROLLBACK";
export interface LayoutDiagnostic {
  readonly code: DiagnosticCode;
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly message: string;
  readonly severity: "warning" | "error";
}
export type TerminationReason =
  | "complete"
  | "invalid-input"
  | "fixed-conflict"
  | "operation-budget"
  | "time-budget"
  | "search-limit"
  | "constraints-unresolved"
  | "superseded";
export interface LayoutMetrics {
  candidateChecks: number;
  routeExpansions: number;
  passes: number;
  reusedRoutes: number;
  nodeOverlaps: number;
  blockedRoutes: number;
  estimatedNodes: number;
  movedRatio: number;
  displacementMedian: number;
  displacementP95: number;
  displacementMax: number;
  area: number;
  aspectRatio: number;
  routeLength: number;
  bends: number;
  labelOverlaps: number;
}
export interface LayoutResult {
  readonly stamp: RequestStamp;
  readonly status: LayoutStatus;
  readonly terminationReason: TerminationReason;
  readonly positions: readonly (Point & { readonly id: string })[];
  readonly movedNodeIds: readonly string[];
  readonly affectedNodeIds: readonly string[];
  readonly routes: readonly EdgeRoute[];
  readonly bounds: Rect | null;
  readonly diagnostics: readonly LayoutDiagnostic[];
  readonly metrics: LayoutMetrics;
}
export type Work<T> = Generator<void, T, void>;
export function drain<T>(work: Work<T>): T {
  let next = work.next();
  while (!next.done) next = work.next();
  return next.value;
}
export class Budget {
  checks = 0;
  expansions = 0;
  reason: TerminationReason | null = null;
  private started = performance.now();
  constructor(readonly options: LayoutOptions) {}
  check(): boolean {
    if (++this.checks > this.options.maxCandidateChecks)
      this.reason = "operation-budget";
    if (
      this.options.budgetMode === "interactive" &&
      (this.checks & 255) === 0 &&
      performance.now() - this.started > this.options.maxElapsedMs
    )
      this.reason = "time-budget";
    return !this.reason;
  }
}
