import type { Metadata } from "next";
import "./globals.css";
import { Topbar } from "@/components/topbar";

export const metadata: Metadata = {
  title: "بوابة الدعم الفني",
  description: "نظام إدارة تذاكر الدعم الفني — بديل مفتوح لـ Lark Base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html dir="rtl" lang="ar">
      <body>
        <Topbar />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
