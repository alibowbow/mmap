"use client";

import {
  ArrowDownAZ,
  CalendarPlus,
  ChevronsLeft,
  Clock,
  Copy,
  Files,
  FilePlus2,
  LayoutTemplate,
  ListTree,
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
      className={cn(
        "group relative rounded-xl border p-1 transition-colors",
        active
          ? "border-brand/35 bg-brand/10"
          : "border-transparent hover:border-line hover:bg-surface-sunken/70"
      )}
    >
      {active && (
        <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-brand" />
      )}
      <div className="flex min-w-0 items-center gap-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
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
            className="mx-1 h-10 min-w-0 flex-1 rounded-lg border border-brand/50 bg-surface-base px-2 text-sm text-ink outline-none"
          />
        ) : (
          <button
            onClick={() => setActiveDocument(doc.id)}
            aria-current={active ? "page" : undefined}
            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left"
          >
            <span
              className={cn(
                "block truncate text-sm font-medium",
                active ? "text-ink" : "text-ink-soft group-hover:text-ink"
              )}
            >
              {doc.title}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
              <span>{doc.nodes.length} 노드</span>
              <span aria-hidden="true">·</span>
              <span>{timeAgo(doc.updatedAt)}</span>
            </span>
          </button>
        )}
        <button
          onClick={() => toggleDocumentPin(doc.id)}
          aria-label={doc.pinned ? "고정 해제" : "상단에 고정"}
          title={doc.pinned ? "고정 해제" : "상단에 고정"}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
            doc.pinned
              ? "text-brand opacity-100"
              : "text-ink-faint opacity-100 xl:opacity-0 xl:group-hover:opacity-100 hover:bg-surface-raised"
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
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint opacity-100 transition-colors hover:bg-surface-raised xl:opacity-0 xl:group-hover:opacity-100"
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
    </div>
  );
}

export function Sidebar({ inDrawer = false }: { inDrawer?: boolean }) {
  const documents = useMindMapStore((s) => s.documents);
  const createDocument = useMindMapStore((s) => s.createDocument);
  const setDialog = useMindMapStore((s) => s.setDialog);
  const toggleSidebar = useMindMapStore((s) => s.toggleSidebar);

  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [activeView, setActiveView] = useState<"documents" | "outline">(
    "documents"
  );

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
      aria-label="문서와 지도 구조"
      className={cn(
        "flex h-full w-[248px] flex-col border-r border-line bg-surface-raised",
        inDrawer && "w-full"
      )}
    >
      {/* Brand header */}
      <div className="flex h-[60px] items-center justify-between border-b border-line/70 px-3.5">
        <div className="flex items-center gap-2.5">
          <BrandMark size={27} className="shrink-0 rounded-lg" />
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
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <ChevronsLeft size={18} />
          </button>
        )}
      </div>

      <div className="mx-3 mt-3 grid grid-cols-2 rounded-xl bg-surface-sunken p-1">
        <button
          onClick={() => setActiveView("documents")}
          aria-pressed={activeView === "documents"}
          className={cn(
            "flex h-9 items-center justify-center gap-1.5 rounded-[9px] text-xs font-semibold transition-colors",
            activeView === "documents"
              ? "bg-surface-raised text-ink shadow-sm"
              : "text-ink-faint hover:text-ink"
          )}
        >
          <Files size={15} /> 문서
        </button>
        <button
          onClick={() => setActiveView("outline")}
          aria-pressed={activeView === "outline"}
          className={cn(
            "flex h-9 items-center justify-center gap-1.5 rounded-[9px] text-xs font-semibold transition-colors",
            activeView === "outline"
              ? "bg-surface-raised text-ink shadow-sm"
              : "text-ink-faint hover:text-ink"
          )}
        >
          <ListTree size={15} /> 구조
        </button>
      </div>

      {activeView === "documents" ? (
        <>
          <div className="flex gap-2 p-3 pb-2">
            <Button
              variant="primary"
              className="min-w-0 flex-1 justify-center"
              onClick={() => createDocument()}
            >
              <FilePlus2 size={16} /> 새 문서
            </Button>
            <Button
              size="icon"
              onClick={() => setDialog("template")}
              aria-label="템플릿에서 만들기"
              title="템플릿에서 만들기"
            >
              <LayoutTemplate size={16} />
            </Button>
          </div>

          <div className="space-y-1.5 px-3 pb-2">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="문서 검색…"
                aria-label="문서 검색"
                className="h-10 w-full rounded-xl border border-line bg-surface-base pl-9 pr-9 text-xs text-ink placeholder:text-ink-faint outline-none transition focus-visible:border-brand/50 focus-visible:ring-2 focus-visible:ring-ink-soft"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="검색어 지우기"
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-sunken hover:text-ink"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] font-semibold text-ink-faint">
                {filtered.length}개 문서
              </p>
              <Dropdown
                align="right"
                width={160}
                trigger={
                  <button className="flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-ink-faint hover:bg-surface-sunken hover:text-ink">
                    {sortLabel}
                  </button>
                }
                items={SORT_OPTIONS.map((option) => ({
                  id: option.id,
                  label: option.label,
                  icon: option.icon,
                  active: sortMode === option.id,
                  onSelect: () => setSortMode(option.id),
                }))}
              />
            </div>
          </div>

          <div className="mf-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
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
              <p className="px-2 py-8 text-center text-xs text-ink-faint">
                검색 결과가 없습니다
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-line/60">
          <OutlinePanel />
        </div>
      )}
    </aside>
  );
}
