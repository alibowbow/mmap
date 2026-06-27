"use client";

import { MousePointerClick, Plus, X } from "lucide-react";

import { NodeEditorFields } from "@/components/panels/NodeEditorFields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  selectSelectedNode,
  useMindMapStore,
} from "@/store/mindMapStore";

export function InspectorPanel({ asDrawer = false }: { asDrawer?: boolean }) {
  const node = useMindMapStore(selectSelectedNode);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const setInspectorOpen = useMindMapStore((s) => s.setInspectorOpen);

  return (
    <aside
      className={cn(
        "flex h-full w-[320px] flex-col border-l border-line mf-glass",
        asDrawer && "w-full sm:w-[340px]"
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line/60 px-4">
        <h2 className="text-sm font-semibold text-ink">인스펙터</h2>
        <button
          onClick={() => setInspectorOpen(false)}
          aria-label="인스펙터 닫기"
          className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-faint hover:bg-surface-overlay hover:text-ink"
        >
          <X size={17} />
        </button>
      </div>

      {node ? (
        <>
          <div className="flex-1 overflow-y-auto mf-scroll p-4 pb-6">
            <NodeEditorFields node={node} />
          </div>
          <div className="shrink-0 border-t border-line/60 p-3">
            <Button
              variant="primary"
              className="w-full justify-center"
              onClick={() => addChildNode(node.id)}
            >
              <Plus size={16} /> 자식 노드 추가
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-ink-faint">
          <MousePointerClick size={28} />
          <p className="text-sm">노드를 선택하면 여기에서 편집할 수 있어요.</p>
        </div>
      )}
    </aside>
  );
}
