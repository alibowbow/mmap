"use client";

import dynamic from "next/dynamic";

// AppShell is heavily client-side (React Flow, localStorage). Disable SSR to
// avoid hydration mismatches and run entirely in the browser.
const AppShell = dynamic(
  () => import("@/components/layout/AppShell").then((m) => m.AppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-surface-base">
        <div className="flex items-center gap-3 text-ink-soft">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-brand" />
          MindForge 불러오는 중…
        </div>
      </div>
    ),
  }
);

export default function Page() {
  return <AppShell />;
}
