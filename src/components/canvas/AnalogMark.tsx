"use client";
import { memo } from "react";
import {
  branchPaintPaths,
  hasBranchStyle,
  pigmentColor,
  hashSeed,
  isStroke,
  itemTransform,
  strokePath,
  texturePath,
  type InkItem,
} from "@/lib/ink";
import type { InkObject } from "@/types/mindmap";

// Original normalized motifs, made from basic SVG geometry; no image assets.
export function Stamp({ item: o }: { item: InkObject }) {
  const props = {
    stroke: o.color,
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: o.fill ? o.color : "none",
  };
  return (
    <g
      transform={`translate(${o.x - o.width / 2} ${o.y - o.height / 2}) scale(${o.width / 100} ${o.height / 100})`}
      {...props}
    >
      {o.shape === "circle" && <ellipse cx="50" cy="50" rx="44" ry="44" />}
      {o.shape === "box" && (
        <rect x="6" y="12" width="88" height="76" rx="14" />
      )}
      {o.shape === "arrow" && <path d="M6 42H66V18L96 50 66 82V58H6Z" />}
      {o.shape === "star" && (
        <path d="M50 5 62 35 95 38 70 60 78 93 50 76 22 93 30 60 5 38 38 35Z" />
      )}
      {o.shape === "heart" && (
        <path d="M50 88C-15 48 12 2 50 30C88 2 115 48 50 88Z" />
      )}
      {o.shape === "leaf" && (
        <>
          <path d="M12 88C-5 30 52 7 90 10C90 66 59 97 12 88Z" />
          <path d="M12 88 73 27M40 61 37 36M55 49 78 51" fill="none" />
        </>
      )}
      {o.shape === "bulb" && (
        <>
          <path d="M34 74C34 60 20 58 20 38A30 30 0 0 1 80 38C80 58 66 60 66 74Z" />
          <path
            d="M35 82H65M40 90H60M45 72V48L36 37M55 72V48L64 37M4 32H12M88 32H96M50 1V9M10 6 17 14M90 6 83 14"
            fill="none"
          />
        </>
      )}
      {o.shape === "book" && (
        <>
          <path d="M50 25C35 12 16 16 6 22V82C25 73 38 78 50 88C62 78 75 73 94 82V22C84 16 65 12 50 25Z" />
          <path
            d="M50 25V88M18 34Q30 30 40 38M18 48Q30 44 40 52M60 38Q70 30 82 34M60 52Q70 44 82 48"
            fill="none"
          />
        </>
      )}
      {o.shape === "sun" && (
        <>
          <circle cx="50" cy="50" r="26" />
          <path
            d="M50 2V14M50 86V98M2 50H14M86 50H98M16 16 25 25M75 75 84 84M16 84 25 75M75 25 84 16"
            fill="none"
          />
        </>
      )}
      {o.shape === "cloud" && (
        <path d="M22 78A20 20 0 0 1 17 39A26 26 0 0 1 66 27A19 19 0 0 1 89 50A16 16 0 0 1 81 78Z" />
      )}
    </g>
  );
}
export const AnalogMark = memo(function AnalogMark({
  item,
}: {
  item: InkItem;
}) {
  if (!isStroke(item))
    return (
      <g data-ink-object={item.id} transform={itemTransform(item)}>
        {item.kind === "stamp" ? (
          <Stamp item={item} />
        ) : (
          <text
            x={item.x}
            y={item.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Jua, sans-serif"
            fontSize={item.fontSize}
            fill={item.color}
            textLength={item.width}
            lengthAdjust="spacingAndGlyphs"
          >
            {item.text}
          </text>
        )}
      </g>
    );
  const brush = item.brush ?? "pen",
    d = strokePath(item),
    id = `texture-${hashSeed(item.id)}`,
    seed = item.seed ?? hashSeed(item.id);
  const hand = hasBranchStyle(item),
    feel = item.texture ?? 0.45;
  const opacity =
    (item.opacity ?? 1) *
    (brush === "highlighter" ? 0.27 : brush === "marker" ? 0.86 : 1);
  return (
    <g
      data-ink-stroke={item.id}
      data-brush={brush}
      data-branch-style={hand ? "hand-v1" : undefined}
      transform={itemTransform(item)}
      opacity={opacity}
    >
      {(brush === "pencil" || brush === "marker") && (
        <defs>
          <pattern id={id} patternUnits="userSpaceOnUse" width="24" height="24">
            <path
              d={texturePath(seed)}
              fill="none"
              stroke={brush === "marker" ? "#ffffff" : item.color}
              strokeWidth={brush === "pencil" ? 0.55 : 1.3}
              opacity={brush === "pencil" ? 0.72 : 0.16}
            />
          </pattern>
        </defs>
      )}
      <path
        d={d}
        fill={item.color}
        opacity={
          hand
            ? 0.98 - feel * 0.035
            : brush === "pencil"
              ? 0.2 + (1 - (item.texture ?? 0.7)) * 0.35
              : 1
        }
        fillRule="nonzero"
      />
      {hand && (
        <path
          d={branchPaintPaths(item).pigment}
          fill={pigmentColor(item.color)}
          opacity={feel * 0.12}
        />
      )}
      {hand && (
        <path
          data-branch-fibers
          d={branchPaintPaths(item).fibers}
          fill="none"
          stroke="#ffffff"
          strokeWidth={0.55}
          strokeLinecap="round"
          opacity={feel * 0.35}
        />
      )}
      {(brush === "pencil" || brush === "marker") && (
        <path d={d} fill={`url(#${id})`} />
      )}
    </g>
  );
});
