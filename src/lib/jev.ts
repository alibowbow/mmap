// Client side of the Jev suggestions (see src/app/api/jev/route.ts).
//
// After a node's text is committed, Jev judges — in one fast call — what kind
// of node it is and which top-level branch it fits. Suggestions only ever
// appear as a toast with an action; nothing changes until the user accepts,
// and an accepted change is a normal, undoable edit.
import { NODE_TYPE_CONFIG } from "@/lib/constants";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNodeType } from "@/types/mindmap";

type Suggestion = {
  kind: { value: MindMapNodeType; confidence: number } | null;
  branch: { id: string; confidence: number } | null;
};

// Below these, Jev's answer is too uncertain to be worth interrupting for.
const KIND_MIN_CONFIDENCE = 0.6;
const BRANCH_MIN_CONFIDENCE = 0.7;

const cache = new Map<string, Suggestion>();
let warnedUnavailable = false;

const short = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

export async function suggestForNode(nodeId: string): Promise<void> {
  const state = useMindMapStore.getState();
  if (!state.aiSuggest) return;
  const byId = new Map(state.nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  const text = node?.data.label.trim();
  if (!node || !text || node.data.isRoot || !node.data.parentId) return;
  const root = state.nodes.find((n) => n.data.isRoot);
  if (!root) return;

  // The node's current top-level branch (null when it is one itself).
  let top = node;
  while (top.data.parentId && top.data.parentId !== root.id) {
    const up = byId.get(top.data.parentId);
    if (!up) break;
    top = up;
  }
  const isTopLevel = top.id === node.id;
  const branches = isTopLevel
    ? []
    : state.nodes
        .filter((n) => n.data.parentId === root.id && n.data.label.trim())
        .map((n) => ({ id: n.id, label: n.data.label.trim() }));

  const payload = {
    topic: root.data.label,
    text,
    parent: byId.get(node.data.parentId)?.data.label ?? "",
    branches,
  };
  const key = JSON.stringify(payload);
  let result = cache.get(key);
  if (!result) {
    try {
      const res = await fetch("/api/jev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: key,
      });
      if (res.status === 503 && !warnedUnavailable) {
        warnedUnavailable = true;
        state.addToast("AI 제안을 쓰려면 서버에 AI Gateway 키 설정이 필요합니다", "error");
      }
      if (!res.ok) return;
      result = (await res.json()) as Suggestion;
      if (cache.size > 300) cache.clear();
      cache.set(key, result);
    } catch {
      return;
    }
  }

  // The map may have moved on while Jev answered.
  const now = useMindMapStore.getState();
  const current = now.nodes.find((n) => n.id === nodeId);
  if (!now.aiSuggest || !current || current.data.label.trim() !== text) return;

  const kind = result.kind;
  if (
    kind &&
    kind.confidence >= KIND_MIN_CONFIDENCE &&
    current.data.type === "plain" &&
    kind.value in NODE_TYPE_CONFIG
  ) {
    const label = NODE_TYPE_CONFIG[kind.value].label;
    now.addToast(`“${short(text)}”은(는) ${label}에 가까워 보여요`, "info", {
      label: `${label}로 바꾸기`,
      onClick: () => useMindMapStore.getState().updateNodeData(nodeId, { type: kind.value }),
    });
  }

  const branch = result.branch;
  if (
    branch &&
    !isTopLevel &&
    branch.confidence >= BRANCH_MIN_CONFIDENCE &&
    branch.id !== top.id
  ) {
    const target = now.nodes.find((n) => n.id === branch.id);
    if (!target) return;
    now.addToast(`“${short(text)}”은(는) ‘${short(target.data.label)}’ 가지에 더 어울려 보여요`, "info", {
      label: "옮기기",
      onClick: () => useMindMapStore.getState().reparentNode(nodeId, branch.id),
    });
  }
}
