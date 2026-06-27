"use client";

import {
  ChevronsLeft,
  Copy,
  FilePlus2,
  LayoutTemplate,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { OutlinePanel } from "@/components/panels/OutlinePanel";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { cn } from "@/lib/cn";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapDocument } from "@/types/mindmap";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

function DocumentCard({ doc }: { doc: MindMapDocument }) {
  const activeId = useMindMapStore((s) => s.activeDocumentId);
  const setActiveDocument = useMindMapStore((s) => s.setActiveDocument);
  const renameDocument = useMindMapStore((s) => s.renameDocument);
  const duplicateDocument = useMindMapStore((s) => s.duplicateDocument);
  const deleteDocument = useMindMapStore((s) => s.deleteDocument);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.title);
  const active = doc.id === activeId;

  return (
    <div
      onClick={() => setActiveDocument(doc.id)}
      className={cn(
        "group cursor-pointer rounded-xl border px-3 py-2.5 transition",
        active
          ? "border-brand/40 bg-brand/10"
          : "border-transparent hover:border-line hover:bg-surface-overlay"
      )}
    >
      <div className="flex items-center gap-2">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              renameDocument(doc.id, draft.trim() || doc.title);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                renameDocument(doc.id, draft.trim() || doc.title);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="flex-1 rounded-md bg-surface-base border border-brand/50 px-1.5 py-0.5 text-sm text-ink focus:outline-none"
          />
        ) : (
          <span
            className={cn(
              "flex-1 truncate text-sm font-medium",
              active ? "text-ink" : "text-ink-soft group-hover:text-ink"
            )}
          >
            {doc.title}
          </span>
        )}
        <Dropdown
          align="right"
          width={170}
          trigger={
            <button
              onClick={(e) => e.stopPropagation()}
              aria-label="문서 메뉴"
              className="opacity-0 group-hover:opacity-100 transition h-7 w-7 flex items-center justify-center rounded-lg text-ink-faint hover:bg-surface-raised"
            >
              <MoreHorizontal size={16} />
            </button>
          }
          items={[
            {
              id: "rename",
              label: "이름 변경",
              icon: <Pencil size={15} />,
              onSelect: () => {
                setDraft(doc.title);
                setEditing(true);
              },
            },
            {
              id: "duplicate",
              label: "복제",
              icon: <Copy size={15} />,
              onSelect: () => duplicateDocument(doc.id),
            },
            {
              id: "delete",
              label: "삭제",
              icon: <Trash2 size={15} />,
              danger: true,
              onSelect: () => deleteDocument(doc.id),
            },
          ]}
        />
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
        <span>{doc.nodes.length} 노드</span>
        <span>·</span>
        <span>{timeAgo(doc.updatedAt)}</span>
      </div>
    </div>
  );
}

export function Sidebar({ inDrawer = false }: { inDrawer?: boolean }) {
  const documents = useMindMapStore((s) => s.documents);
  const createDocument = useMindMapStore((s) => s.createDocument);
  const setDialog = useMindMapStore((s) => s.setDialog);
  const setSearchOpen = useMindMapStore((s) => s.setSearchOpen);
  const toggleSidebar = useMindMapStore((s) => s.toggleSidebar);

  const sorted = [...documents].sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
  );

  return (
    <aside
      className={cn(
        "flex h-full w-[272px] flex-col border-r border-line mf-glass",
        inDrawer && "w-full"
      )}
    >
      {/* Brand header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-line/60">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
            <PanelLeft size={15} />
          </div>
          <span className="font-semibold text-ink tracking-tight">
            MindForge
          </span>
        </div>
        {!inDrawer && (
          <button
            onClick={toggleSidebar}
            aria-label="사이드바 접기"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-faint hover:bg-surface-overlay hover:text-ink"
          >
            <ChevronsLeft size={18} />
          </button>
        )}
      </div>

      {/* Quick actions */}
      <div className="p-3 space-y-2">
        <Button
          variant="primary"
          className="w-full justify-start"
          onClick={() => createDocument()}
        >
          <FilePlus2 size={16} /> 새 문서
        </Button>
        <div className="flex gap-2">
          <Button
            className="flex-1 justify-center"
            onClick={() => setDialog("template")}
          >
            <LayoutTemplate size={15} /> 템플릿
          </Button>
          <Button
            className="flex-1 justify-center"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={15} /> 검색
          </Button>
        </div>
      </div>

      {/* Document list */}
      <div className="px-3 pb-1">
        <p className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          문서 ({documents.length})
        </p>
      </div>
      <div className="flex-1 overflow-y-auto mf-scroll px-3 pb-3 space-y-1 min-h-0">
        {sorted.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} />
        ))}
      </div>

      {/* Outline */}
      <div className="border-t border-line/60 min-h-0 max-h-[40%] flex flex-col">
        <OutlinePanel />
      </div>
    </aside>
  );
}
