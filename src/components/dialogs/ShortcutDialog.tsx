"use client";

import { Modal } from "@/components/ui/Modal";
import { isMac, SHORTCUT_GROUPS } from "@/lib/keyboard";
import { useMindMapStore } from "@/store/mindMapStore";

function Key({ k }: { k: string }) {
  const label = k === "Mod" ? (isMac() ? "⌘" : "Ctrl") : k;
  return (
    <kbd className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-line bg-surface-base px-1.5 py-1 text-[11px] font-medium text-ink-soft shadow-sm">
      {label}
    </kbd>
  );
}

export function ShortcutDialog() {
  const open = useMindMapStore((s) => s.dialog === "shortcuts");
  const setDialog = useMindMapStore((s) => s.setDialog);

  return (
    <Modal
      open={open}
      onClose={() => setDialog(null)}
      title="키보드 단축키"
      description="생각의 흐름을 끊지 않도록 빠르게 작업하세요."
    >
      <div className="space-y-5">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {group.title}
            </p>
            <div className="space-y-1.5">
              {group.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg px-1 py-1"
                >
                  <span className="text-sm text-ink-soft">{item.label}</span>
                  <span className="flex items-center gap-1">
                    {item.keys.map((k, i) => (
                      <Key key={i} k={k} />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
