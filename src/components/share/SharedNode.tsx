"use client";

import { memo, type CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { ChevronRight, ExternalLink, Info } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { fontSizeForDepth, NODE_STATUS_CONFIG, NODE_TYPE_CONFIG, NODE_WIDTH, NODE_HEIGHT } from "@/lib/constants";
import { buzanWordPad } from "@/lib/buzanBranch";
import { renderInlineMarkdown } from "@/lib/inlineMarkdown";
import { useViewer } from "./ViewerContext";
import { safeViewerHref, type ViewerNode } from "./viewer-model";

const rgba = (hex: string, alpha: number) => {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "64748b";
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
};
const styles = new Set(["card", "soft", "outline", "line", "pill", "sticky", "neon"]);
const faces = [Position.Left, Position.Right, Position.Top, Position.Bottom];

export const SharedNode = memo(function SharedNode({ id, data: d }: NodeProps<ViewerNode>) {
  const { appearance, toggleCollapse, inspectNode } = useViewer();
  const requested = d.style ?? appearance.nodeStyle;
  const style = styles.has(requested) ? requested : "card";
  const isRoot = !!d.isRoot || d.type === "root";
  const isLine = style === "line";
  const buzan = isLine && appearance.edgeStyle === "taper";
  const color = d._viewerColor;
  const config = NODE_TYPE_CONFIG[d.type];
  const status = d.status && d.status !== "none" ? NODE_STATUS_CONFIG[d.status] : null;
  const hideType = d.type === "plain" || isRoot || ["line", "pill", "sticky"].includes(style);
  const rail = style === "card" || style === "soft";
  const href = safeViewerHref(d.link);
  const total = d.checklist?.length ?? 0;
  const done = d.checklist?.filter((c) => c.checked).length ?? 0;
  const childCount = d._childCount ?? 0;
  let tilt = 0;
  if (style === "sticky" && !isRoot) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    tilt = [-1.4, -0.7, 0, 0.7, 1.4][Math.abs(hash) % 5];
  }
  const fills = rail || ["pill", "sticky", "neon"].includes(style);
  return (
    <div
      data-shared-node={id}
      data-node-style={style}
      data-search-match={d._viewerMatch || undefined}
      className={`shared-node shared-node-${style}${isRoot ? " shared-node-root" : ""}${buzan ? " shared-node-buzan" : ""}`}
      style={{
        "--node-color": color,
        width: isLine ? undefined : NODE_WIDTH,
        minHeight: isLine ? (isRoot ? 64 : undefined) : NODE_HEIGHT,
        borderColor: ["outline", "line", "neon"].includes(style) || (d._depth === 1 && style === "card") ? color : undefined,
        rotate: tilt ? `${tilt}deg` : undefined,
      } as CSSProperties}
    >
      {faces.flatMap((face) => [
        <Handle key={`${face}-source`} id={`${face}-source`} type="source" position={face} isConnectable={false} />,
        <Handle key={`${face}-target`} id={`${face}-target`} type="target" position={face} isConnectable={false} />,
      ])}
      {(isRoot || fills) && <div className="shared-node-fill" style={{
        background: isRoot ? `linear-gradient(135deg, ${rgba(color, .16)}, ${rgba(color, .02)})`
          : style === "sticky" ? rgba(color, .3)
          : style === "neon" ? rgba(color, .07)
          : appearance.nodeTint ? rgba(color, .22)
          : `linear-gradient(135deg, ${rgba(color, .11)}, ${rgba(color, .015)} 70%)`,
        boxShadow: style === "neon" ? `0 0 10px 1px ${rgba(color, .35)}` : undefined,
      }} />}
      {rail && <div className="shared-node-rail" style={{ background: color }} />}
      <div className={`shared-node-content${rail ? " shared-node-railed" : ""}`} style={
        buzan && !isRoot ? { paddingBottom: buzanWordPad(d._depth ?? 1, appearance.edgeWidth) } : undefined
      }>
        {(!hideType || (status && !isLine)) && <div className="shared-node-meta">
          {!hideType && <><span className="shared-node-icon" style={{ background: rgba(color, .14), color }}><Icon name={config.icon} size={12} /></span><span>{config.label}</span></>}
          {status && <span className="shared-node-status" style={{ background: rgba(status.color, .14) }}><i style={{ background: status.dot }} />{status.label}</span>}
        </div>}
        <div className="shared-node-label" style={{ fontSize: fontSizeForDepth(appearance.levelFontSizes, d._depth ?? 0), fontWeight: isRoot ? 700 : d._depth === 1 ? 600 : 500 }}>
          {isLine && status && <i className="shared-inline-status" title={status.label} aria-label={status.label} style={{ background: status.dot }} />}
          {d.emoji && <span>{d.emoji} </span>}{d.label ? renderInlineMarkdown(d.label) : <span className="shared-muted">내용 없음</span>}
        </div>
        {d.description && <p className="shared-node-description">{d.description}</p>}
        {total > 0 && <div className="shared-check-progress" aria-label={`체크리스트 ${total}개 중 ${done}개 완료`}>
          <span>체크리스트 <b>{done}/{total}</b></span><div><i style={{ width: `${done / total * 100}%`, background: color }} /></div>
        </div>}
        {!!d.tags?.length && <div className="shared-node-tags">{d.tags.slice(0, 4).map((tag, i) => <span key={i}>#{tag}</span>)}</div>}
        {href && <div className="shared-node-footer">
          <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="nodrag nopan" onClick={(e) => e.stopPropagation()}><ExternalLink size={11} aria-hidden /> 링크</a>
        </div>}
      </div>
      {(d.description || total > 0 || (d.tags?.length ?? 0) > 4) && <button type="button" className="shared-node-inspect nodrag nopan" onClick={() => inspectNode(id)} aria-label={`${d.label || "노드"} 내용 보기`} title="전체 내용 보기"><Info size={13} aria-hidden /></button>}
      {childCount > 0 && <button
        type="button"
        className="shared-collapse nodrag nopan"
        onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }}
        aria-label={`${d.label || "노드"} 가지 ${d.collapsed ? "펼치기" : "접기"}`}
        aria-expanded={!d.collapsed}
        title={`${childCount}개 가지 ${d.collapsed ? "펼치기" : "접기"}`}
      ><ChevronRight size={15} aria-hidden style={{ transform: d.collapsed ? undefined : "rotate(90deg)" }} /></button>}
    </div>
  );
});
