"use client";

import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { TEMPLATES } from "@/lib/templates";
import { useMindMapStore } from "@/store/mindMapStore";

export function TemplateDialog() {
  const open = useMindMapStore((s) => s.dialog === "template");
  const setDialog = useMindMapStore((s) => s.setDialog);
  const createDocument = useMindMapStore((s) => s.createDocument);

  return (
    <Modal
      open={open}
      onClose={() => setDialog(null)}
      title="템플릿으로 시작"
      description="자주 쓰는 구조로 빠르게 마인드맵을 만들어보세요."
      className="sm:max-w-2xl"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              createDocument(t.id);
              setDialog(null);
            }}
            className="group flex flex-col items-start gap-2 rounded-2xl border border-line bg-surface-base p-4 text-left transition hover:border-brand/50 hover:shadow-soft hover:-translate-y-0.5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand group-hover:scale-105 transition">
              <Icon name={t.icon} size={20} />
            </span>
            <span className="text-sm font-semibold text-ink">{t.title}</span>
            <span className="text-xs text-ink-soft leading-snug">
              {t.description}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
