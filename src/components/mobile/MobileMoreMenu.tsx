"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Droplet,
  FileImage,
  FileJson,
  Grid3x3,
  FilePlus2,
  FileText,
  HelpCircle,
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

function Row({
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
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm text-ink transition active:bg-surface-overlay"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-overlay text-ink-soft">
        {icon}
      </span>
      {label}
    </button>
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
            <div className="flex items-center justify-center pb-2 pt-1">
              <div className="h-1.5 w-10 rounded-full bg-ink-faint/40" />
            </div>
            <div className="grid grid-cols-1 gap-0.5">
              <Row
                icon={<FilePlus2 size={18} />}
                label="새 문서"
                onClick={() => {
                  createDocument();
                  close();
                }}
              />
              <Row
                icon={<LayoutTemplate size={18} />}
                label="템플릿"
                onClick={() => setDialog("template")}
              />
              <Row
                icon={<ImageIcon size={18} />}
                label="PNG 이미지 저장"
                onClick={() => {
                  close();
                  exportImage("png");
                }}
              />
              <Row
                icon={<FileImage size={18} />}
                label="SVG 이미지 저장"
                onClick={() => {
                  close();
                  exportImage("svg");
                }}
              />
              <Row
                icon={<FileJson size={18} />}
                label="JSON / Markdown 내보내기"
                onClick={() => setDialog("export")}
              />
              <Row
                icon={<Upload size={18} />}
                label="JSON 가져오기"
                onClick={() => {
                  setImportTab("json");
                  setDialog("import");
                }}
              />
              <Row
                icon={<FileText size={18} />}
                label="텍스트/아웃라인 가져오기"
                onClick={() => {
                  setImportTab("outline");
                  setDialog("import");
                }}
              />
              <Row
                icon={<Presentation size={18} />}
                label="프레젠테이션 모드"
                onClick={() => {
                  close();
                  openPresentationMode();
                }}
              />
              <Row
                icon={<Shapes size={18} />}
                label="노드 스타일"
                onClick={cycleNodeStyle}
              />
              <Row
                icon={<Spline size={18} />}
                label="엣지 모양"
                onClick={cycleEdgeStyle}
              />
              <Row
                icon={<Ruler size={18} />}
                label="엣지 두께"
                onClick={cycleEdgeWidth}
              />
              <Row
                icon={<Paintbrush size={18} />}
                label="엣지 색"
                onClick={cycleEdgeColor}
              />
              <Row
                icon={<Zap size={18} />}
                label="엣지 애니메이션"
                onClick={toggleEdgeAnimated}
              />
              <Row
                icon={<Palette size={18} />}
                label="색 채움(틴트)"
                onClick={toggleTint}
              />
              <Row
                icon={<Grid3x3 size={18} />}
                label="캔버스 배경"
                onClick={cycleCanvasBg}
              />
              <Row
                icon={<Droplet size={18} />}
                label="테마 색상"
                onClick={cycleAccent}
              />
              <Row
                icon={<Type size={18} />}
                label="폰트 변경"
                onClick={cycleFont}
              />
              <Row
                icon={<SunMoon size={18} />}
                label="테마 변경"
                onClick={() => {
                  toggleTheme();
                  close();
                }}
              />
              <Row
                icon={<HelpCircle size={18} />}
                label="도움말 / 단축키"
                onClick={() => setDialog("shortcuts")}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
