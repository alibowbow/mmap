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
      aria-label="선택한 노드 편집"
      className={cn(
        "flex h-full w-[304px] flex-col border-l border-line bg-surface-raised",
        asDrawer && "w-[min(304px,calc(100vw-1.5rem))]"
      )}
    >
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-line/70 px-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">노드 편집</h2>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            내용과 가지 속성을 다듬습니다
          </p>
        </div>
        <button
          onClick={() => setInspectorOpen(false)}
          aria-label="인스펙터 닫기"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <X size={17} />
        </button>
      </div>

      {node ? (
        <>
          <div className="mf-scroll flex-1 overflow-y-auto p-4 pb-8">
            <NodeEditorFields node={node} />
          </div>
          <div className="shrink-0 border-t border-line/70 bg-surface-raised p-3">
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
