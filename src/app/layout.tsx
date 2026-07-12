import type { Metadata, Viewport } from "next";

import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "MindForge — 생각을 벼리다",
  description:
    "아이디어를 잇고, 다듬고, 벼려내는 마인드맵. 서버 없이 링크 하나로 공유되는 나만의 생각 대장간, MindForge.",
  applicationName: "MindForge",
  appleWebApp: { title: "MindForge", capable: true, statusBarStyle: "default" },
  openGraph: {
    title: "MindForge — 생각을 벼리다",
    description:
      "아이디어를 잇고, 다듬고, 벼려내는 마인드맵. 링크 하나로 공유하세요.",
    siteName: "MindForge",
    type: "website",
    locale: "ko_KR",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0e14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
