"use client";

import { AnimatePresence, motion } from "framer-motion";
import { GraduationCap, PartyPopper, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import { getRootNode } from "@/lib/tree";
import { useMindMapStore } from "@/store/mindMapStore";

type StepDef = {
  title: string;
  body: string;
  hint?: string;
};

const STEPS: StepDef[] = [
  {
    title: "주제 정하기",
    body: "가운데 중심 노드를 더블클릭(더블탭)해서 맵의 주제를 입력해 보세요.",
    hint: "입력 후 Enter 를 누르면 저장돼요.",
  },
  {
    title: "첫 가지 만들기",
    body: "중심 노드를 선택한 뒤 Tab 키(모바일은 하단 + 버튼)를 눌러 자식 노드를 추가해 보세요.",
  },
  {
    title: "아이디어 펼치기",
    body: "같은 방법으로 노드를 2개 더 추가해 보세요. Enter 는 형제 노드를 만들어요.",
  },
  {
    title: "노드 꾸미기",
    body: "노드 위 ⋯ 버튼(또는 우클릭)을 눌러 색상이나 이모지를 바꿔 보세요.",
  },
  {
    title: "자동 정렬",
    body: "상단 '정렬' 메뉴에서 다른 정렬(조직도·방사형 등)을 골라 맵을 정리해 보세요.",
  },
  {
    title: "발표 모드",
    body: "상단 재생(▶) 버튼을 눌러 발표 모드를 실행해 보세요. 방향키로 한 노드씩 짚어갈 수 있어요.",
  },
];

const DONE_STEP = STEPS.length; // 6 → completion card

type Baseline = {
  rootLabel: string;
  count: number;
  styleOf: Map<string, string>;
  layout: string;
};

export function TutorialCoach() {
  const step = useMindMapStore((s) => s.tutorialStep);
  const nodes = useMindMapStore((s) => s.nodes);
  const editingNodeId = useMindMapStore((s) => s.editingNodeId);
  const activeLayoutMode = useMindMapStore((s) => s.activeLayoutMode);
  const presentationMode = useMindMapStore((s) => s.presentationMode);
  const setStep = useMindMapStore((s) => s.setTutorialStep);
  const end = useMindMapStore((s) => s.endTutorial);

  // Baseline snapshot taken at the start of each step; progress is detected
  // by comparing live state against it.
  const base = useRef<Baseline | null>(null);
  useEffect(() => {
    if (step === null) {
      base.current = null;
      return;
    }
    const s = useMindMapStore.getState();
    base.current = {
      rootLabel: getRootNode(s.nodes)?.data.label ?? "",
      count: s.nodes.length,
      styleOf: new Map(
        s.nodes.map((n) => [n.id, `${n.data.color ?? ""}|${n.data.emoji ?? ""}`])
      ),
      layout: s.activeLayoutMode,
    };
  }, [step]);

  // Watch the store and advance when the step's goal is achieved.
  useEffect(() => {
    if (step === null || step >= DONE_STEP || !base.current) return;
    const b = base.current;
    const root = getRootNode(nodes);
    switch (step) {
      case 0:
        if (
          root &&
          !editingNodeId &&
          root.data.label.trim() &&
          root.data.label !== b.rootLabel
        ) {
          setStep(1);
        }
        break;
      case 1:
        if (nodes.length > b.count) setStep(2);
        break;
      case 2:
        if (nodes.length >= b.count + 2) setStep(3);
        break;
      case 3: {
        const changed = nodes.some((n) => {
          const prev = b.styleOf.get(n.id);
          return (
            prev !== undefined &&
            prev !== `${n.data.color ?? ""}|${n.data.emoji ?? ""}`
          );
        });
        if (changed) setStep(4);
        break;
      }
      case 4:
        if (activeLayoutMode !== b.layout) setStep(5);
        break;
      case 5:
        if (presentationMode) setStep(6);
        break;
    }
  }, [step, nodes, editingNodeId, activeLayoutMode, presentationMode, setStep]);

  if (step === null) return null;
  const done = step >= DONE_STEP;
  const def = done ? null : STEPS[step];

  return (
    <AnimatePresence>
      <motion.div
        key={step}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="fixed left-1/2 top-16 z-[95] w-[min(92vw,380px)] -translate-x-1/2 md:top-20"
      >
        <div className="rounded-2xl border border-brand/30 bg-surface-overlay/95 p-4 shadow-float backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
              {done ? <PartyPopper size={18} /> : <GraduationCap size={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {done ? "튜토리얼 완료! 🎉" : def!.title}
                </p>
                <button
                  onClick={end}
                  aria-label="튜토리얼 종료"
                  className="shrink-0 rounded-md p-1 text-ink-faint transition hover:bg-surface-raised hover:text-ink"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                {done
                  ? "기본기를 모두 익혔어요. 이제 자유롭게 생각을 펼쳐 보세요!"
                  : def!.body}
              </p>
              {!done && def!.hint && (
                <p className="mt-1 text-[11px] text-ink-faint">{def!.hint}</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            {/* Progress dots */}
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i < step
                      ? "w-1.5 bg-brand"
                      : i === step
                        ? "w-5 bg-brand"
                        : "w-1.5 bg-line"
                  )}
                />
              ))}
            </div>
            {done ? (
              <button
                onClick={end}
                className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                완료
              </button>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-faint transition hover:bg-surface-raised hover:text-ink"
              >
                이 단계 건너뛰기
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
