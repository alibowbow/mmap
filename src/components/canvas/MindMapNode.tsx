"use client";

import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import {
  ChevronRight,
  CornerDownRight,
  CornerUpLeft,
  ExternalLink,
  Map as MapIcon,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  fontSizeForDepth,
  NODE_COLOR_PALETTE,
  NODE_HEIGHT,
  NODE_STATUS_CONFIG,
  NODE_TYPE_CONFIG,
  NODE_WIDTH,
} from "@/lib/constants";
import { renderInlineMarkdown } from "@/lib/inlineMarkdown";
import { sanitizeHref } from "@/lib/share";
import { countChildren } from "@/lib/tree";
import { subtreeDrag } from "@/lib/dragState";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNodeData } from "@/types/mindmap";

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function MindMapNodeComponent({ id, data, selected, dragging }: NodeProps) {
  const d = data as MindMapNodeData;
  const editingNodeId = useMindMapStore((s) => s.editingNodeId);
  const searchQuery = useMindMapStore((s) => s.searchQuery);
  const updateNodeLabel = useMindMapStore((s) => s.updateNodeLabel);
  const setEditingNode = useMindMapStore((s) => s.setEditingNode);
  const pushHistory = useMindMapStore((s) => s.pushHistory);
  const toggleCollapse = useMindMapStore((s) => s.toggleCollapse);
  const childCount = useMindMapStore((s) => countChildren(s.nodes, id));
  const nodeStyle = useMindMapStore((s) => s.nodeStyle);
  const openContextMenu = useMindMapStore((s) => s.openContextMenu);
  const openLinkedDoc = useMindMapStore((s) => s.openLinkedDoc);
  const isDropTarget = useMindMapStore((s) => s.dropTargetId === id);
  const nodeTint = useMindMapStore((s) => s.nodeTint);
  const levelFontSizes = useMindMapStore((s) => s.levelFontSizes);
  const addChildNode = useMindMapStore((s) => s.addChildNode);
  const addSiblingNode = useMindMapStore((s) => s.addSiblingNode);
  const deleteNode = useMindMapStore((s) => s.deleteNode);
  const updateNodeData = useMindMapStore((s) => s.updateNodeData);
  // Quick bar shows only for a clean single selection outside special modes.
  const quickBarEligible = useMindMapStore(
    (s) =>
      s.selectedNodeIds.length === 1 &&
      s.selectedNodeIds[0] === id &&
      !s.presentationMode &&
      !s.connectMode
  );
  const quickBarVisible =
    quickBarEligible && !dragging && !d._suppressMenu;
  const [swatchesOpen, setSwatchesOpen] = useState(false);
  // Label size depends on the node's depth (per-level sizing).
  const labelSize = fontSizeForDepth(levelFontSizes, d._depth ?? 0);

  const isEditing = editingNodeId === id;
  const typeConf = NODE_TYPE_CONFIG[d.type] ?? NODE_TYPE_CONFIG.idea;
  const color = d.color ?? d._autoColor ?? typeConf.color;
  const isRoot = d.isRoot || d.type === "root";
  // "plain" nodes show only the user's text — no type icon/label or color rail.
  const isPlain = d.type === "plain" && !isRoot;

  // Visual style (workspace-wide). Unknown ids (e.g. from an older or newer
  // stored workspace) fall back to card.
  const KNOWN_STYLES = ["card", "soft", "outline", "line", "pill", "sticky", "neon"];
  const requestedStyle = d.style ?? nodeStyle;
  const style = KNOWN_STYLES.includes(requestedStyle) ? requestedStyle : "card";
  const isLine = style === "line";
  const isOutline = style === "outline";
  const isPill = style === "pill";
  const isSticky = style === "sticky";
  const isNeon = style === "neon";
  // The type header (icon + label) is hidden for plain and root nodes, and on
  // capsule/post-it styles where a type chip fights the shape's silhouette.
  const hideTypeHeader = isPlain || isRoot || isPill || isSticky;
  // The left color rail appears on filled card/soft styles — including plain
  // nodes, so their color (and rainbow-branch color) is actually visible.
  // Without this, changing a plain child's color had no visible effect.
  const showRail = style === "card" || style === "soft";
  // Filled color overlay (gradient/tint/glow) applies to these styles.
  const showFill = showRail || isPill || isSticky || isNeon;

  // Post-its get a small per-node tilt. Quantized to 5 buckets so adjacent
  // siblings visibly differ instead of reading as a rendering error. Uses the
  // independent CSS `rotate` property so Tailwind's transform utilities
  // (hover translate, selected scale) keep composing.
  const stickyTilt = (() => {
    if (!isSticky || isRoot) return 0;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return [-1.4, -0.7, 0, 0.7, 1.4][Math.abs(h) % 5];
  })();

  const statusConf =
    d.status && d.status !== "none" ? NODE_STATUS_CONFIG[d.status] : null;
  const safeLink = sanitizeHref(d.link);

  const checklistDone =
    d.checklist?.filter((c) => c.checked).length ?? 0;
  const checklistTotal = d.checklist?.length ?? 0;

  // Search highlight match (label / description / tags)
  const q = searchQuery.trim().toLowerCase();
  const isMatch =
    q.length > 0 &&
    (d.label.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q) ||
      d.tags?.some((t) => t.toLowerCase().includes(q)));

  const [draft, setDraft] = useState(d.label);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEditing) return;
    // A typed character (type-to-edit) seeds the draft and lands the cursor at
    // the end; otherwise start from the current label with everything selected.
    const seed = useMindMapStore.getState().editSeed;
    setDraft(seed ?? d.label);
    // Retry over a few frames: layout re-runs and selection updates right
    // after a node is created can steal focus from the fresh textarea.
    let tries = 0;
    let raf = 0;
    const tick = () => {
      const el = inputRef.current;
      if (el && document.activeElement !== el) {
        el.focus();
        if (seed != null) {
          const end = el.value.length;
          el.setSelectionRange(end, end);
        } else {
          el.select();
        }
      }
      if (++tries < 8 && document.activeElement !== inputRef.current) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const commitLabel = () => {
    // Allow clearing the label (empty nodes show a placeholder). Snapshot
    // history once, only when the text actually changed, so a rename is a
    // single undoable step (and an open-then-cancel adds no history noise).
    const next = draft.trim();
    if (next !== d.label) {
      pushHistory();
      updateNodeLabel(id, next);
    }
    setEditingNode(null);
  };

  useEffect(() => {
    if (!quickBarVisible) setSwatchesOpen(false);
  }, [quickBarVisible]);

  // Long-press → arm "drag subtree together" mode. A quick drag (movement
  // before the timer) stays a single-node drag.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressPos = useRef<{ x: number; y: number } | null>(null);

  const clearPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (isEditing) return;
    pressPos.current = { x: e.clientX, y: e.clientY };
    clearPressTimer();
    // Arm via a module ref (not the store) so it doesn't re-render mid-gesture.
    pressTimer.current = setTimeout(() => {
      subtreeDrag.armedId = id;
      pressTimer.current = null;
    }, 320);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // Movement before the long-press fires → treat as a normal single drag.
    if (pressTimer.current && pressPos.current) {
      const dx = Math.abs(e.clientX - pressPos.current.x);
      const dy = Math.abs(e.clientY - pressPos.current.y);
      if (dx > 6 || dy > 6) clearPressTimer();
    }
  };

  // Actual release: clear the timer and disarm.
  const onPointerUpCancel = () => {
    clearPressTimer();
    if (subtreeDrag.armedId === id) subtreeDrag.armedId = null;
  };

  // Pointer leaving the element only cancels the pending timer — it must not
  // disarm an in-progress drag (which would let the context menu slip through).
  const onPointerLeave = () => clearPressTimer();

  // Clear selection treatment: a solid brand ring with an offset + lift.
  const SEL =
    "ring-2 ring-brand ring-offset-2 ring-offset-surface-base shadow-float scale-[1.03]";
  // Per-style chrome (background, border, rounding, shadow).
  const chrome = cn(
    "transition-all duration-150",
    style === "card" &&
      (selected
        ? `rounded-2xl border border-brand bg-surface-raised ${SEL}`
        : "rounded-2xl border border-line bg-surface-raised shadow-node hover:shadow-float hover:-translate-y-0.5"),
    style === "soft" &&
      (selected
        ? `rounded-[26px] border border-brand bg-surface-raised ${SEL}`
        : "rounded-[26px] border border-line bg-surface-raised shadow-node hover:shadow-float hover:-translate-y-0.5"),
    isOutline &&
      (selected
        ? `rounded-2xl border-2 bg-surface-base/30 ${SEL}`
        : "rounded-2xl border-2 bg-surface-base/30 hover:-translate-y-0.5"),
    isLine &&
      (selected
        ? `rounded-md border-0 border-b-2 bg-transparent ${SEL}`
        : "rounded-md border-0 border-b-2 bg-transparent hover:-translate-y-0.5"),
    // Capsule: fixed 38px radius (not rounded-full) so the geometry stays
    // stable when the node grows taller than its min-height.
    isPill &&
      (selected
        ? `rounded-[38px] border border-brand bg-surface-raised ${SEL}`
        : "rounded-[38px] border border-line bg-surface-raised shadow-node hover:shadow-float hover:-translate-y-0.5"),
    // Post-it: no border, paper shadow. No hover-lift — a levitating pinned
    // note fights the metaphor; the shadow deepens instead.
    isSticky &&
      (selected
        ? `rounded-md border-0 bg-surface-raised ${SEL}`
        : "rounded-md border-0 bg-surface-raised shadow-node hover:shadow-float"),
    // Neon: colored 2px border; the glow is painted on the fill overlay so it
    // never clobbers the ring-based selection/search/drop states.
    isNeon &&
      (selected
        ? `rounded-2xl border-2 bg-surface-raised ${SEL}`
        : "rounded-2xl border-2 bg-surface-raised hover:-translate-y-0.5")
  );

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUpCancel}
      onPointerCancel={onPointerUpCancel}
      onPointerLeave={onPointerLeave}
      style={{
        width: NODE_WIDTH,
        minHeight: isLine ? undefined : NODE_HEIGHT,
        borderColor: isOutline || isLine || isNeon ? color : undefined,
        // Independent CSS property — composes with Tailwind transforms.
        rotate: stickyTilt ? `${stickyTilt}deg` : undefined,
      }}
      className={cn(
        "group relative animate-scale-in",
        // Root node centers its text vertically → make it a flex column so the
        // content wrapper can stretch to the node's min-height.
        isRoot && !isLine && "flex flex-col",
        chrome,
        // Presentation spotlight: fade every node except the current one.
        d._dimmed && "opacity-35 transition-opacity duration-300",
        isMatch && !selected && "ring-2 ring-amber-400/80",
        // Highlight when this node is the drop target for a re-parent drag.
        isDropTarget &&
          "ring-2 ring-emerald-500 ring-offset-2 ring-offset-surface-base"
      )}
    >
      {/* Hidden handles on all four faces. The edge picks the face that points
          toward its child (left/right for trees, top/bottom for org/radial). */}
      <Handle id="left-target" type="target" position={Position.Left} />
      <Handle id="left-source" type="source" position={Position.Left} />
      <Handle id="right-target" type="target" position={Position.Right} />
      <Handle id="right-source" type="source" position={Position.Right} />
      <Handle id="top-target" type="target" position={Position.Top} />
      <Handle id="top-source" type="source" position={Position.Top} />
      <Handle id="bottom-target" type="target" position={Position.Bottom} />
      <Handle id="bottom-source" type="source" position={Position.Bottom} />

      {/* Quick action bar: one-tap editing without the inspector or menu. */}
      <NodeToolbar
        isVisible={quickBarVisible && !isEditing}
        position={Position.Top}
        offset={10}
      >
        {/* Stop pointer/touch events from reaching the React Flow pane: on
            touch the pane's gesture handler preventDefaults touchstart, which
            cancels the button's click (the ⋯ / palette taps were being lost). */}
        <div
          onPointerDownCapture={(e) => e.stopPropagation()}
          onTouchStartCapture={(e) => e.stopPropagation()}
          // Stop the click from bubbling to React Flow ancestors: a bubbled
          // click reaches a handler that closes the context menu, and React
          // batches that with openContextMenu so the menu never appears.
          onClick={(e) => e.stopPropagation()}
          className="nodrag nopan flex items-center gap-0.5 rounded-full border border-line bg-surface-overlay/95 p-1 shadow-float backdrop-blur-xl"
        >
          {swatchesOpen ? (
            <>
              {NODE_COLOR_PALETTE.slice(0, 7).map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    updateNodeData(id, { color: c });
                    setSwatchesOpen(false);
                  }}
                  aria-label={`색상 ${c}`}
                  className="h-6 w-6 rounded-full border-2 border-surface-raised transition hover:scale-110"
                  style={{ background: c }}
                />
              ))}
              <button
                onClick={() => setSwatchesOpen(false)}
                aria-label="색상 닫기"
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:bg-surface-raised"
              >
                <ChevronRight size={14} className="rotate-180" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => addChildNode(id)}
                aria-label="자식 추가"
                title="자식 추가 (Tab)"
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition hover:bg-brand/15 hover:text-brand"
              >
                <Plus size={15} />
              </button>
              {!isRoot && (
                <button
                  onClick={() => addSiblingNode(id)}
                  aria-label="형제 추가"
                  title="형제 추가 (Enter)"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition hover:bg-brand/15 hover:text-brand"
                >
                  <CornerDownRight size={14} />
                </button>
              )}
              <button
                onClick={() => setEditingNode(id)}
                aria-label="내용 편집"
                title="편집 (F2)"
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition hover:bg-brand/15 hover:text-brand"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => setSwatchesOpen(true)}
                aria-label="색상 변경"
                title="색상"
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition hover:bg-brand/15 hover:text-brand"
              >
                <Palette size={14} />
              </button>
              <button
                onClick={(e) => openContextMenu(id, e.clientX, e.clientY)}
                aria-label="더 많은 옵션"
                title="더 보기"
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition hover:bg-brand/15 hover:text-brand"
              >
                <MoreHorizontal size={15} />
              </button>
              {!isRoot && (
                <>
                  <span className="mx-0.5 h-4 w-px bg-line" />
                  <button
                    onClick={() => deleteNode(id)}
                    aria-label="노드 삭제"
                    title="삭제 (Delete)"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-ink-soft transition hover:bg-red-500/15 hover:text-red-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </NodeToolbar>

      {/* Root gradient sheen (skipped on the borderless line style) */}
      {isRoot && !isLine && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 opacity-90",
            isPill ? "rounded-[38px]" : "rounded-2xl"
          )}
          style={{
            background: `linear-gradient(135deg, ${hexToRgba(
              color,
              0.16
            )}, ${hexToRgba(color, 0.02)})`,
            // Neon root glows too — painted here so the node's own
            // box-shadow (rings, lift) stays intact.
            ...(isNeon
              ? { boxShadow: `0 0 10px 1px ${hexToRgba(color, 0.35)}` }
              : {}),
          }}
        />
      )}

      {/* Color fill: the picked color visibly fills the node interior.
          card/soft: gradient (or stronger tint when the toggle is on);
          sticky: intrinsic paper fill (ignores the tint toggle);
          neon: faint interior + outer glow — on this overlay, not the node's
          box-shadow, so ring-based selection states never get clobbered. */}
      {showFill && !isRoot && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            style === "soft"
              ? "rounded-[26px]"
              : isPill
              ? "rounded-[38px]"
              : isSticky
              ? "rounded-md"
              : "rounded-2xl"
          )}
          style={{
            background: isSticky
              ? hexToRgba(color, 0.3)
              : isNeon
              ? hexToRgba(color, 0.07)
              : nodeTint
              ? hexToRgba(color, 0.22)
              : `linear-gradient(135deg, ${hexToRgba(
                  color,
                  0.14
                )}, ${hexToRgba(color, 0.035)})`,
            ...(isNeon
              ? { boxShadow: `0 0 10px 1px ${hexToRgba(color, 0.35)}` }
              : {}),
          }}
        />
      )}

      {/* Left color rail (filled card/soft styles only) */}
      {showRail && (
        <div
          className="absolute left-0 top-3 bottom-3 w-1 rounded-full"
          style={{ background: color }}
        />
      )}

      <div
        className={cn(
          "relative px-3.5",
          isLine ? "py-2" : "py-3",
          // Capsule needs extra side padding so content clears the 38px curve.
          showRail ? "pl-4" : isPill ? "pl-6 pr-6" : "pl-3.5",
          // Root: fill the node height and center its label both axes.
          isRoot && !isLine &&
            "flex flex-1 flex-col items-center justify-center text-center"
        )}
      >
        {/* Header: icon + type + status (root/plain hide the type label) */}
        {(!hideTypeHeader || statusConf) && (
          <div className="flex items-center gap-1.5 mb-1.5">
            {!hideTypeHeader && (
              <>
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-md"
                  style={{ background: hexToRgba(color, 0.16), color }}
                >
                  <Icon name={typeConf.icon} size={13} />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  {typeConf.label}
                </span>
              </>
            )}
            {statusConf && (
              <span
                className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                style={{
                  background: hexToRgba(statusConf.color, 0.14),
                  color: statusConf.color,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: statusConf.dot }}
                />
                {statusConf.label}
              </span>
            )}
          </div>
        )}

        {/* Label / inline editor */}
        {isEditing ? (
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              // A late blur fires when Tab has already moved editing to a new
              // child — committing again would close that editor.
              if (useMindMapStore.getState().editingNodeId === id) commitLabel();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitLabel();
              } else if (e.key === "Tab") {
                // Keep the typing flow going: save this node and immediately
                // start editing a fresh child. (addChildNode no longer
                // auto-edits, so opt in explicitly here.)
                e.preventDefault();
                commitLabel();
                const newId = addChildNode(id);
                if (newId) setEditingNode(newId);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditingNode(null);
              }
              e.stopPropagation();
            }}
            rows={2}
            placeholder="내용 입력…"
            style={{ fontSize: labelSize }}
            className={cn(
              "nodrag w-full resize-none rounded-lg bg-surface-base border border-brand/50 px-2 py-1 font-medium text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand/40",
              isRoot && "text-center"
            )}
          />
        ) : (
          <div
            style={{ fontSize: labelSize }}
            className={cn(
              "font-semibold leading-snug break-words",
              isRoot && "w-full text-center",
              d.label ? "text-ink" : "text-ink-faint font-normal italic"
            )}
          >
            {d.emoji && <span className="mr-1">{d.emoji}</span>}
            {d.label ? renderInlineMarkdown(d.label) : "내용 입력…"}
          </div>
        )}

        {d.description && !isEditing && (
          <p className="mt-1 text-[11px] leading-snug text-ink-soft line-clamp-2">
            {d.description}
          </p>
        )}

        {/* Cross-map navigation chips */}
        {(d.linkedDocId || d.backDocId) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.linkedDocId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openLinkedDoc(d.linkedDocId!);
                }}
                className="nodrag inline-flex items-center gap-1 rounded-full bg-brand/12 px-2 py-1 text-[11px] font-medium text-brand transition hover:bg-brand/20"
              >
                <MapIcon size={12} /> 맵 열기
              </button>
            )}
            {d.backDocId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openLinkedDoc(d.backDocId!, d.backNodeId);
                }}
                className="nodrag inline-flex items-center gap-1 rounded-full bg-surface-overlay px-2 py-1 text-[11px] font-medium text-ink-soft border border-line transition hover:text-ink"
              >
                <CornerUpLeft size={12} /> 상위 맵
              </button>
            )}
          </div>
        )}

        {/* Checklist progress (tasks) */}
        {checklistTotal > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[9px] text-ink-faint mb-1">
              <span>체크리스트</span>
              <span>
                {checklistDone}/{checklistTotal}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(checklistDone / checklistTotal) * 100}%`,
                  background: color,
                }}
              />
            </div>
          </div>
        )}

        {/* Tags */}
        {d.tags && d.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {d.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-surface-overlay px-1.5 py-0.5 text-[9px] font-medium text-ink-soft border border-line/60"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer: link. The href is clamped to safe schemes so a link opened
            from an untrusted share/import can't smuggle a javascript: URL. */}
        {safeLink && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-faint">
            <a
              href={safeLink}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="nodrag inline-flex items-center gap-0.5 text-brand hover:underline"
            >
              <ExternalLink size={10} /> 링크
            </a>
          </div>
        )}
      </div>

      {/* Collapse / expand toggle — kept unobtrusive so it blends into the
          map. Expanded nodes show only a faint chevron (brightens on hover);
          collapsed nodes keep it clearly visible so hidden branches can be
          re-opened. No border/background/shadow by default. */}
      {childCount > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse(id);
          }}
          aria-label={d.collapsed ? "펼치기" : "접기"}
          className={cn(
            "nodrag mf-node-affordance absolute top-1/2 -translate-y-1/2 z-10",
            // The capsule curve pulls the visual edge inward at mid-height.
            isPill ? "-right-1" : "-right-2.5",
            "flex h-5 w-5 items-center justify-center rounded-full transition",
            "text-ink-faint hover:bg-surface-raised hover:text-brand hover:shadow-sm",
            d.collapsed ? "opacity-90" : "opacity-25 group-hover:opacity-80"
          )}
        >
          <ChevronRight
            size={12}
            className={cn("transition-transform", !d.collapsed && "rotate-90")}
          />
        </button>
      )}
    </div>
  );
}

export const MindMapNode = memo(MindMapNodeComponent);
