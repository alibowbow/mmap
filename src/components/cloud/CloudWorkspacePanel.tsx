"use client";

import { Cloud, CloudOff, Copy, ExternalLink, FolderOpen, Link2, Loader2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { CloudWorkspace } from "@/hooks/useCloudWorkspace";
import type { CloudSaveStatus } from "@/lib/cloudSync";

const labels: Record<CloudSaveStatus, string> = {
  saved: "클라우드 저장됨", pending: "클라우드 저장 대기", saving: "클라우드 저장 중…",
  offline: "오프라인 · 저장 대기", error: "클라우드 저장 실패", conflict: "충돌 · 선택 필요",
};

export function CloudWorkspacePanel({ cloud }: { cloud: CloudWorkspace }) {
  const [open, setOpen] = useState(false);
  type Confirmation = "copy" | "latest" | "rotate" | "revoke" | "delete";
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const confirmationTarget = useRef<{ ownerId: string | null; documentId: string | null; recordId: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const entry = cloud.activeEntry;
  const status = entry?.status;
  const link = entry ? cloud.shareLinks[entry.record.id] : undefined;
  const attention = status === "error" || status === "conflict" || status === "offline";
  const title = status ? labels[status] : cloud.workspaceOwnerId ? "이 계정의 브라우저 보관 문서" : "로컬 문서 · 이 브라우저에 저장";

  useEffect(() => {
    setConfirmation(null);
    confirmationTarget.current = null;
    setCopied(false);
    setCopyError(false);
  }, [cloud.session?.user.id, cloud.activeDocument?.id, entry?.record.id, link]);

  function ask(choice: Confirmation) {
    confirmationTarget.current = {
      ownerId: cloud.session?.user.id ?? null,
      documentId: cloud.activeDocument?.id ?? null,
      recordId: entry?.record.id ?? null,
    };
    setConfirmation(choice);
  }

  async function confirm() {
    const choice = confirmation;
    const target = confirmationTarget.current;
    setConfirmation(null);
    confirmationTarget.current = null;
    if (!target || target.ownerId !== (cloud.session?.user.id ?? null) ||
      target.documentId !== (cloud.activeDocument?.id ?? null) ||
      target.recordId !== (entry?.record.id ?? null)) return;
    if (choice === "copy") await cloud.copySelected();
    else if (entry && choice === "latest") await cloud.resolveConflict("latest", entry.record.id);
    else if (entry && (choice === "rotate" || choice === "revoke")) await cloud.share(entry.record.id, choice);
    else if (entry && choice === "delete") await cloud.deleteDocument(entry.record.id);
  }

  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }

  return (
    <>
      <div className="fixed right-3 top-[4.25rem] z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-2xl border border-line bg-surface-raised/95 p-1.5 shadow-float backdrop-blur md:bottom-4 md:right-4 md:top-auto" data-cloud-status={status ?? "local"}>
        <button onClick={() => { setOpen(true); setConfirmation(null); }} className="flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium text-ink hover:bg-surface-overlay" aria-label={`계정 및 클라우드 문서 열기 · ${title}`} title={`계정 및 클라우드 · ${title}`}>
          {status === "saving" ? <Loader2 size={16} className="animate-spin" /> : attention ? <CloudOff size={16} className="text-amber-600" /> : <Cloud size={16} className="text-brand" />}
          <span className="sr-only md:not-sr-only" aria-live="polite">{entry ? title : cloud.session ? "내 클라우드" : "Google로 계속하기"}</span>
        </button>
        {cloud.workspaceOwnerId && <button className="hidden min-h-10 rounded-xl border-l border-line px-3 text-xs text-ink-soft hover:bg-surface-overlay md:block" onClick={cloud.returnLocal}>로컬로</button>}
      </div>

      <Modal open={open} onClose={() => { setOpen(false); setConfirmation(null); }} title="계정 및 클라우드" description="선택한 문서만 클라우드로 복사하고, 여러 기기에서 이어서 편집하세요." fullScreenOnMobile className="sm:max-w-xl">
        <div className="space-y-5">
          {cloud.error && <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{cloud.error}</p>}
          {!cloud.ready ? <p className="text-sm text-ink-soft">로그인 상태를 확인하는 중…</p> : !cloud.session ? (
            <section className="space-y-3 rounded-2xl border border-line p-4">
              <h3 className="text-sm font-semibold">Google 계정으로 시작하기</h3>
              <p className="text-sm leading-relaxed text-ink-soft">처음 계속하면 계정이 만들어집니다. 다음부터는 같은 Google 계정으로 로그인하세요. 기존 로컬 문서는 자동으로 업로드되지 않습니다.</p>
              <Button variant="primary" className="w-full" disabled={!cloud.configured || cloud.busy} onClick={() => void cloud.login()}>
                {cloud.busy && <Loader2 size={16} className="animate-spin" />} Google로 계속하기
              </Button>
              {!cloud.configured && <p className="text-xs leading-relaxed text-ink-soft">클라우드 연결을 준비 중입니다. 지금은 로그인 없이 로컬 편집과 JSON 내보내기를 사용할 수 있습니다.</p>}
            </section>
          ) : (
            <>
              <section className="flex items-center justify-between gap-3 rounded-2xl bg-surface-overlay p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{cloud.session.user.email ?? "Google 계정"}</p>
                  <p className="mt-1 text-xs text-ink-soft">내 문서는 나만 편집할 수 있습니다.</p>
                </div>
                <Button size="sm" disabled={cloud.busy} onClick={() => void cloud.logout()}><LogOut size={14} /> 로그아웃</Button>
              </section>

              {cloud.recovery && <section className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4" aria-label="저장 대기 내용 선택">
                <h3 className="text-sm font-semibold">저장 대기 내용이 있습니다</h3>
                <p className="text-xs leading-relaxed text-ink-soft">복구할 내용을 직접 선택해 주세요. 다른 탭의 변경은 지우지 않습니다. 서버 버전과 다르면 자동 저장을 멈추고 사본 저장을 선택할 수 있습니다.</p>
                <ul className="space-y-2">{cloud.recovery.drafts.map(draft => <li key={`${draft.writerId}:${draft.writeId}`} className="rounded-xl border border-line bg-surface-raised p-3">
                  <p className="text-sm font-medium">{draft.document.title}</p>
                  <p className="mt-1 text-xs text-ink-soft">{new Date(draft.savedAt).toLocaleString("ko-KR")} · {draft.browserOnly ? "브라우저 전용 · 자동 업로드 없음" : `v${draft.expectedRevision}`} · 탭 {draft.writerId.slice(0, 8)}</p>
                  <Button size="sm" className="mt-2" onClick={() => cloud.recoverPending(draft)} aria-label={`저장 대기 내용 복구 · ${draft.document.title} · ${draft.writerId.slice(0, 8)}`}>저장 대기 내용 복구</Button>
                </li>)}</ul>
                <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => cloud.recoverPending(null)}>서버 최신본 열기</Button><Button size="sm" variant="ghost" onClick={cloud.cancelRecovery}>취소</Button></div>
                <p className="text-xs text-ink-soft">서버 최신본을 열어도 복구용 내용은 보관됩니다.</p>
              </section>}

              <section className="space-y-3 rounded-2xl border border-line p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-ink-soft"><FolderOpen size={14} /> 현재 문서</div>
                <h3 className="break-words text-base font-semibold">{cloud.activeDocument?.title ?? "문서를 선택해 주세요"}</h3>
                <p className={`text-sm ${attention ? "text-amber-600 dark:text-amber-300" : "text-ink-soft"}`} role="status">{title}</p>
                {entry ? (
                  <>
                    {entry.error && <p className="text-xs leading-relaxed text-ink-soft">{entry.error}</p>}
                    {!entry.recoveryAvailable && <p role="alert" className="rounded-lg bg-red-500/10 p-2 text-xs text-red-600">브라우저 복구 저장 공간이 부족합니다. 이 창을 닫기 전에 JSON으로 내보내세요.</p>}
                    {status === "conflict" ? (
                      <div className="space-y-2">
                        <p className="text-xs leading-relaxed text-ink-soft">서버 문서를 덮어쓰지 않습니다. 내 변경을 새 사본으로 보관하거나 최신본을 선택해 주세요.</p>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="primary" disabled={cloud.busy} onClick={() => void cloud.resolveConflict("copy", entry.record.id)}>내 변경을 새 사본으로 저장</Button>
                          <Button size="sm" disabled={cloud.busy} onClick={() => ask("latest")}>서버 최신본 불러오기</Button>
                        </div>
                      </div>
                    ) : (status === "error" || status === "offline" || status === "pending") && (
                      <Button size="sm" onClick={cloud.retry} disabled={cloud.busy}><RefreshCw size={14} /> 저장 다시 시도</Button>
                    )}
                    <div className="border-t border-line pt-3">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Link2 size={15} /> 읽기 전용 공유</div>
                      <p className="mb-3 text-xs leading-relaxed text-ink-soft">링크를 가진 누구나 로그인 없이 최신 저장본을 읽을 수 있습니다. 받는 사람은 원본을 편집할 수 없습니다. 공개해도 되는 내용인지 확인해 주세요.</p>
                      {entry.record.shareEnabled ? (
                        <div className="space-y-3">
                          <p className="text-xs text-emerald-700 dark:text-emerald-300">공유 켜짐 · 같은 링크에 최신 저장 내용이 표시됩니다.</p>
                          {link ? <>
                            <label className="block text-xs text-ink-soft">공유 링크<input aria-label="읽기 전용 공유 링크" className="mt-1 w-full rounded-lg border border-line bg-surface-base p-2 text-xs text-ink" readOnly value={link} onFocus={e => e.target.select()} /></label>
                            <div className="flex gap-2"><Button size="sm" onClick={() => void copyLink()}><Copy size={13} />{copied ? "복사됨" : "링크 복사"}</Button><a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs text-ink-soft hover:bg-surface-overlay">미리 보기 <ExternalLink size={12} /></a></div>
                            {copyError && <p className="text-xs text-amber-600">링크를 자동 복사하지 못했습니다. 위 주소를 선택해 복사해 주세요.</p>}
                          </> : <p className="text-xs leading-relaxed text-ink-soft">기존 링크는 계속 유효합니다. 보안을 위해 링크 원문은 다시 불러올 수 없습니다. 잃어버렸다면 새 링크를 발급해 주세요.</p>}
                          <div className="flex flex-wrap gap-2"><Button size="sm" disabled={cloud.busy} onClick={() => ask("rotate")}>새 링크 발급</Button><Button size="sm" disabled={cloud.busy} onClick={() => ask("revoke")}>공유 끄기</Button></div>
                        </div>
                      ) : <Button size="sm" disabled={cloud.busy || status === "conflict"} onClick={() => { setCopied(false); void cloud.share(entry.record.id, "enable"); }}><ShieldCheck size={14} /> 읽기 전용 링크 만들기</Button>}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs leading-relaxed text-ink-soft">선택한 문서 1개의 사본만 업로드합니다. 로컬 원본은 이 브라우저에 그대로 남습니다.</p>
                    <Button variant="primary" size="sm" disabled={cloud.busy || !cloud.activeDocument} onClick={() => ask("copy")}><Cloud size={14} /> 선택한 문서를 클라우드로 복사</Button>
                  </>
                )}
                {entry && <Button size="sm" disabled={cloud.busy} onClick={() => ask("delete")}>클라우드 문서 삭제</Button>}
                {cloud.workspaceOwnerId && <Button size="sm" onClick={() => { cloud.returnLocal(); setConfirmation(null); }}>이 브라우저의 로컬 문서로 돌아가기</Button>}
              </section>

              {confirmation && <section role="alert" className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-sm">{confirmation === "copy" ? `“${cloud.activeDocument?.title}” 한 개를 현재 Google 계정의 클라우드에 복사할까요?` : confirmation === "latest" ? "현재 탭의 변경을 버리고 서버 최신본을 불러올까요? 현재 탭과 선택해 복구한 내용만 삭제되고 다른 탭의 변경은 유지됩니다." : confirmation === "rotate" ? "새 링크를 발급하면 이전 공유 링크가 즉시 작동하지 않습니다. 계속할까요?" : confirmation === "delete" ? "이 클라우드 문서와 공유 링크를 삭제할까요? 로컬 원본은 유지됩니다." : "공유를 끄면 현재 공유 링크로 문서를 열 수 없습니다. 계속할까요?"}</p>
                <div className="flex gap-2"><Button size="sm" variant="primary" disabled={cloud.busy} onClick={() => void confirm()}>확인</Button><Button size="sm" onClick={() => setConfirmation(null)}>취소</Button></div>
              </section>}

              {cloud.browserDrafts.length > 0 && <section className="space-y-3" aria-label="브라우저 복구 문서">
                <h3 className="text-sm font-semibold">브라우저 복구 문서</h3>
                <p className="text-xs leading-relaxed text-ink-soft">서버에서 삭제됐거나 아직 저장하지 못한 내용도 여기서 열 수 있습니다. 이 계정의 브라우저 사본으로 열며 자동 업로드하지 않습니다.</p>
                <ul className="space-y-2">{cloud.browserDrafts.map(draft => <li key={`${draft.recordId}:${draft.writerId}:${draft.writeId}`}>
                  <button className="w-full rounded-xl border border-line p-3 text-left hover:bg-surface-overlay" onClick={() => cloud.openBrowserDraft(draft)} aria-label={`브라우저 복구 문서 열기 · ${draft.document.title} · ${draft.writerId.slice(0, 8)}`}>
                    <span className="block truncate text-sm font-medium">{draft.document.title}</span>
                    <span className="mt-1 block text-xs text-ink-soft">{new Date(draft.savedAt).toLocaleString("ko-KR")} · {draft.browserOnly ? "브라우저 전용 · 자동 업로드 없음" : `v${draft.expectedRevision}`}</span>
                  </button>
                </li>)}</ul>
              </section>}

              <section className="space-y-3">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">내 클라우드 문서</h3><Button size="sm" variant="ghost" disabled={cloud.busy} onClick={() => void cloud.refresh()}><RefreshCw size={14} className={cloud.busy ? "animate-spin" : ""} />새로고침</Button></div>
                {!cloud.documents.length ? <p className="rounded-xl bg-surface-overlay p-4 text-sm text-ink-soft">{cloud.busy ? "문서를 불러오는 중…" : "아직 클라우드 문서가 없습니다. 위에서 문서를 선택해 복사하세요."}</p> : <ul className="space-y-2">{cloud.documents.map(document => <li key={document.id}><button className="flex w-full items-center justify-between gap-3 rounded-xl border border-line p-3 text-left hover:bg-surface-overlay disabled:opacity-50" aria-label={`클라우드 문서 열기 · ${document.title}`} onClick={async () => { setConfirmation(null); await cloud.openDocument(document.id); }}><span className="min-w-0"><span className="block truncate text-sm font-medium">{document.title}</span><span className="mt-1 block text-xs text-ink-faint">{new Date(document.updatedAt).toLocaleString("ko-KR")} · v{document.revision}{document.shareEnabled ? " · 링크 공유 중" : " · 비공개"}</span></span><FolderOpen size={16} className="shrink-0 text-ink-soft" /></button></li>)}</ul>}
              </section>
            </>
          )}
          <p className="text-[11px] leading-relaxed text-ink-faint">로그아웃하면 로컬 문서 화면으로 돌아갑니다. 클라우드 복구용 사본은 계정별로 이 브라우저에 보관됩니다. 공용 기기에서는 사용 후 브라우저 데이터를 삭제해 주세요.</p>
        </div>
      </Modal>
    </>
  );
}
