import type { Metadata } from "next";
import { SharedMapViewer } from "@/components/share/SharedMapViewer";
import "./share.css";

export const metadata: Metadata = {
  title: "공유 마인드맵 · MindBranch",
  description: "공유된 마인드맵을 읽기 전용으로 살펴보세요.",
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export default function SharePage() {
  return <SharedMapViewer />;
}
