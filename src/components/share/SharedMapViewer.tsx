"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow } from "@xyflow/react";
import { ChevronLeft, ChevronRight, Eye, GitBranch, Maximize2, Minus, Plus, RefreshCw, Search, X } from "lucide-react";
import type { SharedCloudDocument } from "@/lib/cloud/contracts";
import { appearanceFrom } from "@/lib/appearance";
import { fontFamilyFor, NODE_STATUS_CONFIG, NODE_TYPE_CONFIG } from "@/lib/constants";
import { EMPTY_INK, inkBounds } from "@/lib/ink";
import { union } from "@/lib/layout-engine/geometry";
import { renderInlineMarkdown } from "@/lib/inlineMarkdown";
import { SharedNode } from "./SharedNode";
import { SharedEdge } from "./SharedEdge";
import { SharedInk } from "./SharedInk";
import { ViewerContext } from "./ViewerContext";
import { createSharedDocumentLoader, type SharedLoadState } from "./viewer-client";
import { initialCollapsed, matchingNodeIds, revealAncestors, safeViewerHref, viewerProjection, type ViewerNode } from "./viewer-model";

const nodeTypes = { sharedNode: SharedNode };
const edgeTypes = { sharedEdge: SharedEdge };
export function SharedMapViewer() {
  const [state, setState] = useState<SharedLoadState>({ status: "loading" });
  const loaderRef = useRef<ReturnType<typeof createSharedDocumentLoader> | null>(null);
  const reload = useCallback(() => loaderRef.current?.load(window.location.hash), []);
  useEffect(() => {
    const loader = createSharedDocumentLoader(setState);
    loaderRef.current = loader;
    const loadFragment = () => loader.load(window.location.hash);
    const restore = (event: PageTransitionEvent) => { if (event.persisted) loadFragment(); };
    loadFragment();
    window.addEventListener("hashchange", loadFragment);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("hashchange", loadFragment);
      window.removeEventListener("pageshow", restore);
      loader.dispose();
    };
  }, []);

  if (state.status !== "ready") {
    const text = state.status === "loading"
      ? { title: "공유 마인드맵을 불러오는 중", message: "잠시만 기다려 주세요." }
      : state.status === "not-found"
      ? { title: "공유 링크를 열 수 없어요", message: "링크가 올바르지 않거나 공유가 중지되었습니다. 작성자에게 새 링크를 요청해 주세요." }
      : state.status === "unavailable"
      ? { title: "지금은 공유 서비스를 이용할 수 없어요", message: "잠시 후 다시 시도해 주세요. 계속 열리지 않으면 작성자에게 알려 주세요." }
      : { title: "마인드맵을 불러오지 못했어요", message: "네트워크 연결을 확인한 뒤 다시 시도해 주세요." };
    return <main className="shared-viewer shared-state" aria-busy={state.status === "loading"}>
      <a className="shared-brand" href="/" referrerPolicy="no-referrer"><GitBranch size={22} aria-hidden />MindBranch</a>
      <div className="shared-state-card" role={state.status === "loading" ? "status" : "alert"}>
        <Eye size={28} aria-hidden />
        <h1>{text.title}</h1><p>{text.message}</p>
        {state.status !== "loading" && <button type="button" className="shared-action" onClick={reload}><RefreshCw size={16} aria-hidden />다시 시도</button>}
      </div>
      <p className="shared-state-note">공유 문서는 읽기 전용으로 열립니다.</p>
    </main>;
  }
  return <ReactFlowProvider key={state.revision}><SharedCanvas sharedDoc={state.document} reload={reload} /></ReactFlowProvider>;
}

function SharedCanvas({ sharedDoc, reload }: { sharedDoc: SharedCloudDocument; reload: () => void }) {
  const appearance = useMemo(() => appearanceFrom(sharedDoc.appearance), [sharedDoc]);
  const [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const dark = appearance.theme === "dark" || (appearance.theme === "system" && systemDark);
  const [collapsed, setCollapsed] = useState(() => initialCollapsed(sharedDoc));
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(-1);
  const [focusTarget, setFocusTarget] = useState<{ id: string; sequence: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flowReady, setFlowReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const matches = useMemo(() => matchingNodeIds(sharedDoc, query), [sharedDoc, query]);
  const projection = useMemo(() => viewerProjection(sharedDoc, collapsed, query), [sharedDoc, collapsed, query]);
  const flow = useReactFlow<ViewerNode>();
  const nodesReady = useNodesInitialized();
  const fitted = useRef(false);
  const ink = sharedDoc.ink ?? EMPTY_INK;
  const inkRect = useMemo(() => inkBounds(ink), [ink]);
  const fitAll = useCallback((duration = 250) => {
    const visible = flow.getNodes().filter((n) => !n.hidden);
    const rect = visible.length ? flow.getNodesBounds(visible) : null;
    const bounds = inkRect ? union(rect, inkRect) : rect;
    if (bounds) void flow.fitBounds({ ...bounds, width: Math.max(bounds.width, 80), height: Math.max(bounds.height, 80) }, { padding: .2, duration });
  }, [flow, inkRect]);
  useEffect(() => {
    if (!flowReady || (sharedDoc.nodes.length > 0 && !nodesReady) || fitted.current) return;
    if (sharedDoc.viewport) { fitted.current = true; return; }
    let cancelled = false;
    // FontFaces are bundled locally. Wait for their metrics before framing the
    // saved geometry; loading a viewer does not touch global app preferences.
    void document.fonts.ready.then(() => {
      requestAnimationFrame(() => { if (!cancelled) { fitted.current = true; fitAll(0); } });
    });
    return () => { cancelled = true; };
  }, [flowReady, nodesReady, sharedDoc, fitAll]);
  useEffect(() => {
    if (!focusTarget || !flowReady) return;
    const frame = requestAnimationFrame(() => {
      void flow.fitView({ nodes: [{ id: focusTarget.id }], padding: .8, duration: 250, minZoom: .2, maxZoom: 1.25 });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusTarget, flowReady, flow]);
  useEffect(() => { if (selectedId) detailsRef.current?.focus(); }, [selectedId]);
  const toggleCollapse = useCallback((id: string) => setCollapsed((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const viewerContext = useMemo(() => ({ appearance, toggleCollapse, inspectNode: setSelectedId }), [appearance, toggleCollapse]);
  const goToMatch = (direction: number) => {
    if (!matches.length) return;
    const index = matchIndex < 0 ? (direction < 0 ? matches.length - 1 : 0) : (matchIndex + direction + matches.length) % matches.length;
    const id = matches[index];
    setMatchIndex(index);
    setCollapsed((previous) => revealAncestors(sharedDoc, previous, id));
    setFocusTarget((previous) => ({ id, sequence: (previous?.sequence ?? 0) + 1 }));
  };
  const selected = sharedDoc.nodes.find((n) => n.id === selectedId);
  const selectedHref = safeViewerHref(selected?.data.link);
  const noContent = sharedDoc.nodes.length === 0 && !ink.strokes.length && !ink.objects?.length;
  return <ViewerContext.Provider value={viewerContext}>
    <main className={`shared-viewer${dark ? " dark" : ""}`} data-accent={appearance.accent} data-shared-viewer="ready"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); searchRef.current?.focus(); }
        if (event.key === "Escape") { setSelectedId(null); searchRef.current?.blur(); }
      }}>
      <header className="shared-header">
        <a className="shared-brand" href="/" referrerPolicy="no-referrer" aria-label="MindBranch 홈"><GitBranch size={22} aria-hidden /><span>MindBranch</span></a>
        <div className="shared-title"><h1>{sharedDoc.title || "제목 없는 마인드맵"}</h1><span><Eye size={12} aria-hidden />읽기 전용</span></div>
        <button type="button" className="shared-action shared-reload" onClick={reload}><RefreshCw size={15} aria-hidden /><span>최신 내용 불러오기</span></button>
      </header>
      <div className="shared-tools">
        <form className="shared-search" role="search" onSubmit={(event) => { event.preventDefault(); goToMatch(1); }}>
          <Search size={17} aria-hidden /><input ref={searchRef} aria-label="공유 마인드맵 검색" placeholder="내용 · 태그 검색" value={query} maxLength={200} onChange={(event) => { setQuery(event.target.value); setMatchIndex(-1); }} />
          {query && <button type="button" aria-label="검색 지우기" onClick={() => { setQuery(""); setMatchIndex(-1); searchRef.current?.focus(); }}><X size={16} aria-hidden /></button>}
        </form>
        {query.trim() && <div className="shared-search-nav"><span role="status" aria-live="polite">{matches.length ? `${matchIndex < 0 ? "" : `${matchIndex + 1} / `}${matches.length}개 결과` : "검색 결과 없음"}</span><button type="button" aria-label="이전 검색 결과" disabled={!matches.length} onClick={() => goToMatch(-1)}><ChevronLeft size={16} aria-hidden /></button><button type="button" aria-label="다음 검색 결과" disabled={!matches.length} onClick={() => goToMatch(1)}><ChevronRight size={16} aria-hidden /></button></div>}
        <span className="shared-view-hint">확대 · 이동 · 가지 접기가 가능해요</span>
      </div>
      <div className="shared-canvas" style={{ fontFamily: fontFamilyFor(appearance.font), "--font-sans": fontFamilyFor(appearance.font) } as CSSProperties}>
        <ReactFlow<ViewerNode>
          nodes={projection.nodes} edges={projection.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onInit={() => setFlowReady(true)}
          defaultViewport={sharedDoc.viewport}
          nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false}
          edgesReconnectable={false} elementsSelectable={false} deleteKeyCode={null}
          selectionKeyCode={null} multiSelectionKeyCode={null} selectionOnDrag={false}
          panOnDrag panOnScroll zoomOnPinch zoomOnScroll zoomOnDoubleClick
          minZoom={.0001} maxZoom={2.5} preventScrolling
          aria-label="읽기 전용 공유 마인드맵 캔버스"
          proOptions={{ hideAttribution: true }}
        >
          <SharedInk ink={ink} />
          {appearance.canvasBg !== "none" && (!ink.paper || ink.paper.kind === "none") && <Background
            variant={appearance.canvasBg === "lines" ? BackgroundVariant.Lines : appearance.canvasBg === "cross" ? BackgroundVariant.Cross : BackgroundVariant.Dots}
            gap={appearance.canvasBg === "dots" ? 22 : 30} size={appearance.canvasBg === "dots" ? 1.4 : appearance.canvasBg === "cross" ? 5 : 1}
            className={appearance.canvasBg === "dots" ? "!opacity-55" : "!opacity-35"}
          />}
        </ReactFlow>
        {noContent && <div className="shared-empty">아직 작성된 내용이 없어요.</div>}
        <div className="shared-camera" aria-label="화면 확대와 이동">
          <button type="button" aria-label="확대" title="확대" onClick={() => void flow.zoomIn({ duration: 180 })}><Plus size={18} aria-hidden /></button>
          <button type="button" aria-label="축소" title="축소" onClick={() => void flow.zoomOut({ duration: 180 })}><Minus size={18} aria-hidden /></button>
          <button type="button" aria-label="전체 보기" title="전체 보기" onClick={() => fitAll()}><Maximize2 size={17} aria-hidden /></button>
        </div>
        {selected && <aside ref={detailsRef} tabIndex={-1} className="shared-details" aria-label="노드 상세 내용">
          <div className="shared-details-top"><span>{NODE_TYPE_CONFIG[selected.data.type].label}</span><button type="button" aria-label="상세 내용 닫기" onClick={() => setSelectedId(null)}><X size={18} aria-hidden /></button></div>
          <h2>{selected.data.emoji} {renderInlineMarkdown(selected.data.label || "내용 없음")}</h2>
          {selected.data.status && selected.data.status !== "none" && <p className="shared-details-status">{NODE_STATUS_CONFIG[selected.data.status].label}</p>}
          {selected.data.description && <p className="shared-details-description">{selected.data.description}</p>}
          {!!selected.data.checklist?.length && <ul className="shared-details-checks" aria-label="체크리스트">{selected.data.checklist.map((item) => <li key={item.id}><span aria-label={item.checked ? "완료" : "미완료"}>{item.checked ? "☑" : "☐"}</span><span>{item.text}</span></li>)}</ul>}
          {!!selected.data.tags?.length && <div className="shared-node-tags">{selected.data.tags.map((tag, index) => <span key={index}>#{tag}</span>)}</div>}
          {selectedHref && <a href={selectedHref} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="shared-details-link">연결된 링크 열기 ↗</a>}
        </aside>}
      </div>
      <footer className="shared-footer"><span>작성자가 저장한 공유 문서입니다.</span><span>열람 중 변경은 저장되지 않아요.</span></footer>
    </main>
  </ViewerContext.Provider>;
}
