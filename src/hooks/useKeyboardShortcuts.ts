"use client";

import { useEffect } from "react";

import { isEditableTarget, modPressed } from "@/lib/keyboard";
import { getHiddenNodeIds } from "@/lib/tree";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapNode } from "@/types/mindmap";

type Dir = "up" | "down" | "left" | "right";

// Select the nearest visible node lying in the arrow's direction relative to
// the current node's center. A directional cone (perpendicular offset weighted
// heavier) keeps navigation intuitive on the bidirectional radial layout.
function nearestInDirection(
  nodes: MindMapNode[],
  fromId: string,
  dir: Dir
): string | null {
  const from = nodes.find((n) => n.id === fromId);
  if (!from) return null;
  const hidden = getHiddenNodeIds(nodes);
  const fx = from.position.x;
  const fy = from.position.y;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const n of nodes) {
    if (n.id === fromId || hidden.has(n.id)) continue;
    const dx = n.position.x - fx;
    const dy = n.position.y - fy;
    let primary: number;
    let perp: number;
    if (dir === "left" || dir === "right") {
      primary = dir === "right" ? dx : -dx;
      perp = Math.abs(dy);
    } else {
      primary = dir === "down" ? dy : -dy;
      perp = Math.abs(dx);
    }
    if (primary <= 0) continue; // not in this direction
    if (perp > primary * 1.6) continue; // outside the cone
    const score = primary + perp * 2;
    if (score < bestScore) {
      bestScore = score;
      best = n.id;
    }
  }
  return best;
}

// Global keyboard shortcuts. Wired once at the app shell level.
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const store = useMindMapStore.getState();
      const editable = isEditableTarget(e.target);

      // Escape works everywhere.
      if (e.key === "Escape") {
        if (store.contextMenu) {
          store.closeContextMenu();
          return;
        }
        if (store.connectMode) return store.setConnectMode(false);
        if (store.selectedRelationId) return store.selectRelation(null);
        if (store.commandPaletteOpen) return store.closeCommandPalette();
        if (store.dialog) return store.setDialog(null);
        if (store.searchOpen) return store.setSearchOpen(false);
        if (store.mobileSheetOpen) return store.setMobileSheetOpen(false);
        if (store.editingNodeId) return store.setEditingNode(null);
        if (store.presentationMode) return store.closePresentationMode();
        store.selectNode(null);
        return;
      }

      // Command palette / search / save use the mod key everywhere.
      if (modPressed(e)) {
        const key = e.key.toLowerCase();
        if (key === "k") {
          e.preventDefault();
          store.commandPaletteOpen
            ? store.closeCommandPalette()
            : store.openCommandPalette();
          return;
        }
        if (key === "f") {
          e.preventDefault();
          store.setSearchOpen(true);
          return;
        }
        if (key === "s") {
          e.preventDefault();
          store.saveWorkspace();
          store.addToast("저장했습니다", "success");
          return;
        }
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
          return;
        }
        if (key === "d") {
          e.preventDefault();
          if (store.selectedNodeId) store.duplicateSubtree(store.selectedNodeId);
          return;
        }
        // Copy/paste subtrees — only outside text fields so the browser's
        // native clipboard keeps working while typing.
        if (key === "c" && !editable && store.selectedNodeId) {
          e.preventDefault();
          store.copySubtree(store.selectedNodeId);
          return;
        }
        if (key === "v" && !editable && store.selectedNodeId) {
          e.preventDefault();
          store.pasteSubtree(store.selectedNodeId);
          return;
        }
      }

      // The rest only apply when not typing in a field.
      if (editable) return;

      const selected = store.selectedNodeId;

      if (e.key === "Tab") {
        e.preventDefault();
        if (selected) store.addChildNode(selected);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (store.presentationMode) return store.presentationNext();
        if (selected) store.addSiblingNode(selected);
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        if (selected) store.setEditingNode(selected);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (store.selectedRelationId) {
          store.removeRelation(store.selectedRelationId);
        } else if (store.selectedNodeIds.length > 1) {
          store.bulkDelete(store.selectedNodeIds);
        } else if (selected) {
          store.deleteNode(selected);
        }
        return;
      }
      if (store.presentationMode) {
        if (e.key === "ArrowRight") return store.presentationNext();
        if (e.key === "ArrowLeft") return store.presentationPrev();
        return;
      }

      // Arrow keys move the selection to the nearest node in that direction.
      const dirMap: Record<string, Dir> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const dir = dirMap[e.key];
      if (dir && selected) {
        e.preventDefault();
        const next = nearestInDirection(store.nodes, selected, dir);
        if (next) store.selectNode(next);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
