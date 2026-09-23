"use client";

import { FileUp, Monitor, Moon, Plus, ShieldCheck, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentLibrary } from "@/components/home/DocumentLibrary";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { taskProgress } from "@/lib/documentLibrary";
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
  // Client-only (the date differs between build time and the visit).
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" }));
  }, []);
  const stats = useMemo(() => {
    let nodes = 0,
      open = 0;
    for (const d of documents) {
      nodes += d.nodes.length;
      open += taskProgress(d).remaining;
    }
    return { nodes, open };
  }, [documents]);

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
          <div className="flex shrink-0 items-center gap-2" aria-label="MindForge 홈">
            <BrandMark size={22} className="rounded-[6px]" />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">MindForge</span>
          </div>
          <nav aria-label="홈 탐색" className="flex items-center gap-0.5">
            <button type="button" onClick={showDocuments} className="mf-home-nav">문서</button>
            <button type="button" onClick={showTemplates} className="mf-home-nav">템플릿</button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`${themeLabel} 사용 중, 테마 전환`} title={`${themeLabel} 사용 중`}><ThemeIcon size={17} /></Button>
          </nav>
        </div>
      </header>

      <main className="mf-home-frame">
        <div className="mf-masthead">
          <div className="min-w-0">
            <p className="mf-overline">{today || " "}</p>
            <h1 data-home-heading tabIndex={-1} className="mf-display outline-none">생각의 대장간</h1>
            <p className="mf-stats">
              {documents.length
                ? <>마인드맵 <b>{documents.length}</b><i aria-hidden="true" />노드 <b>{stats.nodes}</b>{stats.open > 0 && <><i aria-hidden="true" />남은 할 일 <b>{stats.open}</b></>}</>
                : "아이디어 하나로 첫 마인드맵을 시작하세요."}
            </p>
          </div>
          <div className="mf-home-actions">
            <Button onClick={onImport}><FileUp size={16} /> 가져오기</Button>
            <Button variant="primary" onClick={() => onCreate("blank")}><Plus size={17} /> 새 마인드맵</Button>
          </div>
        </div>

        <div className="mf-home-grid">
          <DocumentLibrary documents={documents} onOpen={onOpenDocument} />

          <aside className="mf-home-aside" aria-labelledby="templates-heading">
            <h2 id="templates-heading" ref={templatesRef} tabIndex={-1} className="mf-aside-heading outline-none">새로 시작</h2>
            <ul className="mf-template-list">
              {TEMPLATES.map((template) => (
                <li key={template.id}>
                  <button type="button" className="mf-template-item" onClick={() => onCreate(template.id)}>
                    <Icon name={template.icon} size={16} />
                    <span className="min-w-0">
                      <span className="mf-template-name">{template.title}</span>
                      <span className="mf-template-desc">{template.description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mf-home-note"><ShieldCheck size={14} aria-hidden="true" />문서는 이 브라우저에만 저장되며 서버로 전송되지 않습니다.</p>
          </aside>
        </div>
      </main>
    </div>
  );
}
