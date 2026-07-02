"use client";

import {
  ALargeSmall,
  BarChart3,
  Command,
  Download,
  History,
  Link2,
  Maximize,
  Monitor,
  Moon,
  PanelRight,
  Play,
  Redo2,
  Shapes,
  Sidebar as SidebarIcon,
  Sun,
  Type,
  Undo2,
} from "lucide-react";
import { useState } from "react";

import { DesignMenu } from "@/components/toolbar/DesignMenu";
import { FontSizeMenu } from "@/components/toolbar/FontSizeMenu";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { FONT_OPTIONS, LAYOUT_OPTIONS } from "@/lib/constants";
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
    <div className="hidden md:flex items-center gap-1.5 text-[11px] text-ink-faint">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          saveStatus === "saving" && "bg-amber-400 animate-pulse",
          saveStatus === "saved" && "bg-emerald-400",
          saveStatus === "error" && "bg-red-400",
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
  const font = useMindMapStore((s) => s.font);
  const setFont = useMindMapStore((s) => s.setFont);
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

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 mf-glass">
      {sidebarCollapsed && (
        <Tooltip label="사이드바 열기">
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            <SidebarIcon size={18} />
          </Button>
        </Tooltip>
      )}

      {/* Title */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (doc) renameDocument(doc.id, draft.trim() || doc.title);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (doc) renameDocument(doc.id, draft.trim() || doc.title);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 max-w-xs rounded-lg bg-surface-base border border-brand/50 px-2 py-1 text-sm font-semibold text-ink focus:outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setDraft(doc?.title ?? "");
              setEditing(true);
            }}
            className="truncate text-sm font-semibold text-ink hover:text-brand transition max-w-[40vw]"
            title="제목 클릭하여 수정"
          >
            {doc?.title ?? "MindForge"}
          </button>
        )}
        <SaveIndicator />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Tooltip label="실행 취소 (Ctrl+Z)">
          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={historyLen === 0}
            aria-label="실행 취소"
          >
            <Undo2 size={17} />
          </Button>
        </Tooltip>
        <Tooltip label="다시 실행 (Ctrl+Shift+Z)">
          <Button
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={futureLen === 0}
            aria-label="다시 실행"
          >
            <Redo2 size={17} />
          </Button>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-line" />

        <Dropdown
          align="right"
          width={230}
          trigger={
            <Button variant="ghost" size={compact ? "icon" : "sm"}>
              <Icon
                name={
                  LAYOUT_OPTIONS.find((l) => l.id === activeLayoutMode)?.icon ??
                  "ListTree"
                }
                size={16}
              />
              {!compact && <span>정렬</span>}
            </Button>
          }
          items={LAYOUT_OPTIONS.map((opt) => ({
            id: opt.id,
            label: opt.label,
            icon: <Icon name={opt.icon} size={15} />,
            active: opt.id === activeLayoutMode,
            onSelect: () => autoLayout(opt.id),
          }))}
        />

        <Tooltip label="화면 맞춤">
          <Button
            variant="ghost"
            size="icon"
            onClick={fitToView}
            aria-label="화면 맞춤"
          >
            <Maximize size={16} />
          </Button>
        </Tooltip>

        <Tooltip label={connectMode ? "연결 모드 종료" : "관계선 연결 모드"}>
          <Button
            variant={connectMode ? "primary" : "ghost"}
            size="icon"
            onClick={() => setConnectMode(!connectMode)}
            aria-label="관계선 연결 모드"
          >
            <Link2 size={16} />
          </Button>
        </Tooltip>

        <Tooltip label="스냅샷 (버전 기록)">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDialog("snapshots")}
            aria-label="스냅샷"
          >
            <History size={16} />
          </Button>
        </Tooltip>

        <Tooltip label="문서 통계">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDialog("stats")}
            aria-label="문서 통계"
          >
            <BarChart3 size={16} />
          </Button>
        </Tooltip>

        {!compact && (
          <Tooltip label="커맨드 팔레트 (Ctrl+K)">
            <Button variant="ghost" size="sm" onClick={openCommandPalette}>
              <Command size={15} />
              <span className="text-ink-faint">⌘K</span>
            </Button>
          </Tooltip>
        )}

        <DesignMenu
          trigger={
            <Button variant="ghost" size="icon" aria-label="디자인">
              <Shapes size={17} />
            </Button>
          }
        />

        <Dropdown
          align="right"
          width={200}
          trigger={
            <Button variant="ghost" size="icon" aria-label="폰트 변경">
              <Type size={17} />
            </Button>
          }
          items={FONT_OPTIONS.map((opt) => ({
            id: opt.id,
            label: opt.label,
            active: opt.id === font,
            onSelect: () => setFont(opt.id),
            icon: <span style={{ fontFamily: opt.family }}>가</span>,
          }))}
        />

        <FontSizeMenu
          trigger={
            <Button variant="ghost" size="icon" aria-label="레벨별 글자 크기">
              <ALargeSmall size={18} />
            </Button>
          }
        />

        <Dropdown
          align="right"
          width={200}
          trigger={
            <Tooltip label="내보내기">
              <Button variant="ghost" size="icon" aria-label="내보내기">
                <Download size={17} />
              </Button>
            </Tooltip>
          }
          items={[
            {
              id: "png",
              label: "PNG 이미지 저장",
              icon: <Icon name="Image" size={15} />,
              onSelect: () => exportImage("png"),
            },
            {
              id: "svg",
              label: "SVG 이미지 저장",
              icon: <Icon name="Image" size={15} />,
              onSelect: () => exportImage("svg"),
            },
            {
              id: "json",
              label: "JSON 내보내기",
              icon: <Icon name="FileJson" size={15} />,
              onSelect: () => setDialog("export"),
            },
            {
              id: "md",
              label: "Markdown 내보내기",
              icon: <Icon name="FileText" size={15} />,
              onSelect: () => setDialog("export"),
            },
          ]}
        />

        <div className="mx-1 h-5 w-px bg-line" />

        <Tooltip label="프레젠테이션">
          <Button
            variant="ghost"
            size="icon"
            onClick={openPresentationMode}
            aria-label="프레젠테이션 모드"
          >
            <Play size={16} />
          </Button>
        </Tooltip>
        <Tooltip label="테마 변경">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="테마 변경"
          >
            <ThemeIcon size={17} />
          </Button>
        </Tooltip>
        <Tooltip label="인스펙터 토글">
          <Button
            variant={inspectorOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={toggleInspector}
            aria-label="인스펙터 토글"
          >
            <PanelRight size={17} />
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}
