"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Droplet,
  FileImage,
  FileJson,
  Grid3x3,
  FilePlus2,
  FileText,
  GraduationCap,
  HelpCircle,
  History,
  Rainbow,
  Image as ImageIcon,
  LayoutTemplate,
  Palette,
  Paintbrush,
  Presentation,
  Ruler,
  Shapes,
  Spline,
  SunMoon,
  Type,
  Upload,
  Zap,
} from "lucide-react";

import {
  ACCENT_OPTIONS,
  CANVAS_BG_OPTIONS,
  EDGE_COLOR_OPTIONS,
  EDGE_STYLE_OPTIONS,
  EDGE_WIDTH_OPTIONS,
  FONT_OPTIONS,
  NODE_STYLE_OPTIONS,
} from "@/lib/constants";
import { useMindMapStore } from "@/store/mindMapStore";

// Compact 4-column tile: icon over a short label. Keeps the sheet small
// instead of one full-width row per action.
function Tile({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 transition active:bg-surface-overlay"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-overlay text-ink-soft">
        {icon}
      </span>
      <span className="text-center text-[10.5px] leading-tight text-ink-soft">
        {label}
      </span>
    </button>
  );
}

function Section({ title }: { title: string }) {
  return (
    <p className="px-1 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
      {title}
    </p>
  );
}

export function MobileMoreMenu() {
  const open = useMindMapStore((s) => s.mobileMoreOpen);
  const setOpen = useMindMapStore((s) => s.setMobileMoreOpen);
  const createDocument = useMindMapStore((s) => s.createDocument);
  const setDialog = useMindMapStore((s) => s.setDialog);
  const openPresentationMode = useMindMapStore((s) => s.openPresentationMode);
  const toggleTheme = useMindMapStore((s) => s.toggleTheme);
  const exportImage = useMindMapStore((s) => s.exportImage);
  const setImportTab = useMindMapStore((s) => s.setImportTab);
  const font = useMindMapStore((s) => s.font);
  const setFont = useMindMapStore((s) => s.setFont);
  const nodeStyle = useMindMapStore((s) => s.nodeStyle);
  const setNodeStyle = useMindMapStore((s) => s.setNodeStyle);
  const edgeStyle = useMindMapStore((s) => s.edgeStyle);
  const setEdgeStyle = useMindMapStore((s) => s.setEdgeStyle);
  const edgeWidth = useMindMapStore((s) => s.edgeWidth);
  const setEdgeWidth = useMindMapStore((s) => s.setEdgeWidth);
  const edgeColorMode = useMindMapStore((s) => s.edgeColorMode);
  const setEdgeColorMode = useMindMapStore((s) => s.setEdgeColorMode);
  const edgeAnimated = useMindMapStore((s) => s.edgeAnimated);
  const setEdgeAnimated = useMindMapStore((s) => s.setEdgeAnimated);
  const nodeTint = useMindMapStore((s) => s.nodeTint);
  const setNodeTint = useMindMapStore((s) => s.setNodeTint);
  const canvasBg = useMindMapStore((s) => s.canvasBg);
  const setCanvasBg = useMindMapStore((s) => s.setCanvasBg);
  const accent = useMindMapStore((s) => s.accent);
  const setAccent = useMindMapStore((s) => s.setAccent);
  const startTutorial = useMindMapStore((s) => s.startTutorial);
  const rainbowBranches = useMindMapStore((s) => s.rainbowBranches);
  const setRainbowBranches = useMindMapStore((s) => s.setRainbowBranches);
  const addToast = useMindMapStore((s) => s.addToast);

  const close = () => setOpen(false);

  // Cycle through the available fonts and surface the new one via a toast.
  const cycleFont = () => {
    const idx = FONT_OPTIONS.findIndex((f) => f.id === font);
    const next = FONT_OPTIONS[(idx + 1) % FONT_OPTIONS.length];
    setFont(next.id);
    addToast(`폰트: ${next.label}`, "info");
  };

  const cycleNodeStyle = () => {
    const idx = NODE_STYLE_OPTIONS.findIndex((s) => s.id === nodeStyle);
    const next = NODE_STYLE_OPTIONS[(idx + 1) % NODE_STYLE_OPTIONS.length];
    setNodeStyle(next.id);
    addToast(`노드 스타일: ${next.label}`, "info");
  };

  const cycleEdgeStyle = () => {
    const idx = EDGE_STYLE_OPTIONS.findIndex((s) => s.id === edgeStyle);
    const next = EDGE_STYLE_OPTIONS[(idx + 1) % EDGE_STYLE_OPTIONS.length];
    setEdgeStyle(next.id);
    addToast(`엣지 모양: ${next.label}`, "info");
  };

  const cycleEdgeWidth = () => {
    const idx = EDGE_WIDTH_OPTIONS.findIndex((o) => o.value === edgeWidth);
    const next = EDGE_WIDTH_OPTIONS[(idx + 1) % EDGE_WIDTH_OPTIONS.length];
    setEdgeWidth(next.value);
    addToast(`엣지 두께: ${next.label}`, "info");
  };

  const cycleEdgeColor = () => {
    const idx = EDGE_COLOR_OPTIONS.findIndex((o) => o.id === edgeColorMode);
    const next = EDGE_COLOR_OPTIONS[(idx + 1) % EDGE_COLOR_OPTIONS.length];
    setEdgeColorMode(next.id);
    addToast(`엣지 색: ${next.label}`, "info");
  };

  const toggleEdgeAnimated = () => {
    setEdgeAnimated(!edgeAnimated);
    addToast(edgeAnimated ? "엣지 애니메이션 해제" : "엣지 애니메이션 적용", "info");
  };

  const toggleTint = () => {
    setNodeTint(!nodeTint);
    addToast(nodeTint ? "색 채움 해제" : "색 채움 적용", "info");
  };

  const cycleCanvasBg = () => {
    const idx = CANVAS_BG_OPTIONS.findIndex((o) => o.id === canvasBg);
    const next = CANVAS_BG_OPTIONS[(idx + 1) % CANVAS_BG_OPTIONS.length];
    setCanvasBg(next.id);
    addToast(`캔버스 배경: ${next.label}`, "info");
  };

  const cycleAccent = () => {
    const idx = ACCENT_OPTIONS.findIndex((o) => o.id === accent);
    const next = ACCENT_OPTIONS[(idx + 1) % ACCENT_OPTIONS.length];
    setAccent(next.id);
    addToast(`테마 색상: ${next.label}`, "info");
  };

  const toggleRainbow = () => {
    setRainbowBranches(!rainbowBranches);
    addToast(
      rainbowBranches ? "가지 자동 색상 해제" : "가지 자동 색상 적용",
      "info"
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-slate-950/40 backdrop-blur-sm"
            onClick={close}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[121] rounded-t-3xl border-t border-line bg-surface-raised p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-float"
          >
            <div className="flex items-center justify-center pb-1 pt-1">
              <div className="h-1.5 w-10 rounded-full bg-ink-faint/40" />
            </div>
            <div className="max-h-[70vh] overflow-y-auto overscroll-contain mf-scroll pb-1">
              <Section title="문서 · 파일" />
              <div className="grid grid-cols-4 gap-0.5">
                <Tile
                  icon={<FilePlus2 size={18} />}
                  label="새 문서"
                  onClick={() => {
                    createDocument();
                    close();
                  }}
                />
                <Tile
                  icon={<LayoutTemplate size={18} />}
                  label="템플릿"
                  onClick={() => setDialog("template")}
                />
                <Tile
                  icon={<ImageIcon size={18} />}
                  label="PNG 저장"
                  onClick={() => {
                    close();
                    exportImage("png");
                  }}
                />
                <Tile
                  icon={<FileImage size={18} />}
                  label="SVG 저장"
                  onClick={() => {
                    close();
                    exportImage("svg");
                  }}
                />
                <Tile
                  icon={<FileJson size={18} />}
                  label="내보내기"
                  onClick={() => setDialog("export")}
                />
                <Tile
                  icon={<Upload size={18} />}
                  label="JSON 열기"
                  onClick={() => {
                    setImportTab("json");
                    setDialog("import");
                  }}
                />
                <Tile
                  icon={<FileText size={18} />}
                  label="아웃라인"
                  onClick={() => {
                    setImportTab("outline");
                    setDialog("import");
                  }}
                />
              </div>

              <Section title="디자인" />
              <div className="grid grid-cols-4 gap-0.5">
                <Tile
                  icon={<Shapes size={18} />}
                  label="노드 스타일"
                  onClick={cycleNodeStyle}
                />
                <Tile
                  icon={<Spline size={18} />}
                  label="엣지 모양"
                  onClick={cycleEdgeStyle}
                />
                <Tile
                  icon={<Ruler size={18} />}
                  label="엣지 두께"
                  onClick={cycleEdgeWidth}
                />
                <Tile
                  icon={<Paintbrush size={18} />}
                  label="엣지 색"
                  onClick={cycleEdgeColor}
                />
                <Tile
                  icon={<Zap size={18} />}
                  label="애니메이션"
                  onClick={toggleEdgeAnimated}
                />
                <Tile
                  icon={<Palette size={18} />}
                  label="색 채움"
                  onClick={toggleTint}
                />
                <Tile
                  icon={<Grid3x3 size={18} />}
                  label="배경"
                  onClick={cycleCanvasBg}
                />
                <Tile
                  icon={<Droplet size={18} />}
                  label="테마 색상"
                  onClick={cycleAccent}
                />
                <Tile
                  icon={<Type size={18} />}
                  label="폰트"
                  onClick={cycleFont}
                />
                <Tile
                  icon={<SunMoon size={18} />}
                  label="라이트/다크"
                  onClick={() => {
                    toggleTheme();
                    close();
                  }}
                />
              </div>

              <Section title="보기 · 도움말" />
              <div className="grid grid-cols-4 gap-0.5">
                <Tile
                  icon={<Presentation size={18} />}
                  label="발표 모드"
                  onClick={() => {
                    close();
                    openPresentationMode();
                  }}
                />
                <Tile
                  icon={<History size={18} />}
                  label="스냅샷"
                  onClick={() => setDialog("snapshots")}
                />
                <Tile
                  icon={<BarChart3 size={18} />}
                  label="통계"
                  onClick={() => setDialog("stats")}
                />
                <Tile
                  icon={<Rainbow size={18} />}
                  label="가지 색상"
                  onClick={toggleRainbow}
                />
                <Tile
                  icon={<GraduationCap size={18} />}
                  label="튜토리얼"
                  onClick={() => {
                    close();
                    startTutorial();
                  }}
                />
                <Tile
                  icon={<HelpCircle size={18} />}
                  label="도움말"
                  onClick={() => setDialog("shortcuts")}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
