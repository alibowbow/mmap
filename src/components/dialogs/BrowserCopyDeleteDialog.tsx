"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useMindMapStore } from "@/store/mindMapStore";

export type BrowserCopyDeleteTarget = { id: string; title: string; ownerId: string };

// Account workspaces also contain recovery-only copies. The document list
// cannot infer whether a corresponding server record exists, so its delete
// action always names the browser copy and uses only the existing local action.
export function BrowserCopyDeleteDialog({ target, onClose }: {
  target: BrowserCopyDeleteTarget | null;
  onClose: () => void;
}) {
  const ownerId = useMindMapStore((s) => s.workspaceOwnerId);
  const exists = useMindMapStore((s) => !!target && s.documents.some((doc) => doc.id === target.id));
  const current = !!target && target.ownerId === ownerId && exists;
  useEffect(() => {
    if (target && !current) onClose();
  }, [target, current, onClose]);

  const removeCopy = () => {
    const state = useMindMapStore.getState();
    if (!target || target.ownerId !== state.workspaceOwnerId ||
      !state.documents.some((doc) => doc.id === target.id)) {
      onClose();
      return;
    }
    onClose();
    state.deleteDocument(target.id);
  };

  return <Modal
    open={current}
    onClose={onClose}
    title="브라우저 사본 삭제"
    footer={<><Button onClick={onClose}>취소</Button><Button variant="danger" onClick={removeCopy}>브라우저 사본 삭제</Button></>}
  >
    <p className="text-sm leading-relaxed text-ink">이 브라우저에 보관한 “{target?.title}” 사본을 삭제할까요?</p>
    <p className="mt-3 text-sm leading-relaxed text-ink-soft">클라우드에 저장된 문서와 공유 링크는 유지됩니다.</p>
    <p className="mt-3 text-xs leading-relaxed text-ink-faint">클라우드 문서와 공유 링크도 삭제하려면 ‘계정 및 클라우드’에서 해당 문서를 열고 ‘클라우드 문서 삭제’를 선택하세요.</p>
  </Modal>;
}
