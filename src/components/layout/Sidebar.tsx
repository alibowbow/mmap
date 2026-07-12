"use client";

import {
  ArrowDownAZ,
  CalendarPlus,
  ChevronsLeft,
  Clock,
  Copy,
  FilePlus2,
  LayoutTemplate,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { BrandMark } from "@/components/ui/BrandMark";
import { useMemo, useState } from "react";

import { OutlinePanel } from "@/components/panels/OutlinePanel";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { cn } from "@/lib/cn";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapDocument } from "@/types/mindmap";

type SortMode = "recent" | "name" | "created";

const SORT_OPTIONS: { id: SortMode; label: string; icon: React.ReactNode }[] = [
  { id: "recent", label: "최근 수정순", icon: <Clock size={15} /> },
  { id: "name", label: "이름순", icon: <ArrowDownAZ size={15} /> },
  { id: "created", label: "생성순", icon: <CalendarPlus size={15} /> },
];

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
  const toggleDocumentPin = useMindMapStore((s) => s.toggleDocumentPin);

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
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleDocumentPin(doc.id);
          }}
          aria-label={doc.pinned ? "고정 해제" : "상단에 고정"}
          title={doc.pinned ? "고정 해제" : "상단에 고정"}
          className={cn(
            "h-7 w-7 flex items-center justify-center rounded-lg transition shrink-0",
            doc.pinned
              ? "text-brand opacity-100"
              : "text-ink-faint opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-surface-raised"
          )}
        >
          <Pin size={14} className={doc.pinned ? "fill-current" : undefined} />
        </button>
        <Dropdown
          align="right"
          width={170}
          trigger={
            <button
              aria-label="문서 메뉴"
              className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition h-7 w-7 flex items-center justify-center rounded-lg text-ink-faint hover:bg-surface-raised"
            >
              <MoreHorizontal size={16} />
            </button>
          }
          items={[
            {
              id: "pin",
              label: doc.pinned ? "고정 해제" : "상단에 고정",
              icon: doc.pinned ? <PinOff size={15} /> : <Pin size={15} />,
              onSelect: () => toggleDocumentPin(doc.id),
            },
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

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  const sortFn = (a: MindMapDocument, b: MindMapDocument) => {
    if (sortMode === "name") return a.title.localeCompare(b.title, "ko");
    if (sortMode === "created")
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    return +new Date(b.updatedAt) - +new Date(a.updatedAt);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? documents.filter((d) => d.title.toLowerCase().includes(q))
      : documents;
  }, [documents, query]);

  const pinned = [...filtered].filter((d) => d.pinned).sort(sortFn);
  const rest = [...filtered].filter((d) => !d.pinned).sort(sortFn);
  const sortLabel = SORT_OPTIONS.find((o) => o.id === sortMode)?.label ?? "";

  return (
    <aside
      className={cn(
        "flex h-full w-[272px] flex-col border-r border-line mf-glass",
        inDrawer && "w-full"
      )}
    >
      {/* Brand header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-line/60">
        <div className="flex items-center gap-2.5">
          <BrandMark size={26} className="shrink-0 rounded-lg shadow-sm" />
          <div className="flex flex-col justify-center leading-none">
            <span className="mf-brand-text text-[15px] font-bold tracking-tight">
              MindForge
            </span>
            <span className="mt-0.5 text-[9px] font-medium tracking-wide text-ink-faint">
              생각을 벼리다
            </span>
          </div>
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

      {/* Document search + sort */}
      <div className="px-3 pb-2 space-y-1.5">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="문서 검색…"
            className="w-full rounded-lg border border-line bg-surface-base py-1.5 pl-7 pr-7 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            문서 ({filtered.length})
          </p>
          <Dropdown
            align="right"
            width={160}
            trigger={
              <button className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-ink-faint hover:bg-surface-overlay hover:text-ink">
                {sortLabel}
              </button>
            }
            items={SORT_OPTIONS.map((o) => ({
              id: o.id,
              label: o.label,
              icon: o.icon,
              active: sortMode === o.id,
              onSelect: () => setSortMode(o.id),
            }))}
          />
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto mf-scroll px-3 pb-3 space-y-1 min-h-0">
        {pinned.length > 0 && (
          <>
            <p className="px-1 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              고정됨
            </p>
            {pinned.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} />
            ))}
            <div className="my-1.5 h-px bg-line/70" />
          </>
        )}
        {rest.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} />
        ))}
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-ink-faint">
            검색 결과가 없습니다
          </p>
        )}
      </div>

      {/* Outline */}
      <div className="border-t border-line/60 min-h-0 max-h-[40%] flex flex-col">
        <OutlinePanel />
      </div>
    </aside>
  );
}
