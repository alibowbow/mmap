"use client";

import {
  AlertTriangle,
  CheckSquare,
  CornerDownRight,
  FileJson,
  FilePlus2,
  FileText,
  GitFork,
  GraduationCap,
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
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

// Registry mapping the icon-name strings used in data/config to components.
const REGISTRY: Record<string, LucideIcon> = {
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
  Sun,
  Square,
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
