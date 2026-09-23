// Synchronous compatibility for small template/outline seeds. Live documents
// use requestLayout and the worker; there is only one set of layout mathematics.
import { adaptInput, applyPositionPatch } from "./layout-engine/adapter";
import { solveLayout } from "./layout-engine";
import type { LayoutMode, MindMapNode } from "@/types/mindmap";
export function runLayout(nodes:MindMapNode[],mode:LayoutMode):MindMapNode[] {
  return applyPositionPatch(nodes,solveLayout(adaptInput(nodes,{mode,edges:[]})));
}
export function runSubtreeLayout(nodes:MindMapNode[],rootId:string,mode:LayoutMode):MindMapNode[] {
  return applyPositionPatch(nodes,solveLayout(adaptInput(nodes,{mode,edges:[]},{strategy:"subtree",subtreeRootId:rootId})));
}
const layout=(mode:LayoutMode)=>(nodes:MindMapNode[],rootId?:string)=>rootId?runSubtreeLayout(nodes,rootId,mode):runLayout(nodes,mode);
export const layoutRightTree=layout("right-tree");
export const layoutBidirectionalTree=layout("bidirectional");
export const layoutVerticalTree=layout("vertical");
export const layoutRadialTree=layout("radial");
