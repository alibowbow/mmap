"use client";

import {
  AlertTriangle,
  Brush,
  CheckSquare,
  Circle,
  CornerDownRight,
  Download,
  Image,
  Minus,
  Pill,
  Shapes,
  Share2,
  Spline,
  SquareDashed,
  Zap,
  FileJson,
  FilePlus2,
  FileText,
  GitFork,
  GraduationCap,
  Grid3x3,
  Grip,
  HelpCircle,
  LayoutGrid,
  LayoutTemplate,
  Lightbulb,
  Link2,
  ListTree,
  Map,
  Microscope,
  Network,
  Plus,
  Presentation,
  Puzzle,
  Rocket,
  Search,
  Sparkles,
  Square,
  StickyNote,
  Sun,
  SunMoon,
  TrendingUp,
  Type,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

// Registry mapping the icon-name strings used in data/config to components.
type IconComponent =
  | LucideIcon
  | ((props: { size?: number; className?: string }) => JSX.Element);

// Bidirectional tree: a central topic with branches fanning out to BOTH the
// left and right. (lucide's GitFork forks upward, which reads as a vertical
// layout and misleads.) Drawn in lucide's 24px/2px-stroke language.
function LayoutBidirectional({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Central topic with child nodes on both sides — the same "boxes +
          connectors" grammar as the org-chart (Network) icon beside it. */}
      <rect x="9" y="10" width="6" height="4" rx="1.2" />
      <path d="M15 12c1.8 0 1.8-5.5 3.6-5.5M15 12c1.8 0 1.8 5.5 3.6 5.5M9 12c-1.8 0-1.8-5.5-3.6-5.5M9 12c-1.8 0-1.8 5.5-3.6 5.5" />
      <rect x="18.6" y="5" width="3.4" height="3" rx="1" />
      <rect x="18.6" y="16" width="3.4" height="3" rx="1" />
      <rect x="2" y="5" width="3.4" height="3" rx="1" />
      <rect x="2" y="16" width="3.4" height="3" rx="1" />
    </svg>
  );
}

const REGISTRY: Record<string, IconComponent> = {
  LayoutBidirectional,
  Sparkles,
  Lightbulb,
  CheckSquare,
  StickyNote,
  HelpCircle,
  AlertTriangle,
  Link2,
  ListTree,
  GitFork,
  Network,
  Grid3x3,
  Grip,
  Sun,
  Square,
  SquareDashed,
  Circle,
  Minus,
  Shapes,
  Spline,
  Download,
  Image,
  Type,
  Rocket,
  Microscope,
  TrendingUp,
  GraduationCap,
  Users,
  Map,
  Puzzle,
  FilePlus2,
  CornerDownRight,
  Plus,
  LayoutGrid,
  Search,
  LayoutTemplate,
  SunMoon,
  FileJson,
  Upload,
  FileText,
  Presentation,
  Brush,
  Pill,
  Share2,
  Zap,
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Cmp = REGISTRY[name] ?? Lightbulb;
  return <Cmp size={size} className={className} />;
}
