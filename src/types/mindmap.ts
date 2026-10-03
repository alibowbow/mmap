import type { Edge, Node } from "@xyflow/react";

// ── Node taxonomy ──────────────────────────────────────────────────────────
export type MindMapNodeType =
  | "root"
  | "plain"
  | "idea"
  | "task"
  | "note"
  | "question"
  | "warning"
  | "link";

// Which way a first-level branch extends from the root in bidirectional layout.
export type BranchSide = "left" | "right";

export type MindMapNodeStatus = "none" | "todo" | "doing" | "done" | "blocked";

export type ChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
};

// Data payload carried by every React Flow node.
export type MindMapNodeData = {
  label: string;
  description?: string;
  parentId?: string | null;
  collapsed?: boolean;
  isRoot?: boolean;
  type: MindMapNodeType;
  status?: MindMapNodeStatus;
  color?: string;
  // Optional per-node visual override. When absent, the workspace-wide style
  // is used. Share links preserve this so selected hierarchy levels can keep
  // a distinct silhouette without changing every node in the recipient's map.
  style?: "card" | "soft" | "outline" | "line" | "pill" | "sticky" | "neon";
  icon?: string;
  emoji?: string;
  side?: BranchSide; // explicit branch direction (bidirectional layout)
  layoutMode?: LayoutMode; // optional subtree mode; inherited by descendants
  tags?: string[];
  link?: string;
  checklist?: ChecklistItem[];
  // Cross-document links (drill-down). A node can be a "portal" into another
  // map (linkedDocId); a sub-map's root points back to its source.
  linkedDocId?: string;
  backDocId?: string;
  backNodeId?: string;
  // Transient UI flags (not strictly persisted but harmless if stored)
  searchMatch?: boolean;
  hidden?: boolean;
  _childCount?: number; // transient canvas index
  _depth?: number; // computed depth, injected at render for per-level sizing
  _dimmed?: boolean; // presentation spotlight: fade non-current nodes
  _autoColor?: string; // rainbow-branch inherited color (explicit color wins)
  _suppressMenu?: boolean; // transient: a drag must not summon the node menu
};

export type MindMapNode = Node<MindMapNodeData>;

export type MindMapViewport = {
  x: number;
  y: number;
  zoom: number;
};

// A free-form cross link between any two nodes, independent of the tree.
export type MindMapRelation = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

// Immutable world-space ink. Pointer samples are collected outside the store;
// only completed gestures enter history and persistence.
export type InkPoint = { x: number; y: number; pressure: number };
export type InkStroke = {
  id: string;
  color: string;
  width: number;
  points: InkPoint[];
};
export type InkData = { version: 1; strokes: InkStroke[] };
export type InkTool = "node" | "pen" | "eraser" | "pan";
export type InkSettings = { color: string; width: number };

// A saved point-in-time copy of a document's content (local version history).
export type MindMapSnapshot = {
  id: string;
  label: string;
  createdAt: string;
  nodes: MindMapNode[];
  edges: Edge[];
  relations?: MindMapRelation[];
  layoutMode?: LayoutMode;
  ink?: InkData;
  boardMode?: "map" | "blank";
};

export type MindMapDocument = {
  id: string;
  title: string;
  nodes: MindMapNode[];
  edges: Edge[];
  relations?: MindMapRelation[];
  viewport?: MindMapViewport;
  boardMode?: "map" | "blank";
  ink?: InkData;
  inkSettings?: InkSettings;
  pinned?: boolean;
  layoutMode?: LayoutMode; // last auto-layout applied (edge-face routing)
  // Portable document design. Older workspaces inherit their saved global design.
  appearance?: MindMapAppearance;
  snapshots?: MindMapSnapshot[];
  createdAt: string;
  updatedAt: string;
};

export type MindMapTheme = "light" | "dark" | "system";

export type MindMapAppearance = Pick<
  MindMapWorkspace,
  | "theme"
  | "font"
  | "nodeStyle"
  | "levelFontSizes"
  | "edgeStyle"
  | "edgeAnimated"
  | "edgeWidth"
  | "edgeColorMode"
  | "edgeLine"
  | "nodeTint"
  | "canvasBg"
  | "accent"
  | "rainbowBranches"
>;

export type LayoutMode = "right-tree" | "bidirectional" | "vertical" | "radial";

export type MindMapWorkspace = {
  version: number;
  documents: MindMapDocument[];
  activeDocumentId: string | null;
  theme: MindMapTheme;
  font: string;
  nodeStyle: string;
  levelFontSizes: number[];
  edgeStyle: string;
  edgeAnimated: boolean;
  edgeWidth: number;
  edgeColorMode: string;
  edgeLine: string;
  nodeTint: boolean;
  canvasBg: string;
  accent: string;
  rainbowBranches: boolean;
  sidebarCollapsed: boolean;
  inspectorOpen: boolean;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type TemplateType =
  | "blank"
  | "project-plan"
  | "research-map"
  | "investment-thesis"
  | "study-planner"
  | "meeting-notes"
  | "product-roadmap"
  | "problem-solving";

export type { Edge, Node };
