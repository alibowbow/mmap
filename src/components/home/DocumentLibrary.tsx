"use client";

import { ChevronDown, Copy, Download, MoreHorizontal, Pencil, Pin, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { queryDocuments, type DocumentFilter, type DocumentSort } from "@/lib/documentLibrary";
import { downloadFile, exportDocumentJson, safeFileName } from "@/lib/export";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapDocument } from "@/types/mindmap";

type Result = ReturnType<typeof queryDocuments>[number];

// A row's summary line: the map's first-level topics, in order.
function topicsOf(doc: MindMapDocument): string {
  const root = doc.nodes.find((n) => n.data.isRoot) ?? doc.nodes.find((n) => !n.data.parentId);
  if (!root) return "";
  return doc.nodes
    .filter((n) => n.data.parentId === root.id)
    .map((n) => (n.data.label || "").trim())
    .filter(Boolean)
    .join(" · ");
}

const DAY = 86_400_000;
const startOfDay = (t: number) => new Date(new Date(t).toDateString()).getTime();

function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!t) return "";
  const diff = now - t;
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  const today = startOfDay(now);
  if (t >= today) return `${Math.floor(diff / 3_600_000)}시간 전`;
  if (t >= today - DAY) return "어제";
  const d = new Date(t);
  return d.getFullYear() === new Date(now).getFullYear()
    ? d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
    : d.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" });
}

// Recency buckets for the default (most recently edited) ordering.
function groupOf(iso: string, now: number): string {
  const t = Date.parse(iso) || 0;
  const today = startOfDay(now);
  if (t >= today) return "오늘";
  if (t >= today - 7 * DAY) return "지난 7일";
  if (t >= today - 30 * DAY) return "지난 30일";
  return "이전";
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 5.5,
    c = 2 * Math.PI * r;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 -rotate-90">
      <circle cx="7" cy="7" r={r} fill="none" strokeWidth="1.6" style={{ stroke: "rgb(var(--line))" }} />
      {done > 0 && (
        <circle cx="7" cy="7" r={r} fill="none" strokeWidth="1.6" strokeLinecap="round"
          strokeDasharray={`${(done / total) * c} ${c}`} style={{ stroke: "rgb(var(--ink-soft))" }} />
      )}
    </svg>
  );
}

const FILTERS = [["all", "전체"], ["pinned", "고정"], ["unfinished", "할 일 남음"]] as const;

export function DocumentLibrary({ documents, onOpen }: {
  documents: MindMapDocument[]; onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [sort, setSort] = useState<DocumentSort>("recent");
  const [renaming, setRenaming] = useState<MindMapDocument | null>(null);
  const [title, setTitle] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const togglePin = useMindMapStore((s) => s.toggleDocumentPin);
  const duplicate = useMindMapStore((s) => s.duplicateDocument);
  const rename = useMindMapStore((s) => s.renameDocument);
  const results = useMemo(() => queryDocuments(documents, deferredQuery, filter, sort), [documents, deferredQuery, filter, sort]);
  const counts = useMemo(() => ({
    all: documents.length,
    pinned: documents.filter((d) => d.pinned).length,
    unfinished: queryDocuments(documents, "", "unfinished", "recent").length,
  }), [documents]);

  // "/" jumps to search, as in most document tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(() => {
    const now = Date.now();
    if (sort !== "recent" || deferredQuery.trim()) return [{ label: "", items: results }];
    const out: { label: string; items: Result[] }[] = [];
    for (const r of results) {
      const label = r.document.pinned ? "고정됨" : groupOf(r.document.updatedAt, now);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(r);
      else out.push({ label, items: [r] });
    }
    return out;
  }, [results, sort, deferredQuery]);

  const saveTitle = () => {
    if (!renaming || !title.trim()) return;
    rename(renaming.id, title.trim());
    setRenaming(null);
  };
  const now = Date.now();

  return (
    <section aria-labelledby="documents-heading" className="min-w-0">
      <h2 id="documents-heading" tabIndex={-1} className="mf-library-heading scroll-mt-6 outline-none">모든 문서</h2>
      <div className="mf-doc-toolbar">
        <div className="flex" role="group" aria-label="문서 필터">
          {FILTERS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className="mf-doc-tab">
              {label}<span className="mf-doc-tab-count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="mf-doc-tools">
          <div className="mf-doc-search">
            <Search size={15} aria-hidden="true" />
            <input ref={searchRef} type="search" aria-label="문서와 내용 검색" placeholder="검색" value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); e.currentTarget.blur(); } }} />
            {query
              ? <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")}><X size={14} /></button>
              : <kbd aria-hidden="true">/</kbd>}
          </div>
          <label className="mf-doc-sort">
            <span className="sr-only">문서 정렬</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as DocumentSort)}>
              <option value="recent">최근 수정</option><option value="created">최근 생성</option><option value="name">이름</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>
      </div>
      <p role="status" className="sr-only">{results.length}개 문서{query.trim() ? ` · “${query.trim()}” 검색 결과` : ""}</p>

      <div id="documents-list">
        {groups.map((group) => group.items.length > 0 && (
          <div key={group.label || "all"}>
            {group.label && <h3 className="mf-doc-group">{group.label}<span>{group.items.length}</span></h3>}
            <ul className="mf-doc-list">
              {group.items.map(({ document: doc, progress, snippet }) => {
                const summary = snippet || topicsOf(doc);
                return (
                  <li key={doc.id} data-document-id={doc.id} className="mf-doc-row">
                    <button type="button" aria-label={`${doc.title} 열기`} onClick={() => onOpen(doc.id)} className="mf-doc-open">
                      <span className="min-w-0">
                        <span className="mf-doc-title">
                          {doc.pinned && <Pin size={12} aria-label="고정됨" className="shrink-0 fill-current text-ink-faint" />}
                          <span className="truncate" title={doc.title}>{doc.title}</span>
                        </span>
                        <span className="mf-doc-summary" title={summary || undefined}>{summary || "비어 있는 맵"}</span>
                      </span>
                      <span className="mf-doc-meta">
                        <span className="mf-doc-tasks">
                          {progress.total > 0 && <><ProgressRing done={progress.done} total={progress.total} /><span aria-label={`할 일 ${progress.total}개 중 ${progress.done}개 완료`}>{progress.done}/{progress.total}</span></>}
                        </span>
                        <span className="mf-doc-nodes">{doc.nodes.length}<span className="ml-0.5">노드</span></span>
                        <time className="mf-doc-date" dateTime={doc.updatedAt}>{relativeTime(doc.updatedAt, now)}</time>
                      </span>
                    </button>
                    <div className="mf-doc-actions">
                      <button type="button" aria-label={`${doc.title} ${doc.pinned ? "고정 해제" : "고정"}`} aria-pressed={!!doc.pinned} onClick={() => togglePin(doc.id)}><Pin size={15} className={doc.pinned ? "fill-current" : undefined} /></button>
                      <Dropdown align="right" trigger={<button type="button" aria-label={`${doc.title} 문서 메뉴`}><MoreHorizontal size={16} /></button>} items={[
                        { id: 'rename', label: '이름 변경', icon: <Pencil size={15} />, onSelect: () => { setTitle(doc.title); setRenaming(doc); } },
                        { id: 'duplicate', label: '복제', icon: <Copy size={15} />, onSelect: () => duplicate(doc.id) },
                        { id: 'export', label: 'JSON 다운로드', icon: <Download size={15} />, onSelect: () => downloadFile(`${safeFileName(doc.title)}.json`, exportDocumentJson(doc), 'application/json') },
                      ]} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {!results.length && <div className="mf-doc-empty">
        <p className="text-[15px] font-medium text-ink">{query.trim() ? "일치하는 문서가 없습니다" : filter === "pinned" ? "고정한 문서가 없습니다" : filter === "unfinished" ? "남은 할 일이 없습니다" : "아직 마인드맵이 없습니다"}</p>
        <p className="mt-1 text-[13px] text-ink-faint">{query.trim() ? "다른 단어로 검색해 보세요." : filter === "pinned" ? "자주 여는 문서는 핀으로 고정해 두세요." : filter === "unfinished" ? "모든 할 일을 끝냈어요." : "새 마인드맵이나 템플릿으로 시작하세요."}</p>
        {(query || filter !== "all") && <Button size="sm" className="mt-4" onClick={() => { setQuery(""); setFilter("all"); }}>전체 문서 보기</Button>}
      </div>}

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="문서 이름 변경" footer={<><Button onClick={() => setRenaming(null)}>취소</Button><Button variant="primary" disabled={!title.trim()} onClick={saveTitle}>저장</Button></>}>
        <label className="block text-xs text-ink-soft">문서 이름<input aria-label="문서 이름" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); saveTitle(); } }} className="mt-2 h-12 w-full rounded-xl border border-line bg-surface-base px-3 text-sm text-ink outline-none focus:border-brand" /></label>
      </Modal>
    </section>
  );
}
