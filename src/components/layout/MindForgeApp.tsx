"use client";

import { MotionConfig } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { HomeScreen } from "@/components/home/HomeScreen";
import { ImportJsonDialog } from "@/components/dialogs/ImportJsonDialog";
import { BrandMark } from "@/components/ui/BrandMark";
import { ToastViewport } from "@/components/ui/Toast";
import { useDebouncedEffect } from "@/hooks/useDebouncedEffect";
import { fontFamilyFor } from "@/lib/constants";
import { readShareCodeFromHash } from "@/lib/share";
import { useMindMapStore } from "@/store/mindMapStore";
import type { TemplateType } from "@/types/mindmap";

const AppShell = dynamic(
  () => import("@/components/layout/AppShell").then((module) => module.AppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-surface-base">
        <div className="flex items-center gap-3 text-sm text-ink-soft">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-brand" />
          편집기를 여는 중…
        </div>
      </div>
    ),
  }
);

type AppView = "booting" | "home" | "editor";

function preservedHistoryState() {
  const current = window.history.state;
  return current && typeof current === "object" ? { ...current } : current;
}

function urlForDocument(documentId: string | null) {
  const url = new URL(window.location.href);
  url.hash = "";
  if (documentId) url.searchParams.set("doc", documentId);
  else url.searchParams.delete("doc");
  return `${url.pathname}${url.search}`;
}

function writeDocumentUrl(documentId: string | null, mode: "push" | "replace") {
  const next = urlForDocument(documentId);
  if (mode === "push") {
    window.history.pushState(preservedHistoryState(), "", next);
  } else {
    window.history.replaceState(preservedHistoryState(), "", next);
  }
}

function hasShareHash(hash: string) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return raw
    .split("&")
    .some((part) => part === "m" || part.startsWith("m="));
}

function closeEditorSurfaces() {
  useMindMapStore.setState({
    commandPaletteOpen: false,
    searchOpen: false,
    dialog: null,
    contextMenu: null,
    mobileDrawerOpen: false,
    mobileMoreOpen: false,
    mobileSheetOpen: false,
    presentationMode: false,
    tutorialStep: null,
    editingNodeId: null,
    connectMode: false,
    focusModeNodeId: null,
  });
}

export function MindForgeApp() {
  const [view, setView] = useState<AppView>("booting");
  const handledShare = useRef<string | null>(null);

  const hydrated = useMindMapStore((state) => state.hydrated);
  const activeDocumentId = useMindMapStore((state) => state.activeDocumentId);
  const revision = useMindMapStore((state) => state.revision);
  const theme = useMindMapStore((state) => state.theme);
  const font = useMindMapStore((state) => state.font);
  const loadWorkspace = useMindMapStore((state) => state.loadWorkspace);
  const saveWorkspace = useMindMapStore((state) => state.saveWorkspace);
  const setTheme = useMindMapStore((state) => state.setTheme);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const resolveLocation = useCallback(() => {
    const state = useMindMapStore.getState();
    const hash = window.location.hash;
    const shareCode = readShareCodeFromHash(hash);
    const containsShare = hasShareHash(hash);

    if (containsShare && handledShare.current !== hash) {
      handledShare.current = hash;
      const imported = shareCode
        ? state.importSharedDocument(shareCode)
        : false;
      if (!shareCode) {
        state.addToast("공유 링크를 열 수 없습니다: 링크가 올바르지 않습니다.", "error");
      }
      const importedId = imported ? useMindMapStore.getState().activeDocumentId : null;
      writeDocumentUrl(importedId, "replace");
      setView(importedId ? "editor" : "home");
      return;
    }

    const url = new URL(window.location.href);
    const requestedId = url.searchParams.get("doc");
    const exists = requestedId
      ? state.documents.some((document) => document.id === requestedId)
      : false;

    if (requestedId && exists) {
      if (state.activeDocumentId !== requestedId) state.setActiveDocument(requestedId);
      setView("editor");
      return;
    }

    if (requestedId && !exists) writeDocumentUrl(null, "replace");
    closeEditorSurfaces();
    setView("home");
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    resolveLocation();
    window.addEventListener("popstate", resolveLocation);
    return () => window.removeEventListener("popstate", resolveLocation);
  }, [hydrated, resolveLocation]);

  useDebouncedEffect(
    () => {
      if (hydrated) saveWorkspace();
    },
    [revision, hydrated],
    700
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const flush = () => {
      if (useMindMapStore.getState().hydrated) saveWorkspace();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [saveWorkspace]);

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => setTheme("system");
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, [setTheme, theme]);

  useEffect(() => {
    if (view !== "editor" || !activeDocumentId) return;
    const currentId = new URL(window.location.href).searchParams.get("doc");
    if (currentId !== activeDocumentId || window.location.hash) {
      writeDocumentUrl(activeDocumentId, "replace");
    }
  }, [activeDocumentId, view]);

  const showEditor = useCallback((documentId: string, mode: "push" | "replace" = "push") => {
    writeDocumentUrl(documentId, mode);
    setView("editor");
  }, []);

  const createAndOpen = useCallback(
    (template: TemplateType = "blank") => {
      const state = useMindMapStore.getState();
      state.createDocument(template);
      const documentId = useMindMapStore.getState().activeDocumentId;
      useMindMapStore.getState().saveWorkspace();
      if (documentId) showEditor(documentId);
    },
    [showEditor]
  );

  const openDocument = useCallback(
    (documentId: string) => {
      const state = useMindMapStore.getState();
      if (state.activeDocumentId !== documentId) state.setActiveDocument(documentId);
      state.saveWorkspace();
      showEditor(documentId);
    },
    [showEditor]
  );

  const openImport = useCallback(() => {
    useMindMapStore.getState().setDialog("import");
  }, []);

  const openImportedDocument = useCallback(() => {
    const state = useMindMapStore.getState();
    state.saveWorkspace();
    if (state.activeDocumentId) showEditor(state.activeDocumentId);
  }, [showEditor]);

  const goHome = useCallback(() => {
    useMindMapStore.getState().saveWorkspace();
    closeEditorSurfaces();
    writeDocumentUrl(null, "push");
    setView("home");
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-home-heading]")?.focus();
    });
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="min-h-[100dvh] w-full bg-surface-base text-ink"
        style={{ fontFamily: fontFamilyFor(font) }}
      >
        {view === "booting" || !hydrated ? (
          <div className="flex h-[100dvh] flex-col items-center justify-center gap-2.5 bg-surface-base">
            <BrandMark size={46} className="rounded-xl shadow-float" />
            <span className="mf-brand-text text-lg font-bold tracking-tight">MindForge</span>
            <span className="text-[11px] tracking-wide text-ink-faint">생각을 벼리다</span>
          </div>
        ) : view === "home" ? (
          <>
          <HomeScreen
            onCreate={createAndOpen}
            onOpenDocument={openDocument}
            onImport={openImport}
          />
          <ImportJsonDialog onImported={openImportedDocument} />
          </>
        ) : (
          <AppShell onHome={goHome} />
        )}
        <ToastViewport />
      </div>
    </MotionConfig>
  );
}
