import type { Metadata } from "next";
import "./globals.css";

import { Kanit } from "next/font/google";
import { AuthProvider } from "../providers/AuthProvider";
import { SidebarProvider } from "../providers/SidebarProvider";
import Sidebar from "../components/shared/Sidebar";
import MobileTopBar from "../components/shared/MobileTopBar";
import ContentWrapper from "../components/shared/ContentWrapper";

const fontKanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-kanit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Restaurant Hub",
  description: "ระบบจัดการร้านอาหาร",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={fontKanit.className}>
        <AuthProvider>
          <SidebarProvider>
            {/* Sidebar renders itself as fixed — no wrapper div needed */}
            <Sidebar />

            {/* Content area: margin-left = sidebar width (animated in ContentWrapper) */}
            <ContentWrapper>
              {/* Mobile sticky topbar — hidden on desktop */}
              <MobileTopBar />
              <main>{children}</main>
            </ContentWrapper>
          </SidebarProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
