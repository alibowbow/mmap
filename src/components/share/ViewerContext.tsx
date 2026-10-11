"use client";

import { createContext, useContext } from "react";
import { DEFAULT_APPEARANCE } from "@/lib/appearance";
import type { MindMapAppearance } from "@/types/mindmap";

export const ViewerContext = createContext<{
  appearance: MindMapAppearance;
  toggleCollapse: (id: string) => void;
  inspectNode: (id: string) => void;
}>({ appearance: DEFAULT_APPEARANCE, toggleCollapse: () => {}, inspectNode: () => {} });

export const useViewer = () => useContext(ViewerContext);
