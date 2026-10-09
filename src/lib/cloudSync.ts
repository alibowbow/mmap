import type { MindMapDocument } from "@/types/mindmap";
import { parseImportJson } from "@/lib/validation";
import { CloudError, type CloudDocumentRecord } from "@/lib/cloudClient";

export type CloudSaveStatus = "saved" | "pending" | "saving" | "offline" | "error" | "conflict";
export type PendingCloudSave = {
  ownerId: string; recordId: string; expectedRevision: number; document: MindMapDocument;
  writerId: string; writeId: string; savedAt: string;
};
export type CloudSaveEntry = {
  record: CloudDocumentRecord;
  document: MindMapDocument;
  status: CloudSaveStatus;
  error: string | null;
  recoveryAvailable: boolean;
  savedFingerprint: string;
  pendingSnapshot?: PendingCloudSave;
  recoverySource?: PendingCloudSave;
};

function ownerPendingPrefix(ownerId: string): string {
  return `mindbranch-cloud-pending-v2:${encodeURIComponent(ownerId)}:`;
}

export function pendingCloudKey(ownerId: string, recordId: string, writerId: string, writeId?: string): string {
  const writerKey = `${ownerPendingPrefix(ownerId)}${encodeURIComponent(recordId)}:${encodeURIComponent(writerId)}`;
  return writeId === undefined ? writerKey : `${writerKey}:${encodeURIComponent(writeId)}`;
}

// Every queue instance writes its own durable draft. Unlike sessionStorage IDs,
// this remains unique even when a browser duplicates a tab (copying its storage).
function randomId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function listStoredPendingCloudSaves(ownerId: string, recordId?: string): PendingCloudSave[] {
  if (typeof window === "undefined") return [];
  try {
    const prefix = recordId === undefined ? ownerPendingPrefix(ownerId) : pendingCloudKey(ownerId, recordId, "");
    const drafts = new Map<string, PendingCloudSave>();
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try {
        const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as PendingCloudSave;
        if (!value || value.ownerId !== ownerId ||
          typeof value.recordId !== "string" || !value.recordId.trim() ||
          (recordId !== undefined && value.recordId !== recordId) ||
          typeof value.writerId !== "string" || !value.writerId.trim() ||
          typeof value.writeId !== "string" || !value.writeId.trim() ||
          (key !== pendingCloudKey(ownerId, value.recordId, value.writerId) &&
            key !== pendingCloudKey(ownerId, value.recordId, value.writerId, value.writeId)) ||
          typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt)) ||
          !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 1 ||
          !value.document || typeof value.document.updatedAt !== "string") continue;
        const parsed = parseImportJson(JSON.stringify(value.document));
        if (!parsed.ok) continue;
        const draft: PendingCloudSave = {
          ownerId, recordId: value.recordId, expectedRevision: value.expectedRevision,
          writerId: value.writerId, writeId: value.writeId, savedAt: value.savedAt,
          document: { ...parsed.document, updatedAt: value.document.updatedAt },
        };
        const identity = JSON.stringify([value.recordId, value.writerId]);
        const previous = drafts.get(identity);
        if (!previous || Date.parse(previous.savedAt) <= Date.parse(value.savedAt)) drafts.set(identity, draft);
      } catch { /* one invalid draft must not hide other recoverable drafts */ }
    }
    return [...drafts.values()].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  } catch { return []; }
}

export function listPendingCloudSaves(ownerId: string, recordId: string): PendingCloudSave[] {
  return listStoredPendingCloudSaves(ownerId, recordId);
}

// Include drafts whose remote record has been deleted or no longer appears in
// the account's cloud listing. Enumeration only reads this owner's local keys.
export function listOwnerPendingCloudSaves(ownerId: string): PendingCloudSave[] {
  return listStoredPendingCloudSaves(ownerId);
}

function persistPending(value: PendingCloudSave): boolean {
  const key = pendingCloudKey(value.ownerId, value.recordId, value.writerId, value.writeId);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch { return false; }
  return true;
}

function removePendingCloudSave(value: PendingCloudSave): boolean {
  try {
    const key = pendingCloudKey(value.ownerId, value.recordId, value.writerId, value.writeId);
    const current = JSON.parse(window.localStorage.getItem(key) ?? "null") as PendingCloudSave | null;
    if (current === null) return true;
    if (current.ownerId !== value.ownerId || current.recordId !== value.recordId ||
      current.writerId !== value.writerId || current.writeId !== value.writeId) return false;
    window.localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

// The key includes the write identity, so a concurrent newer write survives even
// if it lands between getItem and removeItem. Legacy mutable writer keys remain
// readable but are retained: their read/remove sequence cannot be made atomic.
export function clearPendingCloudSave(value: PendingCloudSave): void {
  removePendingCloudSave(value);
}

export function documentFingerprint(document: MindMapDocument): string {
  return JSON.stringify(document);
}

type QueueOptions = {
  ownerId: string;
  save: (recordId: string, revision: number, document: MindMapDocument, signal: AbortSignal) => Promise<CloudDocumentRecord>;
  onChange: () => void;
  onSessionExpired: () => void;
  onDraftCleared?: (draft: PendingCloudSave) => void;
  debounceMs?: number;
};

/** One account-scoped queue; dispose is a hard generation boundary. */
export class CloudSaveQueue {
  readonly entries = new Map<string, CloudSaveEntry>();
  private stopped = false;
  private sessionExpired = false;
  private lastSavedAt = 0;
  private readonly writerId = randomId();
  private controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight = new Map<string, Promise<boolean>>();
  private durableSnapshots = new Map<string, { entry: CloudSaveEntry; snapshots: Map<string, PendingCloudSave> }>();
  private retainedSnapshots = new Map<string, PendingCloudSave>();
  constructor(private options: QueueOptions) {}

  register(record: CloudDocumentRecord, pending: PendingCloudSave | null = null): CloudSaveEntry {
    if (pending && (pending.ownerId !== this.options.ownerId || pending.recordId !== record.id ||
      !Number.isSafeInteger(pending.expectedRevision) || pending.expectedRevision < 1)) {
      throw new Error("복구 초안의 계정 또는 문서가 일치하지 않습니다.");
    }
    const entry: CloudSaveEntry = {
      record: { ...record, revision: pending?.expectedRevision ?? record.revision },
      document: pending?.document ?? record.document,
      status: pending ? (pending.expectedRevision === record.revision ? "pending" : "conflict") : "saved",
      error: pending && pending.expectedRevision !== record.revision ? "다른 기기에서 수정한 내용이 있습니다. 저장 방법을 선택해 주세요." : null,
      recoveryAvailable: true,
      savedFingerprint: documentFingerprint(record.document),
      recoverySource: pending ?? undefined,
    };
    if (this.stopped) return entry;
    const previous = this.entries.get(record.id);
    if (previous && previous.status !== "saved") {
      for (const snapshot of [previous.pendingSnapshot, previous.recoverySource]) {
        if (snapshot) this.retainedSnapshots.set(this.snapshotIdentity(snapshot), snapshot);
      }
    }
    this.entries.set(record.id, entry);
    if (pending) this.persist(record.id, entry);
    this.options.onChange();
    if (entry.status === "pending") this.schedule();
    return entry;
  }

  enqueue(recordId: string, document: MindMapDocument): void {
    if (this.stopped) return;
    const entry = this.entries.get(recordId);
    if (!entry || documentFingerprint(entry.document) === documentFingerprint(document)) return;
    entry.document = document;
    if (entry.status !== "conflict") {
      entry.status = "pending";
      entry.error = null;
    }
    this.persist(recordId, entry);
    this.options.onChange();
    if (entry.status !== "conflict") this.schedule();
  }

  private persist(recordId: string, entry: CloudSaveEntry): void {
    const previousPending = entry.pendingSnapshot;
    this.lastSavedAt = Math.max(Date.now(), this.lastSavedAt + 1);
    const pending: PendingCloudSave = {
      ownerId: this.options.ownerId, recordId, expectedRevision: entry.record.revision,
      document: entry.document, writerId: this.writerId, writeId: randomId(), savedAt: new Date(this.lastSavedAt).toISOString(),
    };
    entry.pendingSnapshot = pending;
    entry.recoveryAvailable = persistPending(pending);
    if (entry.recoveryAvailable) {
      const previous = this.durableSnapshots.get(recordId);
      const durable = previous?.entry === entry ? previous : { entry, snapshots: new Map<string, PendingCloudSave>() };
      const superseded = new Map<string, PendingCloudSave>();
      // Collect only earlier writes of this entry. A draft retained when the
      // user opens the server copy is an independent recovery choice.
      for (const [writeId, snapshot] of durable.snapshots) {
        if (removePendingCloudSave(snapshot)) durable.snapshots.delete(writeId);
        superseded.set(this.snapshotIdentity(snapshot), snapshot);
      }
      if (previousPending) {
        removePendingCloudSave(previousPending);
        superseded.set(this.snapshotIdentity(previousPending), previousPending);
      }
      durable.snapshots.set(pending.writeId, pending);
      this.durableSnapshots.set(recordId, durable);
      for (const snapshot of superseded.values()) this.options.onDraftCleared?.(snapshot);
    }
  }

  private snapshotIdentity(snapshot: PendingCloudSave): string {
    return JSON.stringify([snapshot.ownerId, snapshot.recordId, snapshot.writerId, snapshot.writeId]);
  }

  // Preserve current edits across an account switch even if durable storage is
  // full or inaccessible. Callers may keep these only in owner-scoped memory.
  getPendingSnapshots(): PendingCloudSave[] {
    const snapshots = new Map(this.retainedSnapshots);
    for (const entry of this.entries.values()) {
      if (entry.status !== "saved" && entry.pendingSnapshot) {
        snapshots.set(this.snapshotIdentity(entry.pendingSnapshot), entry.pendingSnapshot);
      }
    }
    return [...snapshots.values()].map(snapshot => JSON.parse(JSON.stringify(snapshot)) as PendingCloudSave);
  }

  discardPending(recordId: string): void {
    const entry = this.entries.get(recordId);
    const durable = this.durableSnapshots.get(recordId);
    const snapshots = [entry?.pendingSnapshot, entry?.recoverySource,
      ...(durable && durable.entry === entry ? durable.snapshots.values() : [])];
    const cleared = new Set<string>();
    for (const snapshot of snapshots) {
      if (!snapshot) continue;
      const identity = this.snapshotIdentity(snapshot);
      if (cleared.has(identity)) continue;
      cleared.add(identity);
      clearPendingCloudSave(snapshot);
      this.retainedSnapshots.delete(identity);
      this.options.onDraftCleared?.(snapshot);
    }
    if (entry) {
      entry.pendingSnapshot = undefined;
      entry.recoverySource = undefined;
    }
    this.durableSnapshots.delete(recordId);
  }

  // Consume the exact source copied successfully to a new cloud document. A
  // newer write by this entry or another writer remains an independent draft.
  consumeRecoveryDraft(draft: PendingCloudSave): void {
    if (draft.ownerId !== this.options.ownerId) {
      throw new Error("복구 초안의 계정이 일치하지 않습니다.");
    }
    if (this.stopped) return;
    const identity = this.snapshotIdentity(draft);
    clearPendingCloudSave(draft);
    this.retainedSnapshots.delete(identity);
    const durable = this.durableSnapshots.get(draft.recordId);
    if (durable) {
      for (const [writeId, snapshot] of durable.snapshots) {
        if (this.snapshotIdentity(snapshot) === identity) durable.snapshots.delete(writeId);
      }
      if (!durable.snapshots.size) this.durableSnapshots.delete(draft.recordId);
    }
    const entry = this.entries.get(draft.recordId);
    if (entry?.pendingSnapshot && this.snapshotIdentity(entry.pendingSnapshot) === identity) {
      if (entry.recoverySource && this.snapshotIdentity(entry.recoverySource) !== identity) {
        this.retainedSnapshots.set(this.snapshotIdentity(entry.recoverySource), entry.recoverySource);
      }
      this.entries.delete(draft.recordId);
    } else if (entry?.recoverySource && this.snapshotIdentity(entry.recoverySource) === identity) {
      entry.recoverySource = undefined;
    }
    this.options.onDraftCleared?.(draft);
    this.options.onChange();
  }

  private schedule(): void {
    if (this.stopped || this.sessionExpired) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, this.options.debounceMs ?? 850);
  }

  async flush(recordId?: string): Promise<boolean> {
    if (this.stopped || this.sessionExpired) return false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const ids = recordId ? [recordId] : [...this.entries.keys()];
    const results = await Promise.all(ids.map(id => this.saveOne(id)));
    return results.every(Boolean);
  }

  private async saveOne(id: string): Promise<boolean> {
    const active = this.inFlight.get(id);
    if (active) {
      await active;
      if (this.stopped || this.sessionExpired) return false;
      const status = this.entries.get(id)?.status;
      return status === "pending" || status === "saving" ? this.saveOne(id) : status === "saved";
    }
    const entry = this.entries.get(id);
    if (!entry || this.stopped || this.sessionExpired) return false;
    if (entry.status === "saved") return true;
    if (entry.status === "conflict") return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      entry.status = "offline";
      this.options.onChange();
      return false;
    }
    // Register the job before invoking callbacks so a reentrant flush joins the
    // same request rather than starting a second revision compare-and-swap.
    const job = Promise.resolve().then(() => this.performSave(id, entry));
    this.inFlight.set(id, job);
    const result = await job;
    if (this.inFlight.get(id) === job) this.inFlight.delete(id);
    if (!this.stopped && !this.sessionExpired && this.entries.get(id) === entry && entry.status === "pending") return this.saveOne(id);
    return result;
  }

  private async performSave(id: string, entry: CloudSaveEntry): Promise<boolean> {
    if (this.stopped || this.sessionExpired || this.entries.get(id) !== entry) return false;
    const document = entry.document;
    const fingerprint = documentFingerprint(document);
    entry.status = "saving";
    this.options.onChange();
    try {
      const saved = await this.options.save(id, entry.record.revision, document, this.controller.signal);
      if (this.stopped || this.entries.get(id) !== entry) return false;
      entry.record = saved;
      entry.savedFingerprint = fingerprint;
      entry.error = null;
      if (documentFingerprint(entry.document) === fingerprint) {
        entry.status = "saved";
        this.discardPending(id);
        entry.pendingSnapshot = undefined;
        entry.recoverySource = undefined;
      } else {
        entry.status = "pending";
        this.persist(id, entry);
      }
      this.options.onChange();
      return entry.status === "saved";
    } catch (error) {
      if (this.stopped || this.entries.get(id) !== entry) return false;
      if (error instanceof CloudError && error.status === 401) {
        entry.status = "error";
        entry.error = error.message;
        const notify = !this.sessionExpired;
        this.sessionExpired = true;
        this.options.onChange();
        if (notify) this.options.onSessionExpired();
        return false;
      }
      const deleted = error instanceof CloudError && error.status === 404;
      entry.status = error instanceof CloudError && (error.status === 409 || deleted) ? "conflict" :
        typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error";
      entry.error = deleted ? "원본 문서가 삭제됐습니다. 내 변경을 새 사본으로 저장해 주세요." :
        entry.status === "conflict" ? "다른 기기에서 수정한 내용이 있습니다. 자동 덮어쓰기를 멈췄습니다." :
        error instanceof Error ? error.message : "클라우드 저장에 실패했습니다.";
      this.options.onChange();
      return false;
    }
  }

  // An active request might still have reached the server. Aborting only stops
  // this generation from issuing further work or applying a late response.
  dispose(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.controller.abort();
    this.entries.clear();
    this.inFlight.clear();
    this.durableSnapshots.clear();
    this.retainedSnapshots.clear();
  }
}
