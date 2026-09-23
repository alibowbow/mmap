"use client";

import { ArrowRight, ChevronDown, FileUp, LayoutGrid, Monitor, Moon, Plus, ShieldCheck, Sun } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { DocumentPreview } from "@/components/home/DocumentPreview";
import { DocumentLibrary } from "@/components/home/DocumentLibrary";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TEMPLATES } from "@/lib/templates";
import { useMindMapStore } from "@/store/mindMapStore";
import type { TemplateType } from "@/types/mindmap";

const TEMPLATE_COLORS: Record<string, string> = {
  slate: "#64748b", indigo: "#5362cd", sky: "#2280b8", emerald: "#168573",
  violet: "#8b5cf6", amber: "#b87914", cyan: "#138898", rose: "#d45869",
};

type HomeScreenProps = {
  onCreate: (template?: TemplateType) => void;
  onOpenDocument: (documentId: string) => void;
  onImport: () => void;
};

export function HomeScreen({ onCreate, onOpenDocument, onImport }: HomeScreenProps) {
  const documents = useMindMapStore((s) => s.documents);
  const theme = useMindMapStore((s) => s.theme);
  const toggleTheme = useMindMapStore((s) => s.toggleTheme);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templatesRef = useRef<HTMLHeadingElement>(null);
  const recent = useMemo(() => [...documents].sort((a, b) =>
    (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)
  )[0], [documents]);
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeLabel = theme === "dark" ? "어두운 테마" : theme === "light" ? "밝은 테마" : "시스템 테마";
  const showDocuments = () => {
    const heading = document.getElementById("documents-heading");
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  };
  const showTemplates = () => {
    setTemplatesOpen(true);
    templatesRef.current?.scrollIntoView({ block: "center" });
    templatesRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="mf-home min-h-[100dvh] text-ink">
      <header className="mf-home-header pt-[env(safe-area-inset-top)]">
        <div className="mf-home-frame flex h-16 items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-2.5" aria-label="MindForge 홈">
            <BrandMark size={30} className="rounded-[9px]" />
            <span className="text-lg font-bold tracking-tight">MindForge</span>
          </div>
          <nav aria-label="홈 탐색" className="flex items-center gap-1 sm:gap-3">
            <button type="button" onClick={showDocuments} className="mf-home-nav">내 문서</button>
            <button type="button" onClick={showTemplates} className="mf-home-nav mf-template-nav">템플릿</button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`${themeLabel} 사용 중, 테마 전환`} title={`${themeLabel} 사용 중`}><ThemeIcon size={18} /></Button>
          </nav>
        </div>
      </header>
      <main className="mf-home-frame pb-8">
        <div className="mf-workspace-heading">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">Workspace</p>
            <h1 data-home-heading tabIndex={-1} className="text-[26px] font-bold leading-tight tracking-[-0.045em] outline-none sm:text-[32px]">내 생각의 지도</h1>
          </div>
          <div className="mf-home-actions">
            <Button variant="primary" onClick={() => onCreate("blank")}><Plus size={18} /> 새 마인드맵</Button>
            <Button onClick={onImport}><FileUp size={17} /> 가져오기</Button>
          </div>
        </div>

        <div className="mf-launchpad">
          <section aria-labelledby="recent-heading" className="mf-recent-map mf-home-blueprint">
            {recent ? <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium text-ink-soft">최근 작업</p>
                  <h2 id="recent-heading" className="truncate text-lg font-bold tracking-tight" title={recent.title}>{recent.title}</h2>
                </div>
                <span className="shrink-0 rounded-md border border-line/70 bg-surface-raised/70 px-2 py-1 text-[11px] text-ink-soft">{recent.nodes.length} 노드</span>
              </div>
              <button type="button" className="mf-featured-preview" onClick={() => onOpenDocument(recent.id)} aria-label={`${recent.title} 미리보기에서 열기`}>
                <DocumentPreview document={recent} color="#4385f5" />
              </button>
              <div className="flex items-center justify-between gap-3 border-t border-line/60 pt-3">
                <span className="text-[11px] text-ink-soft">핵심 가지 미리보기</span>
                <Button className="bg-surface-raised" onClick={() => onOpenDocument(recent.id)}>이어서 열기 <ArrowRight size={16} /></Button>
              </div>
            </> : <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8 text-center">
              <BrandMark size={48} />
              <h2 id="recent-heading" className="text-xl font-bold">첫 생각을 펼쳐보세요</h2>
              <p className="text-sm text-ink-soft">빈 맵이나 템플릿으로 시작할 수 있어요.</p>
              <Button onClick={() => onCreate("blank")}>첫 맵 만들기 <ArrowRight size={16} /></Button>
            </div>}
          </section>

          <section className="mf-template-shelf" aria-labelledby="templates-heading" data-expanded={templatesOpen}>
            <h2 id="templates-heading" ref={templatesRef} tabIndex={-1} className="outline-none">
              <span className="mf-template-title">템플릿으로 시작 <span className="text-xs font-normal text-ink-soft">{TEMPLATES.length}</span></span>
              <button type="button" aria-expanded={templatesOpen} aria-controls="home-templates" onClick={() => setTemplatesOpen((open) => !open)} className="mf-template-toggle">
                <span className="flex items-center gap-2"><LayoutGrid size={17} /> 템플릿으로 시작 <span className="text-xs font-normal text-ink-soft">{TEMPLATES.length}</span></span>
                <ChevronDown size={17} className={templatesOpen ? "rotate-180" : ""} />
              </button>
            </h2>
            <div id="home-templates" className="mf-template-grid">
              {TEMPLATES.map((template) => {
                const color = TEMPLATE_COLORS[template.accent] ?? "#5362cd";
                return <button key={template.id} type="button" className="mf-template-choice" onClick={() => onCreate(template.id)}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}12`, color }}><Icon name={template.icon} size={19} /></span>
                  <span className="min-w-0"><span className="block text-xs font-semibold">{template.title}</span><span className="mt-1 block text-[10px] leading-relaxed text-ink-soft">{template.description}</span></span>
                </button>;
              })}
            </div>
          </section>
        </div>
        <DocumentLibrary documents={documents} onOpen={onOpenDocument} />
        <footer className="mt-8 flex items-center gap-2 border-t border-line pt-5 text-xs text-ink-faint"><ShieldCheck size={14} />이 브라우저에 자동 저장</footer>
      </main>
    </div>
  );
}
