"use client";

import { useEffect } from "react";

import { isEditableTarget, modPressed } from "@/lib/keyboard";
import { useMindMapStore } from "@/store/mindMapStore";

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
        if (selected) store.deleteNode(selected);
        return;
      }
      if (store.presentationMode) {
        if (e.key === "ArrowRight") return store.presentationNext();
        if (e.key === "ArrowLeft") return store.presentationPrev();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
