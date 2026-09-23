"use client";

import { FileUp, Monitor, Moon, Plus, ShieldCheck, Sun } from "lucide-react";
import { useRef } from "react";
import { DocumentLibrary } from "@/components/home/DocumentLibrary";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TEMPLATES } from "@/lib/templates";
import { useMindMapStore } from "@/store/mindMapStore";
import type { TemplateType } from "@/types/mindmap";

type HomeScreenProps = {
  onCreate: (template?: TemplateType) => void;
  onOpenDocument: (documentId: string) => void;
  onImport: () => void;
};

export function HomeScreen({ onCreate, onOpenDocument, onImport }: HomeScreenProps) {
  const documents = useMindMapStore((s) => s.documents);
  const theme = useMindMapStore((s) => s.theme);
  const toggleTheme = useMindMapStore((s) => s.toggleTheme);
  const templatesRef = useRef<HTMLHeadingElement>(null);
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeLabel = theme === "dark" ? "어두운 테마" : theme === "light" ? "밝은 테마" : "시스템 테마";
  const showDocuments = () => {
    const heading = document.getElementById("documents-heading");
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  };
  const showTemplates = () => {
    templatesRef.current?.scrollIntoView({ block: "center" });
    templatesRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="mf-home min-h-[100dvh] text-ink">
      <header className="mf-home-header pt-[env(safe-area-inset-top)]">
        <div className="mf-home-frame flex h-14 items-center justify-between gap-3">
          <div className="flex shrink-0 items-center gap-2.5" aria-label="MindForge 홈">
            <BrandMark size={26} className="rounded-[8px]" />
            <span className="text-[15px] font-semibold tracking-tight">MindForge</span>
          </div>
          <nav aria-label="홈 탐색" className="flex items-center gap-1 sm:gap-3">
            <button type="button" onClick={showDocuments} className="mf-home-nav">내 문서</button>
            <button type="button" onClick={showTemplates} className="mf-home-nav">템플릿</button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`${themeLabel} 사용 중, 테마 전환`} title={`${themeLabel} 사용 중`}><ThemeIcon size={18} /></Button>
          </nav>
        </div>
      </header>
      <main className="mf-home-frame pb-10">
        <div className="mf-workspace-heading">
          <div>
            <h1 data-home-heading tabIndex={-1} className="text-[26px] font-semibold leading-tight tracking-[-0.03em] outline-none">내 마인드맵</h1>
            <p className="mt-1.5 text-sm text-ink-soft">{documents.length ? `문서 ${documents.length}개` : "아직 문서가 없습니다"}</p>
          </div>
          <div className="mf-home-actions">
            <Button onClick={onImport}><FileUp size={16} /> 가져오기</Button>
            <Button variant="primary" onClick={() => onCreate("blank")}><Plus size={17} /> 새 마인드맵</Button>
          </div>
        </div>

        <section aria-labelledby="templates-heading">
          <h2 id="templates-heading" ref={templatesRef} tabIndex={-1} className="mf-section-label mb-3 outline-none">템플릿으로 시작</h2>
          <div className="mf-template-row">
            {TEMPLATES.map((template) => (
              <button key={template.id} type="button" className="mf-template-choice" onClick={() => onCreate(template.id)}>
                <Icon name={template.icon} size={18} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{template.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-faint">{template.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <DocumentLibrary documents={documents} onOpen={onOpenDocument} />
        <footer className="mt-12 flex items-center gap-2 border-t border-line pt-5 text-xs text-ink-faint"><ShieldCheck size={14} />이 브라우저에 자동 저장</footer>
      </main>
    </div>
  );
}
