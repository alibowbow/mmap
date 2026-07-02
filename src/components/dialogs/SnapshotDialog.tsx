"use client";

import { Camera, History, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  selectActiveDocument,
  useMindMapStore,
} from "@/store/mindMapStore";

// Local version history: save the current map state and restore it later.
export function SnapshotDialog() {
  const open = useMindMapStore((s) => s.dialog === "snapshots");
  const setDialog = useMindMapStore((s) => s.setDialog);
  const doc = useMindMapStore(selectActiveDocument);
  const saveSnapshot = useMindMapStore((s) => s.saveSnapshot);
  const restoreSnapshot = useMindMapStore((s) => s.restoreSnapshot);
  const deleteSnapshot = useMindMapStore((s) => s.deleteSnapshot);

  const snapshots = doc?.snapshots ?? [];

  return (
    <Modal
      open={open}
      onClose={() => setDialog(null)}
      title="스냅샷"
      description="현재 맵의 상태를 저장해 두고 언제든 복원하세요. (문서당 최근 5개)"
    >
      <div className="space-y-3">
        <Button
          variant="primary"
          className="w-full justify-center"
          onClick={saveSnapshot}
        >
          <Camera size={15} /> 현재 상태 저장
        </Button>

        {snapshots.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <History size={28} className="text-ink-faint" />
            <p className="text-sm text-ink-faint">
              아직 저장된 스냅샷이 없습니다
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <History size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {snap.label}
                  </p>
                  <p className="text-[11px] text-ink-faint">
                    노드 {snap.nodes.length}개
                    {snap.relations?.length
                      ? ` · 관계선 ${snap.relations.length}개`
                      : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => restoreSnapshot(snap.id)}
                  aria-label="스냅샷 복원"
                >
                  <RotateCcw size={13} /> 복원
                </Button>
                <button
                  onClick={() => deleteSnapshot(snap.id)}
                  aria-label="스냅샷 삭제"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
