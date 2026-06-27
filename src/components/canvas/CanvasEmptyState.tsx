"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useMindMapStore } from "@/store/mindMapStore";

// Shown when the active document has no nodes (defensive — documents always
// ship with a root, but imports could be empty).
export function CanvasEmptyState() {
  const createDocument = useMindMapStore((s) => s.createDocument);
  const setDialog = useMindMapStore((s) => s.setDialog);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="pointer-events-auto flex flex-col items-center text-center max-w-sm px-6"
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/15 text-brand">
          <Sparkles size={26} />
        </div>
        <h2 className="text-lg font-semibold text-ink">빈 캔버스입니다</h2>
        <p className="mt-1 text-sm text-ink-soft">
          새 마인드맵을 만들거나 템플릿으로 빠르게 시작해보세요.
        </p>
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={() => createDocument()}>
            새 마인드맵
          </Button>
          <Button onClick={() => setDialog("template")}>템플릿 보기</Button>
        </div>
      </motion.div>
    </div>
  );
}
