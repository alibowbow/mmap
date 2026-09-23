"use client";

import { Copy, Download, LayoutGrid, List, MoreHorizontal, Pencil, Pin, Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { queryDocuments, taskProgress, type DocumentFilter, type DocumentSort } from "@/lib/documentLibrary";
import { downloadFile, exportDocumentJson, safeFileName } from "@/lib/export";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapDocument } from "@/types/mindmap";

// A card's summary line: the map's first-level topics, in order.
function topicsOf(doc: MindMapDocument): string {
  const root = doc.nodes.find((n) => n.data.isRoot) ?? doc.nodes.find((n) => !n.data.parentId);
  if (!root) return "";
  return doc.nodes
    .filter((n) => n.data.parentId === root.id)
    .map((n) => (n.data.label || "").trim())
    .filter(Boolean)
    .join(" · ");
}

export function DocumentLibrary({ documents, onOpen }: {
  documents: MindMapDocument[]; onOpen: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [sort, setSort] = useState<DocumentSort>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [renaming, setRenaming] = useState<MindMapDocument | null>(null);
  const [title, setTitle] = useState("");
  const togglePin = useMindMapStore((s) => s.toggleDocumentPin);
  const duplicate = useMindMapStore((s) => s.duplicateDocument);
  const rename = useMindMapStore((s) => s.renameDocument);
  const results = useMemo(() => queryDocuments(documents, deferredQuery, filter, sort), [documents, deferredQuery, filter, sort]);
  const counts = useMemo(() => ({
    all: documents.length,
    pinned: documents.filter((d) => d.pinned).length,
    unfinished: documents.filter((d) => taskProgress(d).remaining > 0).length,
  }), [documents]);

  const saveTitle = () => {
    if (!renaming || !title.trim()) return;
    rename(renaming.id, title.trim());
    setRenaming(null);
  };

  return (
    <section aria-labelledby="documents-heading" className="mf-document-library">
      <div className="w-full">
        <h2 id="documents-heading" tabIndex={-1} className="mf-section-label mb-3 scroll-mt-4 outline-none">문서</h2>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-lg bg-surface-sunken p-0.5" aria-label="문서 필터">
            {([['all', '전체'], ['pinned', '고정'], ['unfinished', '할 일 있음']] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                className={cn("min-h-10 rounded-md px-3 text-xs font-medium transition-colors", filter === id ? "bg-surface-raised text-ink shadow-sm" : "text-ink-soft hover:text-ink")}>
                {label} <span className="ml-1 tabular-nums opacity-70">{counts[id]}</span>
              </button>
            ))}
          </div>
          <div className="relative order-last w-full sm:order-none sm:ml-auto sm:w-64">
            <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-[11px] text-ink-faint" />
            <input type="search" aria-label="문서와 내용 검색" placeholder="제목, 노드 내용, 태그 검색" value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-line bg-surface-raised pl-10 pr-11 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
            {query && <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")} className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-ink-soft"><X size={16} /></button>}
          </div>
          <div className="flex items-center gap-2">
            <select aria-label="문서 정렬" value={sort} onChange={(e) => setSort(e.target.value as DocumentSort)} className="h-10 max-w-[150px] rounded-lg border border-line bg-surface-raised px-3 text-xs">
              <option value="recent">최근 수정순</option><option value="name">이름순</option><option value="created">최근 생성순</option>
            </select>
            <div className="flex rounded-lg border border-line bg-surface-raised p-0.5">
              {([{ id: 'grid', label: '카드 보기', Icon: LayoutGrid }, { id: 'list', label: '목록 보기', Icon: List }] as const).map(({ id, label, Icon }) => (
                <button key={id} type="button" aria-label={label} aria-pressed={view === id} onClick={() => setView(id)} className={cn("flex h-9 w-9 items-center justify-center rounded-md", view === id ? "bg-surface-sunken text-ink" : "text-ink-faint hover:text-ink")}><Icon size={17} /></button>
              ))}
            </div>
          </div>
        </div>
        <p role="status" className="sr-only">{results.length}개 문서{query.trim() ? ` · “${query.trim()}” 검색 결과` : ""}</p>
        <div id="documents-list" className={cn(view === "grid" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "space-y-2")}>
          {results.map(({ document: doc, progress, snippet }) => {
            const summary = snippet || topicsOf(doc);
            const date = new Date(doc.updatedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
            return (
            <article key={doc.id} data-document-id={doc.id} className={cn("mf-document-card relative min-w-0 rounded-[10px] border border-line bg-surface-raised", view === "list" && "flex items-center")}>
              <button type="button" aria-label={`${doc.title} 열기`} onClick={() => onOpen(doc.id)} className={cn("min-w-0 text-left", view === "grid" ? "flex h-full w-full flex-col rounded-[10px] p-4 pr-24" : "flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-l-[10px] px-4 py-3")}>
                <span className={cn("block min-w-0", view === "list" && "w-full sm:w-auto sm:flex-1")}>
                  <span className="block truncate text-[15px] font-semibold" title={doc.title}>{doc.title}</span>
                  <span className={cn("mt-1 block text-[13px] leading-5", summary ? "text-ink-soft" : "text-ink-faint", view === "grid" ? "line-clamp-2 min-h-10" : "truncate")} title={summary || undefined}>{summary || "주제를 추가해 보세요"}</span>
                </span>
                <span className={cn("flex items-center gap-1.5 text-xs tabular-nums text-ink-faint", view === "grid" && "mt-4")}>
                  <time dateTime={doc.updatedAt}>{date}</time>
                  <span aria-hidden="true">·</span><span>노드 {doc.nodes.length}</span>
                  {progress.total > 0 && <><span aria-hidden="true">·</span><span aria-label={`할 일 ${progress.total}개 중 ${progress.done}개 완료`}>할 일 {progress.done}/{progress.total}</span></>}
                </span>
              </button>
              <div className={cn("flex shrink-0 items-center gap-0.5", view === "grid" ? "absolute right-1.5 top-1.5" : "pr-2")}>
                <button type="button" aria-label={`${doc.title} ${doc.pinned ? "고정 해제" : "고정"}`} aria-pressed={!!doc.pinned} onClick={() => togglePin(doc.id)} className={cn("flex h-11 w-11 items-center justify-center rounded-lg hover:bg-surface-base", doc.pinned ? "text-ink" : "text-ink-faint")}><Pin size={15} className={doc.pinned ? "fill-current" : undefined} /></button>
                <Dropdown align="right" trigger={<button type="button" aria-label={`${doc.title} 문서 메뉴`} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-faint hover:bg-surface-base hover:text-ink"><MoreHorizontal size={17} /></button>} items={[
                  { id: 'rename', label: '이름 변경', icon: <Pencil size={15} />, onSelect: () => { setTitle(doc.title); setRenaming(doc); } },
                  { id: 'duplicate', label: '복제', icon: <Copy size={15} />, onSelect: () => duplicate(doc.id) },
                  { id: 'export', label: 'JSON 다운로드', icon: <Download size={15} />, onSelect: () => downloadFile(`${safeFileName(doc.title)}.json`, exportDocumentJson(doc), 'application/json') },
                ]} />
              </div>
            </article>
            );
          })}
        </div>
        {!results.length && <div className="rounded-[10px] border border-dashed border-line py-12 text-center">
          <Search size={24} className="mx-auto mb-3 text-ink-faint" />
          <p className="text-sm text-ink-soft">{query.trim() ? "일치하는 문서가 없습니다." : filter === "pinned" ? "자주 쓰는 문서를 핀 버튼으로 고정하세요." : filter === "unfinished" ? "남아 있는 할 일이 없습니다." : "새 마인드맵으로 첫 생각을 펼쳐보세요."}</p>
          {(query || filter !== "all") && <Button className="mx-auto mt-4" onClick={() => { setQuery(""); setFilter("all"); }}>전체 문서 보기</Button>}
        </div>}
      </div>
      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="문서 이름 변경" footer={<><Button onClick={() => setRenaming(null)}>취소</Button><Button variant="primary" disabled={!title.trim()} onClick={saveTitle}>저장</Button></>}>
        <label className="block text-xs text-ink-soft">문서 이름<input aria-label="문서 이름" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); saveTitle(); } }} className="mt-2 h-12 w-full rounded-xl border border-line bg-surface-base px-3 text-sm text-ink outline-none focus:border-brand" /></label>
      </Modal>
    </section>
  );
}
