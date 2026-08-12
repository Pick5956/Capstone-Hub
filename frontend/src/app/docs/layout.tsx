import type { Metadata } from "next";
import DocsShell from "@/src/components/docs/DocsShell";

export const metadata: Metadata = {
  title: {
    default: "คู่มือการใช้งาน",
    template: "%s | คู่มือ Dishy",
  },
  description: "คู่มือทั่วไปสำหรับตั้งค่าร้าน รับออเดอร์ จอครัว การชำระเงิน สต็อก รายงาน และผู้ช่วย AI ใน Dishy",
  robots: {
    index: true,
    follow: true,
  },
};

export default function DocsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <DocsShell>{children}</DocsShell>;
}
