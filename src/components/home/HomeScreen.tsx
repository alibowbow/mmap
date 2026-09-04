"use client";

import {
  ArrowRight,
  FileUp,
  GitFork,
  Monitor,
  Moon,
  Plus,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useMemo } from "react";

import { DocumentPreview } from "@/components/home/DocumentPreview";
import { DocumentLibrary } from "@/components/home/DocumentLibrary";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { TEMPLATES } from "@/lib/templates";
import { useMindMapStore } from "@/store/mindMapStore";
import type {
  MindMapDocument,
  TemplateType,
} from "@/types/mindmap";

const PREVIEW_COLORS = ["#f05c4f", "#4385f5", "#16a394", "#8b5cf6"];

const TEMPLATE_COLORS: Record<string, string> = {
  slate: "#94a3b8",
  indigo: "#6366f1",
  sky: "#0ea5e9",
  emerald: "#10b981",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  rose: "#f43f5e",
};

type HomeScreenProps = {
  onCreate: (template?: TemplateType) => void;
  onOpenDocument: (documentId: string) => void;
  onImport: () => void;
};

function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "최근 수정";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 2) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function TemplatePreview({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 92 42" className="h-9 w-full" aria-hidden="true">
      <path
        d="M14 21 C31 21 31 8 49 8 M14 21 C31 21 31 21 56 21 M14 21 C31 21 31 34 49 34"
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.82"
      />
      <rect
        x="3"
        y="15"
        width="18"
        height="12"
        rx="4"
        fill="rgb(var(--surface-raised))"
        stroke={color}
        strokeWidth="1.6"
      />
      {[8, 21, 34].map((y) => (
        <circle
          key={y}
          cx={y === 21 ? 56 : 49}
          cy={y}
          r="2.2"
          fill="rgb(var(--surface-raised))"
          stroke={color}
          strokeWidth="1.4"
        />
      ))}
    </svg>
  );
}

function RecentCard({
  document,
  color,
  onOpen,
  compact = false,
}: {
  document: MindMapDocument;
  color: string;
  onOpen: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-full min-h-[76px] w-full items-center gap-3 overflow-hidden rounded-2xl border bg-surface-raised/95 px-3.5 text-left shadow-[0_8px_28px_rgb(37_99_235/0.08)] transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-surface-overlay hover:shadow-soft"
      style={{ borderColor: `${color}b8` }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${color}18`, color }}
      >
        <GitFork size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-ink">
          {document.title}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[10px] text-ink-faint">
          <time dateTime={document.updatedAt}>{relativeTime(document.updatedAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{document.nodes.length} 노드</span>
        </span>
      </span>
      {!compact && (
        <DocumentPreview document={document} color={color} />
      )}
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition-transform group-hover:translate-x-0.5"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        <ArrowRight size={14} />
      </span>
    </button>
  );
}

const CONSTELLATION_POSITIONS = [
  "left-[54%] top-[3%] w-[43%]",
  "left-[67%] top-[35%] w-[31%]",
  "left-[56%] top-[70%] w-[41%]",
  "left-[3%] top-[68%] w-[40%]",
] as const;

const CONSTELLATION_PATHS = [
  "M 316 157 C 370 157 370 49 421 49",
  "M 316 157 C 375 157 397 142 480 142",
  "M 316 166 C 375 166 382 258 430 258",
  "M 294 166 C 244 166 238 257 191 257",
] as const;

function RecentConstellation({
  documents,
  onOpen,
}: {
  documents: MindMapDocument[];
  onOpen: (documentId: string) => void;
}) {
  return (
    <div className="relative hidden h-[340px] min-w-0 lg:block">
      <svg
        viewBox="0 0 680 330"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        {documents.slice(0, 4).map((document, index) => (
          <path
            key={document.id}
            d={CONSTELLATION_PATHS[index]}
            fill="none"
            stroke={PREVIEW_COLORS[index]}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ))}
        <path
          d="M 0 98 C 96 98 135 158 294 158"
          fill="none"
          stroke="#4385f5"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.55"
        />
      </svg>

      <div className="absolute left-[40%] top-[37%] z-10 flex h-[92px] w-[178px] items-center justify-center gap-2.5 rounded-[22px] border-2 border-[#4385f5] bg-surface-raised shadow-[0_12px_32px_rgb(37_99_235/0.16)]">
        <BrandMark size={34} className="rounded-[10px]" />
        <span className="text-[17px] font-extrabold tracking-[-0.035em] text-ink">MindForge</span>
        <span className="absolute -bottom-4 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[#4385f5] bg-surface-raised text-lg font-medium text-[#4385f5]">
          +
        </span>
      </div>

      {documents.slice(0, 4).map((document, index) => (
        <div key={document.id} className={`absolute z-20 h-[78px] ${CONSTELLATION_POSITIONS[index]}`}>
          <RecentCard
            document={document}
            color={PREVIEW_COLORS[index]}
            onOpen={() => onOpen(document.id)}
            compact
          />
        </div>
      ))}
    </div>
  );
}

function MobileRecentRail({
  documents,
  onOpen,
}: {
  documents: MindMapDocument[];
  onOpen: (documentId: string) => void;
}) {
  return (
    <div className="relative lg:hidden">
      <svg
        viewBox="0 0 620 70"
        preserveAspectRatio="none"
        className="pointer-events-none absolute left-0 top-[46px] h-14 w-[620px]"
        aria-hidden="true"
      >
        <path d="M0 35 C60 35 42 18 98 18 S178 52 224 35 S315 18 365 35 S456 52 510 35 S575 18 620 35" fill="none" stroke="#4385f5" strokeWidth="2" opacity="0.75" />
      </svg>
      <div className="mf-scroll relative flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 pt-2 sm:px-6">
        {documents.slice(0, 4).map((document, index) => (
          <div key={document.id} className="h-[86px] w-[270px] shrink-0 snap-start sm:w-[310px]">
            <RecentCard
              document={document}
              color={PREVIEW_COLORS[index]}
              onOpen={() => onOpen(document.id)}
              compact
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeScreen({
  onCreate,
  onOpenDocument,
  onImport,
}: HomeScreenProps) {
  const documents = useMindMapStore((state) => state.documents);
  const theme = useMindMapStore((state) => state.theme);
  const toggleTheme = useMindMapStore((state) => state.toggleTheme);

  const recent = useMemo(
    () =>
      [...documents]
        .sort((a, b) => {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
          return +new Date(b.updatedAt) - +new Date(a.updatedAt);
        })
        .slice(0, 4),
    [documents]
  );

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const themeLabel =
    theme === "dark" ? "어두운 테마" : theme === "light" ? "밝은 테마" : "시스템 테마";

  const showDocuments = () => {
    const heading = document.getElementById("documents-heading");
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  };

  return (
    <div className="mf-home min-h-[100dvh] bg-surface-raised text-ink">
      <header className="relative z-30 border-b border-line/80 bg-surface-raised/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-[62px] w-full max-w-[1240px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5" aria-label="MindForge 홈">
            <BrandMark size={30} className="rounded-[9px]" />
            <span className="text-[18px] font-bold tracking-[-0.03em] text-ink">
              MindForge
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={`${themeLabel} 사용 중, 테마 전환`}
              title={`${themeLabel} 사용 중`}
            >
              <ThemeIcon size={18} />
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full pb-8">
        <section className="relative overflow-hidden border-b border-blue-200/70 bg-surface-raised">
          <div className="mf-home-blueprint pointer-events-none absolute inset-y-0 right-0 hidden w-[68%] border-l border-blue-200/60 lg:block" />
          <svg viewBox="0 0 520 380" className="pointer-events-none absolute bottom-0 left-[24%] hidden h-full w-[28%] text-blue-500/30 lg:block" aria-hidden="true">
            <path d="M0 74 C190 74 120 180 312 180 S430 304 520 304" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <div className="mx-auto grid w-full max-w-[1240px] items-center px-4 sm:px-6 lg:min-h-[414px] lg:grid-cols-[0.34fr_0.66fr] lg:px-8">
          <div className="relative z-10 py-8 sm:py-10 lg:pr-8">
            <h1
              data-home-heading
              tabIndex={-1}
              className="text-[2.15rem] font-bold leading-[1.12] tracking-[-0.05em] text-ink outline-none sm:text-[2.65rem]"
            >
              생각을 펼치는 곳
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
              자유롭게 연결하고, 나만의 지도를 완성하세요.
            </p>
            <div className="mt-6 flex flex-col gap-2.5 min-[420px]:flex-row">
              <Button
                variant="primary"
                size="lg"
                onClick={() => onCreate("blank")}
                className="h-12 shadow-[0_10px_26px_rgb(79_70_229/0.22)] min-[420px]:min-w-[154px]"
              >
                <Plus size={18} /> 새 마인드맵
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={onImport}
                className="h-12"
              >
                <FileUp size={17} /> 가져오기
              </Button>
            </div>
            <div className="mt-6 flex items-center gap-2 text-[11px] text-ink-faint">
              <ShieldCheck size={14} className="text-brand" />
              계정 없이 이 브라우저에 자동 저장
            </div>
          </div>
          <RecentConstellation documents={recent} onOpen={onOpenDocument} />
          </div>

          <div className="mf-home-blueprint border-t border-blue-200/60 py-4 lg:hidden">
            <div className="mb-1 flex items-center justify-between px-4 sm:px-6">
              <h2 className="text-sm font-bold text-ink">최근 작업</h2>
              <button type="button" onClick={showDocuments} aria-controls="documents-list" className="flex h-11 items-center gap-1 px-1 text-xs font-semibold text-brand">
                전체 문서 <ArrowRight size={13} />
              </button>
            </div>
            <MobileRecentRail documents={recent} onOpen={onOpenDocument} />
          </div>
        </section>

        <section aria-labelledby="templates-heading" className="mf-template-tray relative z-10 -mt-px rounded-t-[38px] border-t border-amber-200/60 px-4 py-6 sm:px-6 lg:-mt-7 lg:px-8 lg:pt-8">
          <div className="mx-auto w-full max-w-[1240px]">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="templates-heading" className="text-lg font-bold tracking-[-0.025em] text-ink">템플릿으로 시작</h2>
              <span className="hidden text-xs text-ink-faint sm:block">구조를 고르고 바로 편집하세요</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
              {TEMPLATES.map((template) => {
                const color = TEMPLATE_COLORS[template.accent] ?? "#6366f1";
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => onCreate(template.id)}
                    className="group min-h-[104px] rounded-2xl border border-line/80 bg-surface-raised/90 p-3 text-left transition-[border-color,background-color,transform,box-shadow] hover:-translate-y-px hover:border-brand/35 hover:bg-surface-overlay hover:shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                        style={{ backgroundColor: `${color}14`, color }}
                      >
                        <Icon name={template.icon} size={16} />
                      </span>
                      <div className="w-[64px] opacity-80 transition-opacity group-hover:opacity-100">
                        <TemplatePreview color={color} />
                      </div>
                    </div>
                    <div className="mt-2 truncate text-xs font-semibold text-ink">
                      {template.title}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <DocumentLibrary documents={documents} onOpen={onOpenDocument} />
      </main>
    </div>
  );
}
