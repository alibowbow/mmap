import type { Metadata, Viewport } from "next";

import "@xyflow/react/dist/style.css";
import "./pretendard.css";
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
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e14" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Optional faces for the font picker. Linked (not @import-ed from
            globals.css) so they load in parallel instead of blocking render. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* no-page-custom-font targets pages/_document; in the App Router the
            root layout already applies to every page. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Gaegu:wght@400;700&family=JetBrains+Mono:wght@400;500;700&family=Jua&family=Nanum+Myeongjo:wght@400;700;800&family=Noto+Sans+KR:wght@400;500;700&display=swap"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
