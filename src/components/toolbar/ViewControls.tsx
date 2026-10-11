"use client";

import { Eye, Maximize, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { computeDepths, getHiddenNodeIds } from "@/lib/tree";
import { useMindMapStore } from "@/store/mindMapStore";

/** One focus-managed surface shared by the desktop and mobile editor. */
export function ViewControls({ mobile = false }: { mobile?: boolean }) {
  const nodes = useMindMapStore((s) => s.nodes);
  const activeDocumentId = useMindMapStore((s) => s.activeDocumentId);
  const collapseAll = useMindMapStore((s) => s.collapseAll);
  const expandAll = useMindMapStore((s) => s.expandAll);
  const expandToDepth = useMindMapStore((s) => s.expandToDepth);
  const fitToView = useMindMapStore((s) => s.fitToView);
  const setSearchOpen = useMindMapStore((s) => s.setSearchOpen);
  const [open, setOpen] = useState(false);
  const [extraDepth, setExtraDepth] = useState(4);
  const [announcement, setAnnouncement] = useState("");
  const { maxDepth, visibleCount } = useMemo(() => {
    const depths = computeDepths(nodes);
    let maxDepth = 0;
    for (const depth of depths.values()) maxDepth = Math.max(maxDepth, depth);
    return { maxDepth, visibleCount: nodes.length - getHiddenNodeIds(nodes).size };
  }, [nodes]);

  useEffect(() => {
    setOpen(false);
    setAnnouncement("");
    setExtraDepth(4);
  }, [activeDocumentId]);

  const run = (action: () => void, message: string) => {
    // Preserve a node's inline draft through its existing blur/commit path.
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches('input, textarea, [contenteditable="true"]')) active.blur();
    action();
    setAnnouncement(message);
  };
  const chooseDepth = (depth: number) =>
    run(() => expandToDepth(depth), `${depth}단계까지 펼쳤습니다.`);

  return (
    <>
      <Button
        variant="ghost"
        size={mobile ? "icon" : "sm"}
        aria-label="보기 제어"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-view-trigger
        className={mobile ? "shrink-0 flex-col gap-0.5 text-[10px]" : "shrink-0"}
        onClick={() => {
          setAnnouncement("");
          setOpen(true);
        }}
      >
        <Eye size={mobile ? 18 : 16} aria-hidden="true" />
        <span>보기</span>
      </Button>
      {open && createPortal(<Modal
        open={open}
        onClose={() => setOpen(false)}
        title="보기"
        description="루트는 0단계입니다. 1단계는 루트와 바로 아래 자식, 2단계는 그 자식의 하위 항목까지 보여줍니다. 각 루트에 같은 기준을 적용합니다."
        footer={<Button onClick={() => setOpen(false)}>완료</Button>}
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => run(collapseAll, "모두 접었습니다. 루트만 보입니다.")}>모두 접기</Button>
            <Button onClick={() => run(expandAll, "모두 펼쳤습니다.")}>모두 펼치기</Button>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-ink-soft">단계별 펼치기</p>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((depth) => (
                <Button key={depth} aria-label={`${depth}단계까지 펼치기`} onClick={() => chooseDepth(depth)}>{depth}단계</Button>
              ))}
            </div>
            {maxDepth > 3 && (
              <div className="mt-2 flex gap-2">
                <select
                  aria-label="추가 펼치기 단계"
                  value={Math.min(extraDepth, maxDepth)}
                  onChange={(event) => setExtraDepth(Number(event.target.value))}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface-base px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-soft"
                >
                  {Array.from({ length: maxDepth - 3 }, (_, i) => i + 4).map((depth) => (
                    <option key={depth} value={depth}>{depth}단계까지</option>
                  ))}
                </select>
                <Button onClick={() => chooseDepth(Math.min(extraDepth, maxDepth))}>단계 적용</Button>
              </div>
            )}
            <p className="mt-2 text-xs text-ink-faint">이전 접힘 상태와 관계없이 선택한 단계까지 펼칩니다.</p>
          </div>
          <p className="text-xs text-ink-soft" role="status" aria-live="polite" aria-atomic="true">
            {announcement && <span>{announcement} </span>}
            전체 {nodes.length.toLocaleString()}개 중 {visibleCount.toLocaleString()}개 표시 · 최대 {maxDepth}단계
          </p>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button onClick={() => run(fitToView, "화면에 맞췄습니다.")}><Maximize size={16} aria-hidden="true" />화면 맞춤</Button>
            <Button onClick={() => {
              setOpen(false);
              // Restore the trigger first so search can return focus to it.
              requestAnimationFrame(() => setSearchOpen(true));
            }}><Search size={16} aria-hidden="true" />검색</Button>
          </div>
        </div>
      </Modal>, document.body)}
    </>
  );
}
