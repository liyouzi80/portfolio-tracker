import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "个人投资组合追踪工具",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="font-sans antialiased bg-zinc-950 text-zinc-100">
        {children}
      </body>
    </html>
  );
}
