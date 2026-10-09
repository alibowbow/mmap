import type { MindMapDocument } from "@/types/mindmap";
import type { CloudDocumentRecord } from "@/lib/cloudClient";
import { parseImportJson } from "@/lib/validation";
import {
  clearPendingCloudSave, listOwnerPendingCloudSaves, pendingCloudKey,
  type PendingCloudSave,
} from "@/lib/cloudSync";

export type CloudCacheBaseline = {
  ownerId: string;
  recordId: string;
  documentId: string;
  revision: number;
  fingerprint: string;
};
export type CacheDraftResult = {
  draft: PendingCloudSave | null;
  recoveryAvailable: boolean;
  baselineKnown: boolean;
};
type DraftSource = NonNullable<PendingCloudSave["source"]>;
type GuardOptions = {
  ownerId: string;
  onDraftCleared?: (draft: PendingCloudSave) => void;
};
const LEGACY_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function randomId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Only write snapshots that the durable-draft reader can recover. A minimally
// shaped legacy cache gains deterministic defaults instead of time-dependent
// import timestamps. Known display fields pass through the existing importer.
export function normalizeCacheDocument(document: MindMapDocument): MindMapDocument | null {
  try {
    if (!document || typeof document.id !== "string" || !document.id.trim()) return null;
    const parsed = parseImportJson(JSON.stringify(document));
    if (!parsed.ok) return null;
    return {
      ...parsed.document,
      createdAt: typeof document.createdAt === "string" ? document.createdAt : LEGACY_TIMESTAMP,
      updatedAt: typeof document.updatedAt === "string" ? document.updatedAt : LEGACY_TIMESTAMP,
    };
  } catch { return null; }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// Compact 128-bit content fingerprint, never used for authentication. Retains
// array order and all normalized document fields, including ink and viewport.
export function cacheDocumentFingerprint(document: MindMapDocument): string | null {
  const normalized = normalizeCacheDocument(document);
  if (!normalized) return null;
  return normalizedFingerprint(normalized);
}

function normalizedFingerprint(document: MindMapDocument): string {
  const serialized = canonicalJson(document);
  let a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
  for (let index = 0; index < serialized.length; index++) {
    const code = serialized.charCodeAt(index);
    a = b ^ Math.imul(a ^ code, 597399067);
    b = c ^ Math.imul(b ^ code, 2869860233);
    c = d ^ Math.imul(c ^ code, 951274213);
    d = a ^ Math.imul(d ^ code, 2716044179);
  }
  a = Math.imul(c ^ (a >>> 18), 597399067);
  b = Math.imul(d ^ (b >>> 22), 2869860233);
  c = Math.imul(a ^ (c >>> 17), 951274213);
  d = Math.imul(b ^ (d >>> 19), 2716044179);
  const hash = [(a ^ b ^ c ^ d) >>> 0, (b ^ a) >>> 0, (c ^ a) >>> 0, (d ^ a) >>> 0]
    .map(part => part.toString(16).padStart(8, "0")).join("");
  return `v1:${serialized.length}:${hash}`;
}

function baselinePrefix(ownerId: string): string {
  return `mindbranch-cloud-baseline-v1:${encodeURIComponent(ownerId)}:`;
}
export function cloudCacheBaselineKey(baseline: Pick<CloudCacheBaseline, "ownerId" | "recordId" | "documentId" | "revision">): string {
  return `${baselinePrefix(baseline.ownerId)}${encodeURIComponent(baseline.documentId)}:${encodeURIComponent(baseline.recordId)}:${baseline.revision}`;
}
function baselineIdentity(baseline: CloudCacheBaseline): string {
  return JSON.stringify([baseline.recordId, baseline.documentId]);
}
function draftIdentity(draft: PendingCloudSave): string {
  return JSON.stringify([draft.ownerId, draft.recordId, draft.writerId, draft.writeId]);
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function listBaselines(ownerId: string): CloudCacheBaseline[] {
  if (typeof window === "undefined") return [];
  const baselines = new Map<string, CloudCacheBaseline>();
  try {
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(baselinePrefix(ownerId))) continue;
      try {
        const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as CloudCacheBaseline;
        if (!value || value.ownerId !== ownerId || typeof value.recordId !== "string" || !value.recordId.trim() ||
          typeof value.documentId !== "string" || !value.documentId.trim() ||
          !Number.isSafeInteger(value.revision) || value.revision < 1 ||
          typeof value.fingerprint !== "string" || !/^v1:\d+:[0-9a-f]{32}$/.test(value.fingerprint) ||
          key !== cloudCacheBaselineKey(value)) continue;
        baselines.set(key, {
          ownerId, recordId: value.recordId, documentId: value.documentId,
          revision: value.revision, fingerprint: value.fingerprint,
        });
      } catch { /* malformed metadata must not hide other record baselines */ }
    }
  } catch { /* volatile baselines remain usable when storage is inaccessible */ }
  return [...baselines.values()];
}

/** Protect account-cache editing without registering or uploading documents. */
export class CloudCacheDraftGuard {
  private stopped = false;
  private lastSavedAt = 0;
  private writerId = randomId();
  private baselines = new Map<string, CloudCacheBaseline>();
  private observedBindings = new Map<string, { recordId: string; revision: number }>();
  private current = new Map<string, PendingCloudSave>();
  private durable = new Map<string, Map<string, PendingCloudSave>>();
  private retained = new Map<string, PendingCloudSave>();
  private recovery = new Map<string, boolean>();
  constructor(private options: GuardOptions) {}

  rememberAcknowledged(record: CloudDocumentRecord, document = record.document): boolean {
    if (this.stopped) return false;
    const fingerprint = cacheDocumentFingerprint(document);
    if (!fingerprint || !record.id.trim() || !Number.isSafeInteger(record.revision) || record.revision < 1) return false;
    const baseline: CloudCacheBaseline = {
      ownerId: this.options.ownerId, recordId: record.id, documentId: document.id,
      revision: record.revision, fingerprint,
    };
    const identity = baselineIdentity(baseline);
    const previous = this.baselines.get(identity);
    if (!previous || previous.revision <= baseline.revision) this.baselines.set(identity, baseline);
    this.observedBindings.set(document.id, { recordId: record.id, revision: record.revision });
    try {
      window.localStorage.setItem(cloudCacheBaselineKey(baseline), JSON.stringify(baseline));
      return true;
    } catch { return false; }
  }

  getBaseline(documentId: string, recordId?: string): CloudCacheBaseline | null {
    const candidates = this.documentBaselines(documentId).filter(baseline => recordId === undefined || baseline.recordId === recordId);
    if (new Set(candidates.map(baseline => baseline.recordId)).size !== 1) return null;
    return clone(candidates.reduce((latest, baseline) => latest.revision >= baseline.revision ? latest : baseline));
  }

  private documentBaselines(documentId: string): CloudCacheBaseline[] {
    const merged = new Map<string, CloudCacheBaseline>();
    for (const baseline of [...listBaselines(this.options.ownerId), ...this.baselines.values()]) {
      if (baseline.documentId === documentId) merged.set(cloudCacheBaselineKey(baseline), baseline);
    }
    return [...merged.values()];
  }

  preserveDocument(document: MindMapDocument, options: { serverRecord?: CloudDocumentRecord } = {}): CacheDraftResult {
    if (this.stopped) return { draft: null, recoveryAvailable: false, baselineKnown: false };
    const drafts = listOwnerPendingCloudSaves(this.options.ownerId).filter(draft => draft.document.id === document.id);
    const existing = this.current.get(document.id) ?? drafts.find(draft => draft.browserOnly);
    if (existing?.browserOnly) return this.preserveBrowserCopy(document, existing.source);
    const normalized = normalizeCacheDocument(document);
    const fingerprint = normalized && normalizedFingerprint(normalized);
    const baselines = this.documentBaselines(document.id);
    const ambiguous = new Set(baselines.map(baseline => baseline.recordId)).size > 1;
    if (!normalized || !fingerprint) return { draft: null, recoveryAvailable: false, baselineKnown: Boolean(baselines.length) };
    const matchingBase = !ambiguous && baselines.find(baseline => baseline.fingerprint === fingerprint);
    if (matchingBase) {
      this.baselines.set(baselineIdentity(matchingBase), matchingBase);
      this.observedBindings.set(document.id, { recordId: matchingBase.recordId, revision: matchingBase.revision });
      return { draft: null, recoveryAvailable: true, baselineKnown: true };
    }
    const observed = !ambiguous && this.observedBindings.get(document.id);
    const matchingDrafts = drafts.filter(draft => !draft.browserOnly && normalizedFingerprint(draft.document) === fingerprint);
    if (!ambiguous && new Set(matchingDrafts.map(draft => draft.recordId)).size === 1 &&
      (!observed || observed.revision <= matchingDrafts[0].expectedRevision)) {
      const matching = matchingDrafts[0];
      this.retained.set(draftIdentity(matching), matching);
      if (options.serverRecord && options.serverRecord.id !== matching.recordId) {
        return this.writeDraft(normalized, {
          recordId: matching.recordId, expectedRevision: matching.expectedRevision, browserOnly: true,
          source: { recordId: matching.recordId, writerId: matching.writerId, writeId: matching.writeId },
        }, true);
      }
      this.observedBindings.set(document.id, { recordId: matching.recordId, revision: matching.expectedRevision });
      return { draft: clone(matching), recoveryAvailable: true, baselineKnown: true };
    }
    const durableBase = !ambiguous && baselines.length ? baselines[0] : null;
    const baseline = observed || durableBase;
    const incomingFingerprint = options.serverRecord && cacheDocumentFingerprint(options.serverRecord.document);
    if (!baseline && incomingFingerprint === fingerprint) return { draft: null, recoveryAvailable: true, baselineKnown: false };
    return this.writeDraft(normalized, {
      recordId: baseline?.recordId ?? options.serverRecord?.id ?? `browser:${normalized.id}`,
      expectedRevision: baseline?.revision ?? options.serverRecord?.revision ?? 1,
      // Shared metadata alone does not prove a divergent cached body's basis.
      // Only a sent acknowledgement, clean match, or exact existing draft does.
      browserOnly: observed && (!options.serverRecord || options.serverRecord.id === observed.recordId) ? undefined : true,
    }, Boolean(baseline));
  }

  preserveBrowserCopy(document: MindMapDocument, source?: DraftSource): CacheDraftResult {
    const normalized = normalizeCacheDocument(document);
    if (this.stopped || !normalized) return { draft: null, recoveryAvailable: false, baselineKnown: false };
    return this.writeDraft(normalized, {
      recordId: `browser:${normalized.id}`, expectedRevision: 1, browserOnly: true,
      ...(source ? { source: { recordId: source.recordId, writerId: source.writerId, writeId: source.writeId } } : {}),
    }, false);
  }

  private writeDraft(document: MindMapDocument, binding: Pick<PendingCloudSave, "recordId" | "expectedRevision" | "browserOnly" | "source">, baselineKnown: boolean): CacheDraftResult {
    if (!binding.recordId.trim() || !Number.isSafeInteger(binding.expectedRevision) || binding.expectedRevision < 1 ||
      (binding.source && (!binding.source.recordId?.trim() || !binding.source.writerId?.trim() || !binding.source.writeId?.trim()))) {
      return { draft: null, recoveryAvailable: false, baselineKnown };
    }
    const previous = this.current.get(document.id);
    if (previous && previous.recordId === binding.recordId && previous.expectedRevision === binding.expectedRevision &&
      previous.browserOnly === binding.browserOnly && normalizedFingerprint(previous.document) === normalizedFingerprint(document)) {
      if (this.recovery.get(document.id)) return { draft: clone(previous), recoveryAvailable: true, baselineKnown };
      // Retry durability without losing the existing identity when storage recovers.
      const available = this.persist(previous);
      this.recovery.set(document.id, available);
      if (available) this.finishDurable(document.id, previous);
      return { draft: clone(previous), recoveryAvailable: available, baselineKnown };
    }
    if (previous && (previous.recordId !== binding.recordId || previous.expectedRevision !== binding.expectedRevision || previous.browserOnly !== binding.browserOnly)) {
      this.retained.set(draftIdentity(previous), previous);
    }
    this.lastSavedAt = Math.max(Date.now(), this.lastSavedAt + 1);
    const draft: PendingCloudSave = {
      ownerId: this.options.ownerId, ...binding, document,
      writerId: this.writerId, writeId: randomId(), savedAt: new Date(this.lastSavedAt).toISOString(),
    };
    this.current.set(document.id, draft);
    const available = this.persist(draft);
    this.recovery.set(document.id, available);
    if (available) this.finishDurable(document.id, draft, previous);
    return { draft: clone(draft), recoveryAvailable: available, baselineKnown };
  }

  private finishDurable(documentId: string, draft: PendingCloudSave, previous?: PendingCloudSave): void {
      const prior = this.durable.get(documentId) ?? new Map<string, PendingCloudSave>();
      const superseded = new Map<string, PendingCloudSave>();
      for (const [identity, snapshot] of prior) {
        if (this.retained.has(identity) || identity === draftIdentity(draft)) continue;
        clearPendingCloudSave(snapshot);
        try {
          if (window.localStorage.getItem(pendingCloudKey(snapshot.ownerId, snapshot.recordId, snapshot.writerId, snapshot.writeId)) === null) prior.delete(identity);
        } catch { /* retain the exact key for a later cleanup attempt */ }
        superseded.set(identity, snapshot);
      }
      if (previous && draftIdentity(previous) !== draftIdentity(draft) && !this.retained.has(draftIdentity(previous))) {
        clearPendingCloudSave(previous);
        superseded.set(draftIdentity(previous), previous);
      }
      prior.set(draftIdentity(draft), draft);
      this.durable.set(documentId, prior);
      for (const snapshot of superseded.values()) this.options.onDraftCleared?.(snapshot);
  }

  private persist(draft: PendingCloudSave): boolean {
    try {
      window.localStorage.setItem(pendingCloudKey(draft.ownerId, draft.recordId, draft.writerId, draft.writeId), JSON.stringify(draft));
      return true;
    } catch { return false; }
  }

  getPendingSnapshots(): PendingCloudSave[] {
    const snapshots = new Map(this.retained);
    for (const snapshot of this.current.values()) snapshots.set(draftIdentity(snapshot), snapshot);
    return [...snapshots.values()].map(clone);
  }

  getCurrentSnapshot(documentId: string): PendingCloudSave | null {
    const snapshot = this.current.get(documentId);
    return snapshot ? clone(snapshot) : null;
  }

  // A shared account-cache rehydrate starts an independent writer context. Prior
  // drafts remain recovery choices; newly loaded stale contents cannot supersede
  // them in memory, on disk, or in the newest-per-writer recovery listing.
  forgetObservedBindings(): void {
    for (const snapshot of this.current.values()) this.retained.set(draftIdentity(snapshot), snapshot);
    for (const snapshots of this.durable.values()) {
      for (const snapshot of snapshots.values()) this.retained.set(draftIdentity(snapshot), snapshot);
    }
    this.current.clear();
    this.durable.clear();
    this.recovery.clear();
    this.baselines.clear();
    this.observedBindings.clear();
    this.writerId = randomId();
  }

  consumeRecoveryDraft(draft: PendingCloudSave): void {
    if (draft.ownerId !== this.options.ownerId) throw new Error("복구 초안의 계정이 일치하지 않습니다.");
    if (this.stopped) return;
    const identity = draftIdentity(draft);
    clearPendingCloudSave(draft);
    this.retained.delete(identity);
    for (const [documentId, current] of this.current) {
      if (draftIdentity(current) === identity) {
        this.current.delete(documentId);
        this.recovery.delete(documentId);
      }
    }
    for (const [documentId, snapshots] of this.durable) {
      snapshots.delete(identity);
      if (!snapshots.size) this.durable.delete(documentId);
    }
    this.options.onDraftCleared?.(draft);
  }

  dispose(): void {
    this.stopped = true;
    this.current.clear();
    this.durable.clear();
    this.retained.clear();
    this.recovery.clear();
    this.baselines.clear();
    this.observedBindings.clear();
  }
}
