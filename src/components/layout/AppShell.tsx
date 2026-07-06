"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Command,
  Eye,
  EyeOff,
  Menu,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MindMapCanvas } from "@/components/canvas/MindMapCanvas";
import { ExportDialog } from "@/components/dialogs/ExportDialog";
import { ImportJsonDialog } from "@/components/dialogs/ImportJsonDialog";
import { ShareDialog } from "@/components/dialogs/ShareDialog";
import { ShortcutDialog } from "@/components/dialogs/ShortcutDialog";
import { SnapshotDialog } from "@/components/dialogs/SnapshotDialog";
import { StatsDialog } from "@/components/dialogs/StatsDialog";
import { TemplateDialog } from "@/components/dialogs/TemplateDialog";
import { InspectorPanel } from "@/components/layout/InspectorPanel";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileBottomBar } from "@/components/mobile/MobileBottomBar";
import { MobileCommandPalette } from "@/components/mobile/MobileCommandPalette";
import { MobileDocumentDrawer } from "@/components/mobile/MobileDocumentDrawer";
import { MobileMoreMenu } from "@/components/mobile/MobileMoreMenu";
import { MobileNodeSheet } from "@/components/mobile/MobileNodeSheet";
import { MobileSearchOverlay } from "@/components/mobile/MobileSearchOverlay";
import { SearchPanel } from "@/components/panels/SearchPanel";
import { BulkActionBar } from "@/components/toolbar/BulkActionBar";
import { CommandPalette } from "@/components/toolbar/CommandPalette";
import { FloatingToolbar } from "@/components/toolbar/FloatingToolbar";
import { NodeContextMenu } from "@/components/toolbar/NodeContextMenu";
import { TutorialCoach } from "@/components/tutorial/TutorialCoach";
import { Button } from "@/components/ui/Button";
import { ToastViewport } from "@/components/ui/Toast";
import { useDebouncedEffect } from "@/hooks/useDebouncedEffect";
import {
  useIsDesktop,
  useIsMobile,
  useIsTablet,
} from "@/hooks/useIsMobile";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { cn } from "@/lib/cn";
import { fontFamilyFor } from "@/lib/constants";
import { readShareCodeFromHash } from "@/lib/share";
import { getVisibleDfsOrder } from "@/lib/tree";
import {
  selectActiveDocument,
  selectSelectedNode,
  useMindMapStore,
} from "@/store/mindMapStore";

const ONBOARD_KEY = "mindforge-onboarded-v1";

// ── Mobile top bar ───────────────────────────────────────────────────────────
function MobileTopbar() {
  const doc = useMindMapStore(selectActiveDocument);
  const setMobileDrawerOpen = useMindMapStore((s) => s.setMobileDrawerOpen);
  const setSearchOpen = useMindMapStore((s) => s.setSearchOpen);
  const openCommandPalette = useMindMapStore((s) => s.openCommandPalette);

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 pt-[env(safe-area-inset-top)] mf-glass">
      <button
        onClick={() => setMobileDrawerOpen(true)}
        aria-label="문서 목록"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft active:bg-surface-overlay"
      >
        <Menu size={20} />
      </button>
      <button
        onClick={() => setMobileDrawerOpen(true)}
        className="flex-1 truncate text-center text-sm font-semibold text-ink"
      >
        {doc?.title ?? "MindForge"}
      </button>
      <button
        onClick={() => setSearchOpen(true)}
        aria-label="검색"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft active:bg-surface-overlay"
      >
        <Search size={19} />
      </button>
      <button
        onClick={openCommandPalette}
        aria-label="명령"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft active:bg-surface-overlay"
      >
        <Command size={19} />
      </button>
    </header>
  );
}

// ── Presentation overlay ─────────────────────────────────────────────────────
function PresentationControls() {
  const node = useMindMapStore(selectSelectedNode);
  const next = useMindMapStore((s) => s.presentationNext);
  const prev = useMindMapStore((s) => s.presentationPrev);
  const close = useMindMapStore((s) => s.closePresentationMode);
  const index = useMindMapStore((s) => s.presentationIndex);
  const reveal = useMindMapStore((s) => s.presentationReveal);
  const setReveal = useMindMapStore((s) => s.setPresentationReveal);
  const total = useMindMapStore((s) => getVisibleDfsOrder(s.nodes).length);

  const touchStart = useRef<number | null>(null);
  const progress = total ? ((index + 1) / total) * 100 : 0;

  return (
    <div
      className="fixed inset-0 z-[80]"
      onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStart.current == null) return;
        const dx = e.changedTouches[0].clientX - touchStart.current;
        if (dx < -50) next();
        else if (dx > 50) prev();
        touchStart.current = null;
      }}
      // Let canvas interactions still happen on the empty middle area.
      style={{ pointerEvents: "none" }}
    >
      {/* Progress bar along the top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-line/50">
        <div
          className="h-full bg-brand transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current node caption */}
      {node && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 flex max-w-[80vw] items-center gap-2 rounded-full mf-glass border border-line px-4 py-1.5 text-sm font-medium text-ink shadow-soft">
          {node.data.emoji && <span>{node.data.emoji}</span>}
          <span className="truncate">{node.data.label || "(비어 있음)"}</span>
          <span className="shrink-0 text-xs tabular-nums text-ink-faint">
            {Math.min(index + 1, total)} / {total}
          </span>
        </div>
      )}
      <div className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-2xl mf-glass border border-line p-1.5 shadow-float pb-[env(safe-area-inset-bottom)]">
        <Button variant="ghost" size="icon-lg" onClick={prev} aria-label="이전">
          <ChevronLeft size={22} />
        </Button>
        <span className="min-w-[64px] text-center text-sm tabular-nums text-ink-soft">
          {Math.min(index + 1, total)} / {total}
        </span>
        <Button variant="ghost" size="icon-lg" onClick={next} aria-label="다음">
          <ChevronRight size={22} />
        </Button>
        <div className="mx-1 h-6 w-px bg-line" />
        <Button
          variant={reveal ? "primary" : "ghost"}
          size="icon-lg"
          onClick={() => setReveal(!reveal)}
          aria-label={reveal ? "단계 공개 끄기" : "단계 공개 켜기"}
          title="단계 공개: 진행한 단계까지만 노드 표시"
        >
          {reveal ? <Eye size={20} /> : <EyeOff size={20} />}
        </Button>
        <Button variant="ghost" size="icon-lg" onClick={close} aria-label="종료">
          <X size={22} />
        </Button>
      </div>
    </div>
  );
}

// ── Onboarding hint card ─────────────────────────────────────────────────────
function OnboardingHint({ mobile }: { mobile: boolean }) {
  const [show, setShow] = useState(false);
  const setDialog = useMindMapStore((s) => s.setDialog);
  const startTutorial = useMindMapStore((s) => s.startTutorial);

  useEffect(() => {
    try {
      if (!localStorage.getItem(ONBOARD_KEY)) setShow(true);
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className={cn(
            "pointer-events-auto absolute z-30 max-w-[300px] rounded-2xl border border-line mf-glass p-4 shadow-float",
            mobile ? "left-3 right-3 top-3 max-w-none" : "left-4 top-4"
          )}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Sparkles size={16} />
            </span>
            <span className="text-sm font-semibold text-ink">
              MindForge에 오신 걸 환영해요
            </span>
          </div>
          <p className="text-xs leading-relaxed text-ink-soft">
            {mobile
              ? "노드를 탭해서 선택하고 하단 버튼으로 자식을 추가하세요. 노드를 더블탭하면 제목을 편집할 수 있어요."
              : "노드를 더블클릭해 편집하고, Tab으로 자식을, Enter로 형제를 추가하세요. ⌘K로 모든 명령을 열 수 있어요."}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                dismiss();
                startTutorial();
              }}
            >
              튜토리얼 시작
            </Button>
            <Button
              size="sm"
              onClick={() => {
                dismiss();
                setDialog("shortcuts");
              }}
            >
              단축키
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              건너뛰기
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Slide-over wrapper for tablet panels ─────────────────────────────────────
function SlideOver({
  open,
  side,
  onClose,
  children,
}: {
  open: boolean;
  side: "left" | "right";
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-950/30"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: side === "left" ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: side === "left" ? "-100%" : "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 320 }}
            className={cn(
              "fixed top-0 z-[61] h-full",
              side === "left" ? "left-0" : "right-0"
            )}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── App shell ────────────────────────────────────────────────────────────────
export function AppShell() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isDesktop = useIsDesktop();

  const loadWorkspace = useMindMapStore((s) => s.loadWorkspace);
  const saveWorkspace = useMindMapStore((s) => s.saveWorkspace);
  const revision = useMindMapStore((s) => s.revision);
  const hydrated = useMindMapStore((s) => s.hydrated);
  const theme = useMindMapStore((s) => s.theme);
  const setTheme = useMindMapStore((s) => s.setTheme);
  const font = useMindMapStore((s) => s.font);

  const sidebarCollapsed = useMindMapStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useMindMapStore((s) => s.toggleSidebar);
  const inspectorOpen = useMindMapStore((s) => s.inspectorOpen);
  const setInspectorOpen = useMindMapStore((s) => s.setInspectorOpen);
  const presentationMode = useMindMapStore((s) => s.presentationMode);

  useKeyboardShortcuts();

  // Load once on mount.
  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // If the page was opened via a share link (#m=…), decode it into a NEW copy
  // (after the workspace has loaded), then strip the fragment so a refresh
  // doesn't re-import it. Runs once; the cleared hash makes any re-run a no-op.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const code = readShareCodeFromHash(window.location.hash);
    if (!code) return;
    try {
      useMindMapStore.getState().importSharedDocument(code);
    } finally {
      // Always strip the fragment — even if import throws — so a refresh never
      // re-imports and a poisoned link doesn't linger in the address bar.
      const { pathname, search } = window.location;
      window.history.replaceState(null, "", pathname + search);
    }
  }, []);

  // Debounced auto-save whenever the workspace changes.
  useDebouncedEffect(
    () => {
      if (hydrated) saveWorkspace();
    },
    [revision, hydrated],
    700
  );

  // Flush the pending autosave immediately when the tab is backgrounded or
  // closed. The debounce has a 700ms trailing delay, so on mobile a quick
  // edit-then-switch-away could otherwise lose the last change.
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

  // React to OS theme changes when in "system" mode.
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setTheme("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme, setTheme]);

  const showDesktopChrome = isDesktop && !presentationMode;
  const showTablet = isTablet && !presentationMode;

  return (
    <div
      className="flex h-[100dvh] w-full overflow-hidden bg-surface-base text-ink"
      style={{ fontFamily: fontFamilyFor(font) }}
    >
      {/* Desktop sidebar (inline) */}
      {showDesktopChrome && !sidebarCollapsed && <Sidebar />}

      {/* Main column */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {!presentationMode &&
          (isMobile ? (
            <MobileTopbar />
          ) : (
            <Topbar compact={isTablet} />
          ))}

        <div className="relative min-h-0 flex-1">
          <MindMapCanvas />

          {/* Bulk edit bar appears when multiple nodes are selected */}
          {!presentationMode && <BulkActionBar />}

          {/* Floating toolbar on desktop/tablet */}
          {!isMobile && !presentationMode && <FloatingToolbar />}

          {/* Onboarding */}
          {!presentationMode && <OnboardingHint mobile={isMobile} />}
        </div>

        {/* Mobile bottom action bar */}
        {isMobile && !presentationMode && <MobileBottomBar />}
      </main>

      {/* Desktop inspector (inline) */}
      {showDesktopChrome && inspectorOpen && <InspectorPanel />}

      {/* Tablet slide-overs */}
      {showTablet && (
        <>
          <SlideOver
            open={!sidebarCollapsed}
            side="left"
            onClose={toggleSidebar}
          >
            <Sidebar />
          </SlideOver>
          <SlideOver
            open={inspectorOpen}
            side="right"
            onClose={() => setInspectorOpen(false)}
          >
            <InspectorPanel asDrawer />
          </SlideOver>
        </>
      )}

      {/* Global overlays */}
      {isMobile ? <MobileCommandPalette /> : <CommandPalette />}
      {isMobile ? <MobileSearchOverlay /> : <SearchPanel />}
      <NodeContextMenu />
      <TemplateDialog />
      <ExportDialog />
      <ImportJsonDialog />
      <ShareDialog />
      <ShortcutDialog />
      <SnapshotDialog />
      <StatsDialog />

      {/* Mobile-only surfaces */}
      <MobileDocumentDrawer />
      <MobileNodeSheet />
      <MobileMoreMenu />

      {/* Presentation overlay */}
      {presentationMode && <PresentationControls />}

      <TutorialCoach />

      <ToastViewport />
    </div>
  );
}
