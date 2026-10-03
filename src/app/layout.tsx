import type { Metadata, Viewport } from "next";

import "@xyflow/react/dist/style.css";
import "./pretendard.css";
import "@fontsource/jua/400.css";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/500.css";
import "@fontsource/noto-sans-kr/700.css";
import "@fontsource/nanum-myeongjo/400.css";
import "@fontsource/nanum-myeongjo/700.css";
import "@fontsource/nanum-myeongjo/800.css";
import "@fontsource/gaegu/400.css";
import "@fontsource/gaegu/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "MindBranch — 생각의 가지를 뻗다",
  description:
    "흩어진 아이디어를 가지로 잇고 펼치는 마인드맵, MindBranch. 설치 없이 브라우저에서, 서버 없이 링크 하나로 공유하세요.",
  applicationName: "MindBranch",
  appleWebApp: { title: "MindBranch", capable: true, statusBarStyle: "default" },
  openGraph: {
    title: "MindBranch — 생각의 가지를 뻗다",
    description:
      "흩어진 아이디어를 가지로 잇고 펼치는 마인드맵. 링크 하나로 공유하세요.",
    siteName: "MindBranch",
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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
