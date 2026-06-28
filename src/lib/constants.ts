import type {
  LayoutMode,
  MindMapNodeStatus,
  MindMapNodeType,
} from "@/types/mindmap";

export const STORAGE_KEY = "mindforge-workspace-v1";
export const WORKSPACE_VERSION = 1;

export const DEFAULT_NODE_LABEL = "새 아이디어";
export const DEFAULT_ROOT_LABEL = "중심 주제";

// Layout geometry tuned for readable, non-overlapping trees.
export const NODE_WIDTH = 232;
export const NODE_HEIGHT = 76;
export const LAYOUT_GAP_X = 96; // horizontal gap between depth levels
export const LAYOUT_GAP_Y = 28; // vertical gap between sibling subtrees

// Node type metadata: color, accent and lucide icon name.
export type NodeTypeConfig = {
  label: string;
  color: string; // hex, used as default node color
  accent: string; // tailwind-ish accent name used in UI
  icon: string; // lucide icon identifier (mapped in MindMapNode)
};

export const NODE_TYPE_CONFIG: Record<MindMapNodeType, NodeTypeConfig> = {
  root: { label: "중심", color: "#6366f1", accent: "indigo", icon: "Sparkles" },
  plain: { label: "일반", color: "#64748b", accent: "slate", icon: "Type" },
  idea: { label: "아이디어", color: "#0ea5e9", accent: "sky", icon: "Lightbulb" },
  task: { label: "할 일", color: "#10b981", accent: "emerald", icon: "CheckSquare" },
  note: { label: "노트", color: "#64748b", accent: "slate", icon: "StickyNote" },
  question: { label: "질문", color: "#8b5cf6", accent: "violet", icon: "HelpCircle" },
  warning: { label: "주의", color: "#f59e0b", accent: "amber", icon: "AlertTriangle" },
  link: { label: "링크", color: "#06b6d4", accent: "cyan", icon: "Link2" },
};

export const NODE_TYPES: MindMapNodeType[] = [
  "root",
  "plain",
  "idea",
  "task",
  "note",
  "question",
  "warning",
  "link",
];

export type NodeStatusConfig = {
  label: string;
  color: string;
  dot: string;
};

export const NODE_STATUS_CONFIG: Record<MindMapNodeStatus, NodeStatusConfig> = {
  none: { label: "없음", color: "#94a3b8", dot: "#cbd5e1" },
  todo: { label: "할 일", color: "#64748b", dot: "#94a3b8" },
  doing: { label: "진행중", color: "#2563eb", dot: "#3b82f6" },
  done: { label: "완료", color: "#059669", dot: "#10b981" },
  blocked: { label: "막힘", color: "#dc2626", dot: "#ef4444" },
};

export const NODE_STATUSES: MindMapNodeStatus[] = [
  "none",
  "todo",
  "doing",
  "done",
  "blocked",
];

// A friendly palette for the color picker.
export const NODE_COLOR_PALETTE = [
  "#6366f1",
  "#0ea5e9",
  "#06b6d4",
  "#10b981",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
];

export type LayoutOption = {
  id: LayoutMode;
  label: string;
  description: string;
  icon: string;
};

export const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    id: "right-tree",
    label: "오른쪽 트리",
    description: "루트에서 오른쪽으로 펼치는 기본 트리",
    icon: "ListTree",
  },
  {
    id: "bidirectional",
    label: "양방향 트리",
    description: "좌우로 균형 있게 펼치는 트리",
    icon: "GitFork",
  },
  {
    id: "vertical",
    label: "조직도",
    description: "위에서 아래로 내려가는 수직 트리",
    icon: "Network",
  },
  {
    id: "radial",
    label: "방사형",
    description: "루트를 중심으로 원형 배치",
    icon: "Sun",
  },
];
