"use client";

import { ArrowRight, FileUp, Monitor, Moon, ShieldCheck, Sun } from "lucide-react";
import { useMemo, useRef } from "react";
import { DocumentLibrary } from "@/components/home/DocumentLibrary";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TEMPLATES } from "@/lib/templates";
import { useMindMapStore } from "@/store/mindMapStore";
import type { MindMapDocument, TemplateType } from "@/types/mindmap";

type HomeScreenProps = {
  onCreate: (template?: TemplateType) => void;
  onOpenDocument: (documentId: string) => void;
  onImport: () => void;
};

// Hand-drawn vignettes (cut from the hero illustration) that give each
// document and template a small picture of its own.
const DOC_ART = ["bird", "flowers", "mountain", "village", "boat", "globe", "compass", "sun", "bulb", "cat", "cloud", "leaf"];
const TEMPLATE_ART: Partial<Record<TemplateType, string>> = {
  blank: "sprout",
  "project-plan": "mountain",
  "research-map": "globe",
  "investment-thesis": "sun",
  "study-planner": "leaf",
  "meeting-notes": "people",
  "product-roadmap": "compass",
  "problem-solving": "bulb",
};
const FEATURED: TemplateType[] = ["project-plan", "research-map", "meeting-notes", "problem-solving"];

function artFor(doc: MindMapDocument): string {
  let h = 0;
  for (let i = 0; i < doc.id.length; i++) h = (h * 31 + doc.id.charCodeAt(i)) >>> 0;
  return DOC_ART[h % DOC_ART.length];
}
const art = (name: string) => `/home/${name}.webp`;
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

export function HomeScreen({ onCreate, onOpenDocument, onImport }: HomeScreenProps) {
  const documents = useMindMapStore((s) => s.documents);
  const theme = useMindMapStore((s) => s.theme);
  const toggleTheme = useMindMapStore((s) => s.toggleTheme);
  const templatesRef = useRef<HTMLHeadingElement>(null);
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeLabel = theme === "dark" ? "어두운 테마" : theme === "light" ? "밝은 테마" : "시스템 테마";
  const recent = useMemo(
    () => [...documents].sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)).slice(0, 3),
    [documents],
  );
  const featured = FEATURED.map((id) => TEMPLATES.find((t) => t.id === id)).filter((t) => !!t);

  const showDocuments = () => {
    const heading = document.getElementById("documents-heading");
    heading?.scrollIntoView({ block: "start", behavior: "smooth" });
    heading?.focus({ preventScroll: true });
  };
  const showTemplates = () => {
    templatesRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    templatesRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="mf-home min-h-[100dvh] text-ink">
      <header className="mf-home-header pt-[env(safe-area-inset-top)]">
        <div className="mf-home-frame flex h-16 items-center justify-between gap-3">
          <span className="mf-wordmark" aria-label="MindForge 홈">MindForge</span>
          <nav aria-label="홈 탐색" className="flex items-center">
            <button type="button" onClick={showDocuments} className="mf-home-nav">문서</button>
            <button type="button" onClick={showTemplates} className="mf-home-nav">템플릿</button>
            <button type="button" onClick={onImport} className="mf-home-nav">가져오기</button>
            <button type="button" onClick={toggleTheme} className="mf-home-nav" aria-label={`${themeLabel} 사용 중, 테마 전환`} title={`${themeLabel} 사용 중`}><ThemeIcon size={17} /></button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mf-hero mf-home-frame" aria-labelledby="home-title">
          <div className="mf-hero-copy">
            <h1 id="home-title" data-home-heading tabIndex={-1} className="mf-hero-title outline-none">생각을 펼치고<br />가능성을 잇다</h1>
            <p className="mf-hero-lede">흩어진 아이디어를 하나의 흐름으로.</p>
            <div className="mf-hero-actions">
              <button type="button" className="mf-cta" onClick={() => onCreate("blank")}>새 마인드맵 시작</button>
              {recent[0] && (
                <button type="button" className="mf-textlink" onClick={() => onOpenDocument(recent[0].id)}>
                  최근 작업 이어가기 <ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="mf-hero-note" aria-hidden="true">좋은 생각은<br />언제나, 어딘가에서<br />자라납니다.</p>
          </div>
          <div className="mf-hero-art">
            {/* eslint-disable-next-line @next/next/no-img-element -- static art, sized by CSS */}
            <img src={art("hero")} alt="" width={1125} height={918} fetchPriority="high" />
          </div>
        </section>

        <section className="mf-shelf mf-home-frame" aria-label="바로 가기">
          <div className="mf-shelf-recent">
            <h2 className="mf-shelf-heading">최근 작업</h2>
            {recent.length ? (
              <ul className="mf-shelf-docs">
                {recent.map((doc) => (
                  <li key={doc.id}>
                    <button type="button" className="mf-shelf-doc" onClick={() => onOpenDocument(doc.id)} aria-label={`${doc.title} 열기`}>
                      <span className="mf-shelf-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={art(artFor(doc))} alt="" loading="lazy" />
                      </span>
                      <span className="min-w-0">
                        <span className="mf-shelf-title">{doc.title}</span>
                        <time className="mf-shelf-date" dateTime={doc.updatedAt}>{shortDate(doc.updatedAt)}</time>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mf-shelf-empty">첫 마인드맵을 만들면 이곳에 나타납니다.</p>
            )}
          </div>
          <div className="mf-shelf-rule" aria-hidden="true" />
          <div className="mf-shelf-templates">
            <h2 className="mf-shelf-heading">추천 템플릿</h2>
            <ul className="mf-shelf-picks">
              {featured.map((t) => (
                <li key={t.id}>
                  <button type="button" className="mf-shelf-pick" onClick={() => onCreate(t.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={art(TEMPLATE_ART[t.id] ?? "sprout")} alt="" loading="lazy" />
                    <span>{t.title}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mf-shelf-more" onClick={showTemplates} aria-label="모든 템플릿 보기"><ArrowRight size={18} /></button>
          </div>
        </section>

        <div className="mf-library mf-home-frame">
          <DocumentLibrary documents={documents} onOpen={onOpenDocument} />
          <aside className="mf-home-aside" aria-labelledby="templates-heading">
            <h2 id="templates-heading" ref={templatesRef} tabIndex={-1} className="mf-aside-heading scroll-mt-20 outline-none">모든 템플릿</h2>
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
            <Button className="mt-5 w-full" onClick={onImport}><FileUp size={16} /> 파일 가져오기</Button>
            <p className="mf-home-note"><ShieldCheck size={14} aria-hidden="true" />문서는 이 브라우저에만 저장되며 서버로 전송되지 않습니다.</p>
          </aside>
        </div>
      </main>
    </div>
  );
}
