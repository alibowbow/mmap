import {
  adaptInput,
  applyPositionPatch,
  EMPTY_STAMP,
  nodeRect,
} from "./layout-engine/adapter";
import { LayoutWorkerClient } from "./layout-engine/worker-client";
import { validateLayoutPatch } from "./layoutTransactions";
import type {
  EdgeRoute,
  EnginePort,
  LayoutInput,
  LayoutMode,
  RequestStamp,
} from "./layout-engine/types";
import type { HistoryEntry, MindMapState } from "@/store/mindMapStore";

export type LayoutRequest = Partial<
  Pick<
    LayoutInput,
    | "strategy"
    | "subtreeRootId"
    | "mode"
    | "changedNodeIds"
    | "affectedParentIds"
    | "previousObstacleRects"
    | "routingOnly"
    | "compact"
  >
>;
function snapshot(
  s: Pick<MindMapState, "nodes" | "edges" | "relations" | "activeLayoutMode">,
): HistoryEntry {
  return {
    nodes: s.nodes.map((n) => ({
      ...n,
      position: { ...n.position },
      data: {
        ...n.data,
        tags: n.data.tags ? [...n.data.tags] : undefined,
        checklist: n.data.checklist?.map((c) => ({ ...c })),
      },
    })),
    edges: s.edges.map((e) => ({
      ...e,
      data: e.data ? { ...e.data } : undefined,
    })),
    relations: s.relations.map((r) => ({ ...r })),
    layoutMode: s.activeLayoutMode,
  };
}
function meaning(
  s: Pick<MindMapState, "nodes" | "edges" | "relations" | "activeLayoutMode">,
): string {
  return JSON.stringify([
    s.nodes.map((n) => [n.id, n.position, n.data]),
    s.edges,
    s.relations,
    s.activeLayoutMode,
  ]);
}
export class LayoutRuntime {
  private stamp: RequestStamp = { ...EMPTY_STAMP };
  private transaction: {
    id: string;
    kind: string;
    before: HistoryEntry;
    signature: string;
    recorded: boolean;
  } | null = null;
  private serial = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: LayoutRequest | null = null;
  private applying = false;
  private ports = new Map<string, readonly EnginePort[]>();
  private labels = new Map<string, { width: number; height: number }>();
  private protectedIds = new Set<string>();
  private measurementPasses = 0;
  private cameraVersion = 0;
  constructor(
    private get: () => MindMapState,
    private set: (patch: Partial<MindMapState>) => void,
    private client = new LayoutWorkerClient(),
  ) {}
  get kind() {
    return this.transaction?.kind;
  }
  get isDragging() {
    return this.kind === "drag" && this.protectedIds.size > 0;
  }
  begin(kind: string, reuse = false) {
    if (reuse && this.transaction) return;
    this.cancel();
    const s = this.get();
    this.measurementPasses = 0;
    this.transaction = {
      id: `tx${++this.serial}`,
      kind,
      before: snapshot(s),
      signature: meaning(s),
      recorded: false,
    };
    this.stamp = { ...this.stamp, transactionId: this.transaction.id };
  }
  record(
    next: Pick<
      MindMapState,
      "nodes" | "edges" | "relations" | "activeLayoutMode"
    >,
  ) {
    const t = this.transaction;
    if (!t || t.recorded || meaning(next) === t.signature) return;
    t.recorded = true;
    this.set({
      history: [...this.get().history, t.before].slice(-60),
      future: [],
    });
  }
  recordBefore() {
    if (!this.transaction) this.begin("edit");
    const t = this.transaction!;
    if (t.recorded) return;
    t.recorded = true;
    this.set({
      history: [...this.get().history, t.before].slice(-60),
      future: [],
    });
  }
  beginDrag(ids: string[]) {
    this.begin("drag");
    this.protectedIds = new Set(ids);
  }
  endDrag() {
    this.protectedIds.clear();
    this.queue({ routingOnly: this.request?.routingOnly ?? true });
  }
  cameraIntent() {
    this.cameraVersion++;
  }
  cancel(clearTransaction = false) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.request = null;
    this.client.cancel();
    this.stamp = {
      ...this.stamp,
      requestGeneration: this.stamp.requestGeneration + 1,
    };
    if (clearTransaction) {
      this.transaction = null;
      this.protectedIds.clear();
      this.stamp = { ...this.stamp, transactionId: null };
    }
    this.set({ layoutBusy: false, layoutStamp: this.stamp });
  }
  reset() {
    this.cancel(true);
    this.ports.clear();
    this.labels.clear();
    this.measurementPasses = 0;
    this.stamp = {
      ...this.stamp,
      documentId: this.get().activeDocumentId ?? "",
      documentEpoch: this.stamp.documentEpoch + 1,
      contentRevision: this.stamp.contentRevision + 1,
      geometryRevision: this.stamp.geometryRevision + 1,
    };
    this.set({ layoutRoutes: {}, layoutResult: null, layoutStamp: this.stamp });
  }
  observe(s: MindMapState, before: MindMapState) {
    if (this.applying) return;
    if (s.activeDocumentId !== before.activeDocumentId) {
      this.reset();
      this.queue({ routingOnly: true });
      return;
    }
    if (s.editingNodeId !== before.editingNodeId) {
      if (s.editingNodeId) {
        this.begin("text");
        this.protectedIds.add(s.editingNodeId);
      } else {
        if (before.editingNodeId)
          this.protectedIds.delete(before.editingNodeId);
        this.queue({
          routingOnly: false,
          changedNodeIds: before.editingNodeId ? [before.editingNodeId] : [],
        });
      }
    }
    const optionsChanged =
      s.edgeStyle !== before.edgeStyle ||
      s.edgeWidth !== before.edgeWidth ||
      s.activeLayoutMode !== before.activeLayoutMode;
    const fontChanged =
      s.font !== before.font ||
      s.nodeStyle !== before.nodeStyle ||
      s.levelFontSizes !== before.levelFontSizes;
    const relationsChanged =
      s.relations !== before.relations &&
      JSON.stringify(s.relations) !== JSON.stringify(before.relations);
    if (
      s.nodes === before.nodes &&
      !optionsChanged &&
      !fontChanged &&
      !relationsChanged
    )
      return;
    const old = new Map(before.nodes.map((n) => [n.id, n])),
      changed: string[] = [],
      parents = new Set<string>(),
      previous: LayoutInput["previousObstacleRects"][number][] = [];
    let content = false,
      geometry = false,
      structural = false,
      removed = false;
    let legacyRoot: string | undefined;
    for (const n of s.nodes) {
      const p = old.get(n.id);
      old.delete(n.id);
      if (!p) {
        content = true;
        geometry = true;
        structural = true;
        changed.push(n.id);
        if (n.data.parentId) parents.add(n.data.parentId);
        continue;
      }
      const pos =
        p.position.x !== n.position.x || p.position.y !== n.position.y;
      const size =
        p.measured?.width !== n.measured?.width ||
        p.measured?.height !== n.measured?.height;
      const data =
        p.data !== n.data && JSON.stringify(p.data) !== JSON.stringify(n.data);
      if (data) content = true;
      const structure =
        p.data.parentId !== n.data.parentId ||
        p.data.collapsed !== n.data.collapsed ||
        p.data.side !== n.data.side;
      if (pos || size || structure) {
        geometry = true;
        changed.push(n.id);
        previous.push({ id: p.id, ...nodeRect(p) });
        if (p.data.parentId) parents.add(p.data.parentId);
        if (n.data.parentId) parents.add(n.data.parentId);
      }
      if (structure) {
        structural = true;
        if (p.data.collapsed && !n.data.collapsed) {
          changed.push(n.id);
          const kids = s.nodes.filter((child) => child.data.parentId === n.id);
          if (
            kids.length &&
            kids.every(
              (child) =>
                child.position.x === n.position.x &&
                child.position.y === n.position.y,
            )
          )
            legacyRoot = n.id;
        }
      }
    }
    for (const n of old.values()) {
      content = true;
      geometry = true;
      structural = true;
      removed = true;
      previous.push({ id: n.id, ...nodeRect(n) });
      if (n.data.parentId) parents.add(n.data.parentId);
    }
    if (
      !content &&
      !geometry &&
      !optionsChanged &&
      !fontChanged &&
      !relationsChanged
    )
      return;
    this.stamp = {
      ...this.stamp,
      contentRevision:
        this.stamp.contentRevision + Number(content || relationsChanged),
      geometryRevision:
        this.stamp.geometryRevision +
        Number(geometry || optionsChanged || fontChanged),
    };
    if (geometry || optionsChanged || fontChanged)
      this.set({ layoutRoutes: {} });
    const freeDrag = this.isDragging && !structural;
    const onlyCollapsed =
      structural &&
      !removed &&
      changed.every((id) => s.nodes.find((n) => n.id === id)?.data.collapsed);
    this.queue({
      strategy: legacyRoot ? "subtree" : "incremental",
      subtreeRootId: legacyRoot,
      changedNodeIds: changed,
      affectedParentIds: [...parents],
      previousObstacleRects: previous,
      compact: removed,
      routingOnly:
        !!s.editingNodeId ||
        freeDrag ||
        onlyCollapsed ||
        (!structural && !geometry && !fontChanged),
    });
  }
  measurements(
    ports: ReadonlyMap<string, readonly EnginePort[]>,
    labels?: ReadonlyMap<string, { width: number; height: number }>,
  ) {
    const changed: string[] = [];
    for (const [id, ps] of ports)
      if (JSON.stringify(this.ports.get(id)) !== JSON.stringify(ps)) {
        this.ports.set(id, ps);
        changed.push(id);
      }
    let labelChanged = false;
    if (labels)
      for (const [id, size] of labels)
        if (JSON.stringify(this.labels.get(id)) !== JSON.stringify(size)) {
          this.labels.set(id, size);
          labelChanged = true;
        }
    if (!changed.length && !labelChanged) return;
    this.stamp = {
      ...this.stamp,
      geometryRevision: this.stamp.geometryRevision + 1,
    };
    this.queue({ changedNodeIds: changed, routingOnly: true });
  }
  dimensionsChanged() {
    if (this.get().editingNodeId || this.isDragging) {
      this.queue({ routingOnly: true });
      return;
    }
    if (++this.measurementPasses > 8) {
      this.queue({ routingOnly: true });
      return;
    }
    this.queue({ routingOnly: false });
  }
  queue(spec: LayoutRequest = {}) {
    if (!this.get().activeDocumentId) return;
    const old = this.request;
    // Measurements augment the current explicit request, retaining its mode,
    // transaction and fit intent; a new user action cancels it in begin().
    this.request = {
      ...old,
      ...spec,
      strategy:
        old?.strategy && old.strategy !== "incremental"
          ? old.strategy
          : (spec.strategy ?? old?.strategy ?? "incremental"),
      mode: old?.mode ?? spec.mode,
      subtreeRootId: old?.subtreeRootId ?? spec.subtreeRootId,
      changedNodeIds: [
        ...new Set([
          ...(old?.changedNodeIds ?? []),
          ...(spec.changedNodeIds ?? []),
        ]),
      ],
      affectedParentIds: [
        ...new Set([
          ...(old?.affectedParentIds ?? []),
          ...(spec.affectedParentIds ?? []),
        ]),
      ],
      previousObstacleRects: [
        ...(old?.previousObstacleRects ?? []),
        ...(spec.previousObstacleRects ?? []),
      ],
      routingOnly:
        old?.routingOnly === false || spec.routingOnly === false
          ? false
          : (spec.routingOnly ?? old?.routingOnly ?? false),
    };
    if (this.timer) clearTimeout(this.timer);
    this.client.cancel();
    this.stamp = {
      ...this.stamp,
      documentId: this.get().activeDocumentId!,
      requestGeneration: this.stamp.requestGeneration + 1,
      transactionId: this.transaction?.id ?? null,
    };
    this.set({ layoutBusy: true, layoutStamp: this.stamp });
    this.timer = setTimeout(() => void this.execute(), 48);
  }
  async settle() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      await this.execute();
    }
    while (this.get().layoutBusy)
      await new Promise((resolve) => setTimeout(resolve, 10));
  }
  private async execute() {
    this.timer = null;
    const spec = this.request;
    if (!spec) return;
    const state = this.get(),
      camera = this.cameraVersion;
    const explicit = spec.strategy === "full" || spec.strategy === "subtree";
    const mode = spec.mode ?? state.activeLayoutMode;
    const inputNodes =
      spec.strategy === "full"
        ? state.nodes.map((n) =>
            n.data.layoutMode
              ? { ...n, data: { ...n.data, layoutMode: undefined } }
              : n,
          )
        : spec.strategy === "subtree"
          ? state.nodes.map((n) =>
              n.id === spec.subtreeRootId
                ? { ...n, data: { ...n.data, layoutMode: mode } }
                : n,
            )
          : state.nodes;
    const input = adaptInput(
      inputNodes,
      {
        mode: spec.strategy === "subtree" ? state.activeLayoutMode : mode,
        stamp: this.stamp,
        edges: state.edges,
        relations: state.relations,
        ports: this.ports,
        labels: this.labels,
        edgeStyle: state.edgeStyle,
        edgeWidth: state.edgeWidth,
        nodeStyle: state.nodeStyle,
      },
      {
        ...spec,
        mode,
        strategy: spec.strategy ?? "incremental",
        fixedNodeIds: [...this.protectedIds],
      },
    );
    const result = await this.client.run(input);
    if (!validateLayoutPatch(input, result, this.stamp)) {
      if (
        result.status !== "cancelled" &&
        input.stamp.requestGeneration === this.stamp.requestGeneration
      ) {
        this.request = null;
        this.set({ layoutBusy: false, layoutResult: result });
      }
      return;
    }
    this.request = null;
    const current = this.get();
    let nodes = applyPositionPatch(current.nodes, result);
    if (spec.strategy === "full" && nodes.some((n) => n.data.layoutMode))
      nodes = nodes.map((n) =>
        n.data.layoutMode
          ? { ...n, data: { ...n.data, layoutMode: undefined } }
          : n,
      );
    if (spec.strategy === "subtree")
      nodes = nodes.map((n) =>
        n.id === spec.subtreeRootId && n.data.layoutMode !== mode
          ? { ...n, data: { ...n.data, layoutMode: mode } }
          : n,
      );
    const activeLayoutMode =
      spec.strategy === "full" ? mode : current.activeLayoutMode;
    this.record({ ...current, nodes, activeLayoutMode });
    const changed =
      nodes !== current.nodes || activeLayoutMode !== current.activeLayoutMode;
    this.applying = true;
    this.set({
      nodes,
      activeLayoutMode,
      layoutBusy: false,
      layoutResult: result,
      layoutRoutes: Object.fromEntries(
        result.routes.map((r) => [r.edgeId, r]),
      ) as Record<string, EdgeRoute>,
      ...(changed
        ? {
            documents: current.documents.map((d) =>
              d.id === current.activeDocumentId
                ? {
                    ...d,
                    nodes,
                    layoutMode: activeLayoutMode,
                    updatedAt: new Date().toISOString(),
                  }
                : d,
            ),
            revision: current.revision + 1,
            saveStatus: "idle" as const,
          }
        : {}),
    });
    this.applying = false;
    if (explicit && result.status !== "ok")
      this.get().addToast(
        result.status === "infeasible"
          ? "고정된 노드가 겹쳐 일부 정리를 완료하지 못했습니다"
          : "배치를 적용했습니다. 일부 연결선 또는 간격은 추가 정리가 필요합니다",
        "info",
      );
    if (spec.strategy === "full" && camera === this.cameraVersion)
      this.get().fitToView();
  }
}
