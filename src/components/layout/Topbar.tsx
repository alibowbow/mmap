"use client";

import {
  BarChart3,
  ChevronDown,
  Command,
  Download,
  History,
  LayoutGrid,
  Link2,
  Maximize,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelRight,
  Play,
  Redo2,
  Shapes,
  Share2,
  Sidebar as SidebarIcon,
  Sun,
  Undo2,
} from "lucide-react";
import { useState } from "react";

import { DesignMenu } from "@/components/toolbar/DesignMenu";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { LAYOUT_OPTIONS } from "@/lib/constants";
import {
  selectActiveDocument,
  useMindMapStore,
} from "@/store/mindMapStore";

function SaveIndicator() {
  const saveStatus = useMindMapStore((s) => s.saveStatus);
  const lastSavedAt = useMindMapStore((s) => s.lastSavedAt);

  const label =
    saveStatus === "saving"
      ? "저장 중…"
      : saveStatus === "error"
        ? "저장 실패"
        : lastSavedAt
          ? `저장됨 · ${new Date(lastSavedAt).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : "자동 저장";

  return (
    <div className="hidden 2xl:flex items-center gap-1.5 text-[11px] text-ink-faint">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          saveStatus === "saving" && "animate-pulse bg-amber-500",
          saveStatus === "saved" && "bg-emerald-500",
          saveStatus === "error" && "bg-red-500",
          saveStatus === "idle" && "bg-ink-faint"
        )}
      />
      {label}
    </div>
  );
}

export function Topbar({ compact = false }: { compact?: boolean }) {
  const doc = useMindMapStore(selectActiveDocument);
  const sidebarCollapsed = useMindMapStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useMindMapStore((s) => s.toggleSidebar);
  const toggleInspector = useMindMapStore((s) => s.toggleInspector);
  const setInspectorOpen = useMindMapStore((s) => s.setInspectorOpen);
  const inspectorOpen = useMindMapStore((s) => s.inspectorOpen);
  const renameDocument = useMindMapStore((s) => s.renameDocument);
  const connectMode = useMindMapStore((s) => s.connectMode);
  const setConnectMode = useMindMapStore((s) => s.setConnectMode);
  const undo = useMindMapStore((s) => s.undo);
  const redo = useMindMapStore((s) => s.redo);
  const historyLen = useMindMapStore((s) => s.history.length);
  const futureLen = useMindMapStore((s) => s.future.length);
  const theme = useMindMapStore((s) => s.theme);
  const toggleTheme = useMindMapStore((s) => s.toggleTheme);
  const autoLayout = useMindMapStore((s) => s.autoLayout);
  const activeLayoutMode = useMindMapStore((s) => s.activeLayoutMode);
  const fitToView = useMindMapStore((s) => s.fitToView);
  const openCommandPalette = useMindMapStore((s) => s.openCommandPalette);
  const openPresentationMode = useMindMapStore((s) => s.openPresentationMode);
  const exportImage = useMindMapStore((s) => s.exportImage);
  const setDialog = useMindMapStore((s) => s.setDialog);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const activeLayout =
    LAYOUT_OPTIONS.find((layout) => layout.id === activeLayoutMode) ??
    LAYOUT_OPTIONS[0];

  const toggleDocuments = () => {
    const opening = sidebarCollapsed;
    if (compact && opening && inspectorOpen) setInspectorOpen(false);
    toggleSidebar();
  };

  const toggleDetails = () => {
    const opening = !inspectorOpen;
    if (compact && opening && !sidebarCollapsed) toggleSidebar();
    toggleInspector();
  };

  return (
    <header className="relative z-[60] flex h-[60px] shrink-0 items-center gap-2 border-b border-line bg-surface-raised/95 px-2.5 shadow-[0_1px_0_rgb(var(--line)/0.45)] backdrop-blur-md">
      <Tooltip label={sidebarCollapsed ? "문서 패널 열기" : "문서 패널 닫기"}>
        <Button
          variant={sidebarCollapsed ? "ghost" : "subtle"}
          size="icon"
          onClick={toggleDocuments}
          aria-label={sidebarCollapsed ? "문서 패널 열기" : "문서 패널 닫기"}
        >
          <SidebarIcon size={18} />
        </Button>
      </Tooltip>

      <BrandMark size={25} className="hidden shrink-0 rounded-lg sm:block" />

      <div className="flex min-w-[8rem] flex-1 items-center gap-2 overflow-hidden">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (doc) renameDocument(doc.id, draft.trim() || doc.title);
              setEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                if (doc) renameDocument(doc.id, draft.trim() || doc.title);
                setEditing(false);
              }
              if (event.key === "Escape") setEditing(false);
            }}
            className="h-9 min-w-0 max-w-sm flex-1 rounded-xl border border-brand/50 bg-surface-base px-3 text-sm font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink-soft"
          />
        ) : (
          <button
            onClick={() => {
              setDraft(doc?.title ?? "");
              setEditing(true);
            }}
            className="min-w-0 truncate text-left text-sm font-semibold text-ink transition-colors hover:text-brand"
            title="제목을 클릭해 수정"
          >
            {doc?.title ?? "MindForge"}
          </button>
        )}
        <SaveIndicator />
      </div>

      <div className="flex shrink-0 items-center gap-1 rounded-[14px] border border-line/80 bg-surface-sunken/70 p-1">
        <Tooltip label="실행 취소 (Ctrl+Z)">
          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={historyLen === 0}
            aria-label="실행 취소"
            className="h-8 w-8 rounded-[10px]"
          >
            <Undo2 size={16} />
          </Button>
        </Tooltip>
        <Tooltip label="다시 실행 (Ctrl+Shift+Z)">
          <Button
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={futureLen === 0}
            aria-label="다시 실행"
            className="h-8 w-8 rounded-[10px]"
          >
            <Redo2 size={16} />
          </Button>
        </Tooltip>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip label="노드를 겹치지 않게 자동 배열">
          <Button
            variant="secondary"
            size={compact ? "icon" : "sm"}
            onClick={() => autoLayout()}
            aria-label="겹침 없이 자동 배열"
            className="border-brand/30 bg-brand/10 text-brand"
          >
            <LayoutGrid size={16} />
            {!compact && <span>자동 배열</span>}
          </Button>
        </Tooltip>

        <Dropdown
          align="right"
          width={226}
          trigger={
            <Tooltip label={`배열 방식: ${activeLayout.label}`}>
              <Button variant="ghost" size="icon" aria-label="배열 방식 선택">
                <Icon name={activeLayout.icon} size={16} />
                <ChevronDown size={11} className="-ml-1" />
              </Button>
            </Tooltip>
          }
          items={LAYOUT_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            icon: <Icon name={option.icon} size={15} />,
            active: option.id === activeLayoutMode,
            onSelect: () => autoLayout(option.id),
          }))}
        />

        <Tooltip label="전체 지도를 화면에 맞춤">
          <Button variant="ghost" size="icon" onClick={fitToView} aria-label="화면 맞춤">
            <Maximize size={17} />
          </Button>
        </Tooltip>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <DesignMenu
          trigger={
            <Button variant="ghost" size={compact ? "icon" : "sm"} aria-label="지도 디자인">
              <Shapes size={17} />
              {!compact && <span>디자인</span>}
            </Button>
          }
        />

        <Button
          variant="primary"
          size={compact ? "icon" : "sm"}
          onClick={() => setDialog("share")}
          aria-label="링크로 공유"
        >
          <Share2 size={16} />
          {!compact && <span>공유</span>}
        </Button>

        <Dropdown
          align="right"
          width={238}
          trigger={
            <Tooltip label="더 많은 도구">
              <Button variant="ghost" size="icon" aria-label="더 많은 도구">
                <MoreHorizontal size={18} />
              </Button>
            </Tooltip>
          }
          items={[
            {
              id: "commands",
              label: "명령 팔레트",
              icon: <Command size={16} />,
              onSelect: openCommandPalette,
            },
            {
              id: "connect",
              label: connectMode ? "관계선 연결 종료" : "관계선 연결",
              icon: <Link2 size={16} />,
              active: connectMode,
              onSelect: () => setConnectMode(!connectMode),
            },
            {
              id: "snapshots",
              label: "버전 기록",
              icon: <History size={16} />,
              onSelect: () => setDialog("snapshots"),
            },
            {
              id: "stats",
              label: "문서 통계",
              icon: <BarChart3 size={16} />,
              onSelect: () => setDialog("stats"),
            },
            {
              id: "presentation",
              label: "프레젠테이션",
              icon: <Play size={16} />,
              onSelect: openPresentationMode,
            },
            {
              id: "theme",
              label: "밝기 테마 전환",
              icon: <ThemeIcon size={16} />,
              onSelect: toggleTheme,
            },
            {
              id: "png",
              label: "PNG 이미지 저장",
              icon: <Download size={16} />,
              onSelect: () => exportImage("png"),
            },
            {
              id: "svg",
              label: "SVG 이미지 저장",
              icon: <Icon name="Image" size={16} />,
              onSelect: () => exportImage("svg"),
            },
            {
              id: "export",
              label: "데이터 내보내기",
              icon: <Icon name="FileJson" size={16} />,
              onSelect: () => setDialog("export"),
            },
          ]}
        />

        <Tooltip label={inspectorOpen ? "편집 패널 닫기" : "편집 패널 열기"}>
          <Button
            variant={inspectorOpen ? "subtle" : "ghost"}
            size="icon"
            onClick={toggleDetails}
            aria-label={inspectorOpen ? "편집 패널 닫기" : "편집 패널 열기"}
          >
            <PanelRight size={18} />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
