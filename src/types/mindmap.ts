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
  icon?: string;
  side?: BranchSide; // explicit branch direction (bidirectional layout)
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
  _depth?: number; // computed depth, injected at render for per-level sizing
};

export type MindMapNode = Node<MindMapNodeData>;

export type MindMapViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type MindMapDocument = {
  id: string;
  title: string;
  nodes: MindMapNode[];
  edges: Edge[];
  viewport?: MindMapViewport;
  createdAt: string;
  updatedAt: string;
};

export type MindMapTheme = "light" | "dark" | "system";

export type LayoutMode = "right-tree" | "bidirectional" | "vertical" | "radial";

export type MindMapWorkspace = {
  version: number;
  documents: MindMapDocument[];
  activeDocumentId: string | null;
  theme: MindMapTheme;
  font: string;
  nodeStyle: string;
  levelFontSizes: number[];
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
