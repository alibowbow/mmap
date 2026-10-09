"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { cloudConfigured, cloudDocumentPayload, cloudRequest, CloudError, getCloudClient, type CloudDocumentRecord, type CloudDocumentSummary } from "@/lib/cloudClient";
import { CloudSaveQueue, documentFingerprint, listOwnerPendingCloudSaves, listPendingCloudSaves, type PendingCloudSave } from "@/lib/cloudSync";
import { useMindMapStore } from "@/store/mindMapStore";
import { createId } from "@/lib/id";

type RecoveryChoice = { record: CloudDocumentRecord; drafts: PendingCloudSave[] };
const draftKey = (draft: PendingCloudSave) => JSON.stringify([draft.ownerId, draft.recordId, draft.writerId, draft.writeId]);

export function useCloudWorkspace(onOpen: (documentId: string) => void, onLocal: () => void) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [documents, setDocuments] = useState<CloudDocumentSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({});
  const [recovery, setRecovery] = useState<RecoveryChoice | null>(null);
  const queue = useRef<CloudSaveQueue | null>(null);
  const owner = useRef<string | null>(null);
  const generation = useRef(0);
  const navigation = useRef(0);
  const authEvents = useRef(0);
  const activeRequests = useRef(0);
  const requests = useRef(new AbortController());
  // Storage can fail. Retain these drafts in this tab across logout/account
  // changes as well as on disk; only the matching account may recover them.
  const volatileDrafts = useRef(new Map<string, PendingCloudSave[]>());
  const browserRecovery = useRef<{ documentId: string; draft: PendingCloudSave } | null>(null);
  const suppressChanges = useRef(false);
  const onOpenRef = useRef(onOpen);
  const onLocalRef = useRef(onLocal);
  onOpenRef.current = onOpen;
  onLocalRef.current = onLocal;
  const activeDocumentId = useMindMapStore(s => s.activeDocumentId);
  const workspaceOwnerId = useMindMapStore(s => s.workspaceOwnerId);
  const activeDocument = useMindMapStore(s => s.documents.find(d => d.id === s.activeDocumentId));

  const retainDrafts = useCallback(() => {
    const userId = owner.current;
    if (!userId || !queue.current) return;
    const drafts = [...(volatileDrafts.current.get(userId) ?? []), ...queue.current.getPendingSnapshots()];
    volatileDrafts.current.set(userId, [...new Map(drafts.map(draft => [draftKey(draft), draft])).values()]);
  }, []);

  const resetSession = useCallback((next: Session | null) => {
    const nextOwner = next?.user.id ?? null;
    if (nextOwner !== owner.current) {
      retainDrafts();
      generation.current += 1;
      navigation.current += 1;
      queue.current?.dispose();
      queue.current = null;
      requests.current.abort();
      requests.current = new AbortController();
      owner.current = nextOwner;
      activeRequests.current = 0;
      setDocuments([]);
      setShareLinks({});
      setRecovery(null);
      browserRecovery.current = null;
      setBusy(false);
      setError(null);
      if (useMindMapStore.getState().workspaceOwnerId) {
        useMindMapStore.getState().switchWorkspaceOwner(null);
        onLocalRef.current();
      }
      if (nextOwner) {
        const expectedGeneration = generation.current;
        queue.current = new CloudSaveQueue({
          ownerId: nextOwner,
          save: async (id, expectedRevision, document, signal) => {
            const result = await cloudRequest<{ record: CloudDocumentRecord }>(nextOwner, "documents", {
              action: "save", id, expectedRevision, document: cloudDocumentPayload(document),
            }, signal);
            return result.record;
          },
          onChange: () => {
            if (generation.current === expectedGeneration) setVersion(v => v + 1);
          },
          onDraftCleared: draft => {
            const old = volatileDrafts.current.get(draft.ownerId) ?? [];
            volatileDrafts.current.set(draft.ownerId, old.filter(value => draftKey(value) !== draftKey(draft)));
          },
          onSessionExpired: () => {
            if (generation.current !== expectedGeneration) return;
            resetSession(null);
            setError("로그인이 만료되어 로컬 문서로 돌아왔습니다. 저장 대기 내용은 같은 계정으로 다시 로그인한 뒤 복구할 수 있습니다.");
          },
        });
      }
    }
    setSession(next);
    setReady(true);
  }, [retainDrafts]);

  useEffect(() => {
    const client = getCloudClient();
    if (!client) { setReady(true); return; }
    let mounted = true;
    const initialEvent = authEvents.current;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => {
      authEvents.current += 1;
      if (mounted) resetSession(next);
    });
    void client.auth.getSession().then(({ data, error: authError }) => {
      if (!mounted) return;
      // A later sign-out/account event must beat an earlier session read.
      if (authEvents.current === initialEvent) {
        resetSession(authError ? null : data.session);
        if (authError) setError("로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.");
      }
      const url = new URL(window.location.href);
      if (url.searchParams.has("code") || url.searchParams.has("error")) {
        if (url.searchParams.has("error")) setError("Google 로그인을 완료하지 못했습니다. 다시 시도해 주세요.");
        for (const key of ["code", "error", "error_description", "error_code"]) url.searchParams.delete(key);
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }).catch(() => {
      if (mounted && authEvents.current === initialEvent) {
        setReady(true);
        setError("로그인 상태를 확인할 수 없습니다.");
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
      retainDrafts();
      queue.current?.dispose();
      queue.current = null;
      requests.current.abort();
      owner.current = null;
      generation.current += 1;
      navigation.current += 1;
    };
  }, [resetSession, retainDrafts]);

  useEffect(() => useMindMapStore.subscribe((state, before) => {
    if (!suppressChanges.current && state.activeDocumentId !== before.activeDocumentId) {
      navigation.current += 1;
      setRecovery(null);
    }
    if (suppressChanges.current || state.documents === before.documents || !owner.current || state.workspaceOwnerId !== owner.current) return;
    for (const [recordId, entry] of queue.current?.entries ?? []) {
      const current = state.documents.find(d => d.id === entry.document.id);
      if (current) queue.current?.enqueue(recordId, current);
    }
  }), []);

  useEffect(() => {
    const flush = () => { void queue.current?.flush(); };
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    const protectPending = (event: BeforeUnloadEvent) => {
      const hasUnsaved = [...(queue.current?.entries.values() ?? [])].some(entry => entry.status !== "saved");
      const hasVolatile = [...volatileDrafts.current.values()].some(drafts => drafts.length);
      if (hasUnsaved || hasVolatile || useMindMapStore.getState().saveStatus === "error") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", protectPending);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", protectPending);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  // Apply effects inside the guarded continuation, including after every await.
  // A result from another account or superseded navigation never reaches store.
  const perform = useCallback(async <T,>(
    work: (userId: string, signal: AbortSignal) => Promise<T>,
    apply: (result: T, userId: string) => void = () => {},
    current: () => boolean = () => true,
    clearError = true,
  ): Promise<boolean> => {
    const userId = owner.current;
    if (!userId) { setError("먼저 Google로 로그인해 주세요."); return false; }
    const stamp = generation.current;
    activeRequests.current += 1;
    setBusy(true);
    if (clearError) setError(null);
    try {
      const result = await work(userId, requests.current.signal);
      if (generation.current !== stamp || owner.current !== userId || !current()) return false;
      apply(result, userId);
      return true;
    } catch (cause) {
      if (generation.current !== stamp || !current()) return false;
      if (cause instanceof CloudError && cause.status === 401) {
        resetSession(null);
        setError("로그인이 만료되어 로컬 문서로 돌아왔습니다. 다시 로그인해 주세요.");
      } else if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError(cause instanceof Error ? cause.message : "요청을 완료하지 못했습니다.");
      }
      return false;
    } finally {
      if (generation.current === stamp) {
        activeRequests.current -= 1;
        setBusy(activeRequests.current > 0);
      }
    }
  }, [resetSession]);

  const refresh = useCallback(async (preserveError = false) => {
    await perform((userId, signal) => cloudRequest<{ documents: CloudDocumentSummary[] }>(userId, "documents", { action: "list" }, signal), result => setDocuments(result.documents), () => true, !preserveError);
  }, [perform]);
  useEffect(() => { if (session?.user.id) void refresh(); }, [session?.user.id, refresh]);

  const activate = useCallback((record: CloudDocumentRecord, pending: PendingCloudSave | null = null) => {
    const userId = owner.current;
    const q = queue.current;
    if (!userId || !q) return;
    for (const [id, entry] of q.entries) {
      if (id !== record.id && entry.document.id === record.document.id) {
        // A portable document ID is not a cloud-record ID. Preserve its draft
        // before changing the cached binding to another independently-made copy.
        retainDrafts();
        q.entries.delete(id);
      }
    }
    const entry = q.register(record, pending);
    suppressChanges.current = true;
    try { useMindMapStore.getState().openCloudDocument(userId, entry.document); }
    finally { suppressChanges.current = false; }
    setRecovery(null);
    onOpenRef.current(entry.document.id);
    if (pending) useMindMapStore.getState().addToast("선택한 저장 대기 내용을 복구했습니다.", "info");
  }, [retainDrafts]);

  const openDocument = useCallback(async (id: string) => {
    const stamp = generation.current;
    const userId = owner.current;
    const q = queue.current;
    const request = ++navigation.current;
    setRecovery(null);
    await q?.flush();
    if (stamp !== generation.current || userId !== owner.current || request !== navigation.current) return;
    await perform((currentOwner, signal) => cloudRequest<{ record: CloudDocumentRecord }>(currentOwner, "documents", { action: "get", id }, signal), result => {
      retainDrafts();
      const drafts = [...listPendingCloudSaves(userId!, id), ...(volatileDrafts.current.get(userId!) ?? []).filter(draft => draft.recordId === id)];
      const unique = [...new Map(drafts.map(draft => [draftKey(draft), draft])).values()];
      if (unique.length) setRecovery({ record: result.record, drafts: unique });
      else activate(result.record);
    }, () => request === navigation.current);
  }, [activate, perform, retainDrafts]);

  const recoverPending = useCallback((draft: PendingCloudSave | null) => {
    if (!recovery || !owner.current || !queue.current) return;
    if (draft && (draft.ownerId !== owner.current || draft.recordId !== recovery.record.id || !recovery.drafts.some(value => draftKey(value) === draftKey(draft)))) return;
    navigation.current += 1;
    // Opening the server copy does not discard another writer's recovery draft.
    activate(recovery.record, draft);
  }, [activate, recovery]);

  const copySelected = useCallback(async () => {
    const state = useMindMapStore.getState();
    const source = state.documents.find(d => d.id === state.activeDocumentId);
    if (!source) return;
    const sourceFingerprint = documentFingerprint(source);
    const sourceOwner = state.workspaceOwnerId;
    const document = { ...source, id: createId("doc") };
    const request = ++navigation.current;
    const copied = await perform((userId, signal) => cloudRequest<{ record: CloudDocumentRecord }>(userId, "documents", { action: "save", document: cloudDocumentPayload(document) }, signal), result => {
      const current = useMindMapStore.getState();
      const unchanged = current.workspaceOwnerId === sourceOwner &&
        documentFingerprint(current.documents.find(value => value.id === source.id) ?? source) === sourceFingerprint;
      if (!unchanged) {
        setError("요청 시점의 클라우드 사본을 만들었습니다. 그동안 추가한 변경은 현재 문서에 유지했습니다.");
        return;
      }
      const recovered = browserRecovery.current;
      if (recovered?.documentId === source.id && recovered.draft.ownerId === owner.current) {
        queue.current?.consumeRecoveryDraft(recovered.draft);
        const old = volatileDrafts.current.get(recovered.draft.ownerId) ?? [];
        volatileDrafts.current.set(recovered.draft.ownerId, old.filter(value => draftKey(value) !== draftKey(recovered.draft)));
        browserRecovery.current = null;
      }
      activate(result.record);
      useMindMapStore.getState().addToast("선택한 문서의 클라우드 사본을 만들었습니다. 이 사본만 자동 저장됩니다.", "success");
    }, () => request === navigation.current);
    if (copied) await refresh(true);
  }, [activate, perform, refresh]);

  const activeEntry = workspaceOwnerId === session?.user.id
    ? [...(queue.current?.entries.values() ?? [])].find(entry => entry.document.id === activeDocumentId) ?? null
    : null;

  const resolveConflict = useCallback(async (choice: "latest" | "copy", id: string) => {
    const q = queue.current;
    const entry = q?.entries.get(id);
    if (!entry || !owner.current || !q) return;
    const request = ++navigation.current;
    const requestedFingerprint = documentFingerprint(entry.document);
    const unchanged = () => q.entries.get(id) === entry && documentFingerprint(entry.document) === requestedFingerprint;
    if (choice === "latest") {
      await perform((currentOwner, signal) => cloudRequest<{ record: CloudDocumentRecord }>(currentOwner, "documents", { action: "get", id }, signal), result => {
        if (!unchanged()) {
          setError("불러오는 동안 추가한 변경을 유지했습니다. 최신본으로 바꾸려면 다시 선택해 주세요.");
          return;
        }
        q.discardPending(id);
        activate(result.record);
      }, () => request === navigation.current && queue.current === q);
    } else {
      const document = { ...entry.document, id: createId("doc"), title: `${entry.document.title} (복구 사본)` };
      const copied = await perform((currentOwner, signal) => cloudRequest<{ record: CloudDocumentRecord }>(currentOwner, "documents", { action: "save", document: cloudDocumentPayload(document) }, signal), result => {
        if (!unchanged()) {
          setError("요청 시점의 복구 사본을 저장했습니다. 그동안 추가한 변경은 현재 문서에 유지했습니다.");
          return;
        }
        q.discardPending(id);
        q.entries.delete(id);
        activate(result.record);
      }, () => request === navigation.current && queue.current === q);
      if (copied) await refresh(true);
    }
  }, [activate, perform, refresh]);

  const share = useCallback(async (id: string, action: "enable" | "rotate" | "revoke") => {
    const q = queue.current;
    const stamp = generation.current;
    const userId = owner.current;
    if (!q || !userId) return;
    if (action !== "revoke" && !(await q.flush(id))) {
      if (queue.current === q) setError("클라우드 저장을 먼저 완료해 주세요. 충돌이나 저장 오류를 해결한 뒤 공유할 수 있습니다.");
      return;
    }
    if (stamp !== generation.current || userId !== owner.current || q !== queue.current) return;
    await perform((currentOwner, signal) => cloudRequest<{ enabled: boolean; token?: string }>(currentOwner, "share", { id, action }, signal), result => {
      const entry = q.entries.get(id);
      if (entry) entry.record.shareEnabled = result.enabled;
      setDocuments(list => list.map(d => d.id === id ? { ...d, shareEnabled: result.enabled } : d));
      setShareLinks(links => {
        const next = { ...links };
        if (result.token) next[id] = `${window.location.origin}/share#token=${result.token}`;
        else delete next[id];
        return next;
      });
      setVersion(v => v + 1);
    }, () => q === queue.current);
  }, [perform]);

  const deleteDocument = useCallback(async (id: string) => {
    const q = queue.current;
    const stamp = generation.current;
    const entry = q?.entries.get(id);
    if (!q || !entry) return;
    const request = ++navigation.current;
    const requestedFingerprint = documentFingerprint(entry.document);
    const flushed = await q.flush(id);
    if (stamp !== generation.current || q !== queue.current || request !== navigation.current) return;
    if (q.entries.get(id) !== entry || documentFingerprint(entry.document) !== requestedFingerprint) {
      setError("저장 중 추가한 변경을 유지했습니다. 삭제하려면 다시 확인해 주세요.");
      return;
    }
    if (!flushed) {
      setError("저장 오류나 충돌을 먼저 해결한 뒤 클라우드 문서를 삭제해 주세요.");
      return;
    }
    await perform((userId, signal) => cloudRequest(userId, "documents", { action: "delete", id, expectedRevision: entry.record.revision }, signal), () => {
      if (q.entries.get(id) !== entry || documentFingerprint(entry.document) !== requestedFingerprint) {
        entry.status = "conflict";
        entry.error = "원본은 삭제됐지만 삭제 요청 중 추가한 변경은 유지했습니다. 내 변경을 새 사본으로 저장해 주세요.";
        retainDrafts();
        setDocuments(list => list.filter(document => document.id !== id));
        setVersion(v => v + 1);
        return;
      }
      q.discardPending(id);
      q.entries.delete(id);
      setDocuments(list => list.filter(document => document.id !== id));
      setShareLinks(links => { const next = { ...links }; delete next[id]; return next; });
      if (useMindMapStore.getState().workspaceOwnerId === owner.current) {
        useMindMapStore.getState().deleteDocument(entry.document.id);
      }
      useMindMapStore.getState().switchWorkspaceOwner(null);
      onLocalRef.current();
      setRecovery(null);
    }, () => request === navigation.current && q === queue.current);
  }, [perform, retainDrafts]);

  const login = useCallback(async () => {
    const client = getCloudClient();
    if (!client) { setError("클라우드 연결 설정이 아직 준비되지 않았습니다. 로컬 편집은 계속 사용할 수 있습니다."); return; }
    useMindMapStore.getState().saveWorkspace();
    if (useMindMapStore.getState().saveStatus === "error") {
      setError("브라우저 저장에 실패했습니다. 로그인 전에 JSON으로 내보내 현재 문서를 보관해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: authError } = await client.auth.signInWithOAuth({
        provider: "google", options: { redirectTo: `${window.location.origin}/` },
      });
      if (authError) throw authError;
    } catch { setError("Google 로그인을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요."); setBusy(false); }
  }, []);

  const logout = useCallback(async () => {
    const client = getCloudClient();
    if (!client) return;
    const stamp = generation.current;
    const userId = owner.current;
    navigation.current += 1;
    setBusy(true);
    setError(null);
    retainDrafts();
    const reportFailure = () => {
      if (owner.current === null) {
        // The SDK can emit SIGNED_OUT and clear its local session even when
        // the remote logout request fails. Never restore stale credentials.
        setBusy(false);
        setError("이 브라우저에서는 로그아웃했습니다. 서버 로그아웃 확인에 실패했습니다. 저장 대기 내용은 같은 계정으로 다시 로그인한 뒤 복구할 수 있습니다.");
      } else if (generation.current === stamp && owner.current === userId) {
        setBusy(false);
        setError("로그아웃하지 못했습니다. 현재 문서와 저장 대기 내용을 유지했습니다. 다시 시도해 주세요.");
      }
    };
    try {
      const { error: authError } = await client.auth.signOut({ scope: "local" });
      if (authError) { reportFailure(); return; }
      if (generation.current !== stamp && owner.current !== null) return;
      resetSession(null);
    } catch {
      reportFailure();
    }
  }, [resetSession, retainDrafts]);

  const returnLocal = useCallback(() => {
    navigation.current += 1;
    setRecovery(null);
    retainDrafts();
    void queue.current?.flush();
    useMindMapStore.getState().switchWorkspaceOwner(null);
    onLocalRef.current();
  }, [retainDrafts]);
  const retry = useCallback(() => { void queue.current?.flush(); }, []);
  const browserDrafts = session?.user.id === owner.current ? [...new Map([
    ...listOwnerPendingCloudSaves(session.user.id),
    ...(volatileDrafts.current.get(session.user.id) ?? []),
    ...(queue.current?.getPendingSnapshots() ?? []),
  ].map(draft => [draftKey(draft), draft])).values()] : [];

  const openBrowserDraft = useCallback((draft: PendingCloudSave) => {
    const userId = owner.current;
    if (!userId || draft.ownerId !== userId) return;
    const available = [...listOwnerPendingCloudSaves(userId),
      ...(volatileDrafts.current.get(userId) ?? []), ...(queue.current?.getPendingSnapshots() ?? [])];
    if (!available.some(value => draftKey(value) === draftKey(draft))) return;
    navigation.current += 1;
    setRecovery(null);
    const document = { ...draft.document, id: createId("doc"), title: `${draft.document.title} (브라우저 복구)` };
    // This is an account-scoped browser copy, deliberately NOT registered for
    // cloud autosave. Its source may have been deleted on the server.
    suppressChanges.current = true;
    try { useMindMapStore.getState().openCloudDocument(userId, document); }
    finally { suppressChanges.current = false; }
    browserRecovery.current = { documentId: document.id, draft };
    onOpenRef.current(document.id);
    setVersion(value => value + 1);
  }, []);

  const cancelNavigation = useCallback(() => { navigation.current += 1; setRecovery(null); }, []);
  const cancelRecovery = cancelNavigation;
  void version;
  return { configured: cloudConfigured(), session, ready, documents, busy, error, activeEntry,
    activeDocument, workspaceOwnerId, shareLinks, recovery, login, logout, refresh, openDocument,
    copySelected, resolveConflict, share, deleteDocument, returnLocal, retry, recoverPending, cancelRecovery, cancelNavigation, browserDrafts, openBrowserDraft };
}
export type CloudWorkspace = ReturnType<typeof useCloudWorkspace>;
