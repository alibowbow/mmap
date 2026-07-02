"use client";

import { useMemo } from "react";

import { Modal } from "@/components/ui/Modal";
import { NODE_STATUS_CONFIG } from "@/lib/constants";
import { computeDepths } from "@/lib/tree";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNodeStatus } from "@/types/mindmap";

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-base px-3 py-2.5 text-center">
      <p className="text-lg font-bold tabular-nums text-ink">{value}</p>
      <p className="text-[11px] text-ink-faint">{label}</p>
    </div>
  );
}

// Lightweight per-document analytics computed on open.
export function StatsDialog() {
  const open = useMindMapStore((s) => s.dialog === "stats");
  const setDialog = useMindMapStore((s) => s.setDialog);
  const nodes = useMindMapStore((s) => s.nodes);
  const relations = useMindMapStore((s) => s.relations);

  const stats = useMemo(() => {
    if (!open) return null;
    const depths = computeDepths(nodes);
    const maxDepth = nodes.length
      ? Math.max(...[...depths.values()])
      : 0;
    const statusCount: Record<string, number> = {};
    let checklistDone = 0;
    let checklistTotal = 0;
    let words = 0;
    const tagCount = new Map<string, number>();
    for (const n of nodes) {
      const st = n.data.status ?? "none";
      if (st !== "none") statusCount[st] = (statusCount[st] ?? 0) + 1;
      for (const c of n.data.checklist ?? []) {
        checklistTotal += 1;
        if (c.checked) checklistDone += 1;
      }
      words += n.data.label.trim().split(/\s+/).filter(Boolean).length;
      for (const t of n.data.tags ?? []) {
        tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      }
    }
    const doneTasks = statusCount["done"] ?? 0;
    const trackedTasks = Object.values(statusCount).reduce((a, b) => a + b, 0);
    const topTags = [...tagCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return {
      total: nodes.length,
      maxDepth,
      statusCount,
      checklistDone,
      checklistTotal,
      words,
      topTags,
      doneTasks,
      trackedTasks,
      relationCount: relations.length,
    };
  }, [open, nodes, relations]);

  if (!stats) {
    return (
      <Modal open={open} onClose={() => setDialog(null)} title="문서 통계">
        <div />
      </Modal>
    );
  }

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <Modal
      open={open}
      onClose={() => setDialog(null)}
      title="문서 통계"
      description="이 맵의 현재 진행 상황을 한눈에 확인하세요."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-2">
          <StatTile value={stats.total} label="노드" />
          <StatTile value={stats.maxDepth} label="최대 깊이" />
          <StatTile value={stats.relationCount} label="관계선" />
          <StatTile value={stats.words} label="단어" />
        </div>

        {/* Task status distribution */}
        {stats.trackedTasks > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-ink-soft">작업 상태</p>
              <p className="text-[11px] tabular-nums text-ink-faint">
                완료 {pct(stats.doneTasks, stats.trackedTasks)}%
              </p>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              {(Object.keys(stats.statusCount) as MindMapNodeStatus[]).map(
                (st) => (
                  <div
                    key={st}
                    style={{
                      width: `${pct(stats.statusCount[st], stats.trackedTasks)}%`,
                      background: NODE_STATUS_CONFIG[st]?.color ?? "#94a3b8",
                    }}
                  />
                )
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {(Object.keys(stats.statusCount) as MindMapNodeStatus[]).map(
                (st) => (
                  <span
                    key={st}
                    className="inline-flex items-center gap-1 text-[11px] text-ink-soft"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        background: NODE_STATUS_CONFIG[st]?.color ?? "#94a3b8",
                      }}
                    />
                    {NODE_STATUS_CONFIG[st]?.label ?? st}{" "}
                    {stats.statusCount[st]}
                  </span>
                )
              )}
            </div>
          </div>
        )}

        {/* Checklist completion */}
        {stats.checklistTotal > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-ink-soft">체크리스트</p>
              <p className="text-[11px] tabular-nums text-ink-faint">
                {stats.checklistDone}/{stats.checklistTotal} (
                {pct(stats.checklistDone, stats.checklistTotal)}%)
              </p>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${pct(stats.checklistDone, stats.checklistTotal)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Top tags */}
        {stats.topTags.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-ink-soft">
              자주 쓴 태그
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stats.topTags.map(([tag, count]) => (
                <span
                  key={tag}
                  className="rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand"
                >
                  #{tag} <span className="tabular-nums">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {stats.trackedTasks === 0 &&
          stats.checklistTotal === 0 &&
          stats.topTags.length === 0 && (
            <p className="rounded-xl bg-surface-base px-3 py-4 text-center text-xs text-ink-faint">
              노드에 상태·체크리스트·태그를 추가하면 진행 현황이 여기에
              표시됩니다.
            </p>
          )}
      </div>
    </Modal>
  );
}
