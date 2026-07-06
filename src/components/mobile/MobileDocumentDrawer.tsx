"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Copy,
  FilePlus2,
  LayoutTemplate,
  MoreVertical,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { cn } from "@/lib/cn";
import { useMindMapStore } from "@/store/mindMapStore";

export function MobileDocumentDrawer() {
  const open = useMindMapStore((s) => s.mobileDrawerOpen);
  const setOpen = useMindMapStore((s) => s.setMobileDrawerOpen);
  const documents = useMindMapStore((s) => s.documents);
  const activeId = useMindMapStore((s) => s.activeDocumentId);
  const setActiveDocument = useMindMapStore((s) => s.setActiveDocument);
  const createDocument = useMindMapStore((s) => s.createDocument);
  const duplicateDocument = useMindMapStore((s) => s.duplicateDocument);
  const deleteDocument = useMindMapStore((s) => s.deleteDocument);
  const setDialog = useMindMapStore((s) => s.setDialog);

  const sorted = [...documents].sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ type: "spring", damping: 34, stiffness: 320 }}
          className="fixed inset-0 z-[120] flex flex-col bg-surface-base"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 pt-[env(safe-area-inset-top)]">
            <h2 className="text-base font-semibold text-ink">문서</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="닫기"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft active:bg-surface-overlay"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto mf-scroll p-3 space-y-2">
            {sorted.map((doc) => (
              <div
                key={doc.id}
                onClick={() => setActiveDocument(doc.id)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-4 transition",
                  doc.id === activeId
                    ? "border-brand/40 bg-brand/10"
                    : "border-line bg-surface-raised active:bg-surface-overlay"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {doc.title}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {doc.nodes.length} 노드 ·{" "}
                    {new Date(doc.updatedAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <Dropdown
                  align="right"
                  trigger={
                    <button
                      aria-label="문서 메뉴"
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-faint active:bg-surface-overlay"
                    >
                      <MoreVertical size={18} />
                    </button>
                  }
                  items={[
                    {
                      id: "duplicate",
                      label: "복제",
                      icon: <Copy size={16} />,
                      onSelect: () => duplicateDocument(doc.id),
                    },
                    {
                      id: "delete",
                      label: "삭제",
                      icon: <Trash2 size={16} />,
                      danger: true,
                      onSelect: () => deleteDocument(doc.id),
                    },
                  ]}
                />
              </div>
            ))}
          </div>

          {/* Fixed bottom actions — one compact row so they don't hog space */}
          <div className="shrink-0 border-t border-line px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            <div className="flex gap-2">
              <Button
                variant="primary"
                className="flex-1 justify-center h-11"
                onClick={() => createDocument()}
              >
                <FilePlus2 size={17} /> 새 문서
              </Button>
              <Button
                className="flex-1 justify-center h-11"
                onClick={() => {
                  setOpen(false);
                  setDialog("template");
                }}
              >
                <LayoutTemplate size={17} /> 템플릿
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
