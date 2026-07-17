import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";

import { Kanit } from "next/font/google";
import { AuthProvider } from "@/src/providers/AuthProvider";
import { LanguageProvider } from "@/src/providers/LanguageProvider";
import { ThemeProvider } from "@/src/providers/ThemeProvider";
import { FeedbackProvider } from "@/src/components/shared/FeedbackProvider";
import DocumentTitle from "@/src/components/shared/DocumentTitle";

const fontKanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-kanit",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Restaurant Hub · ระบบจัดการร้านอาหาร",
    template: "%s · Restaurant Hub",
  },
  description: "ระบบจัดการร้านอาหาร ออเดอร์ ครัว โต๊ะ และการชำระเงิน",
  icons: {
    icon: [{ url: "/web-logo.png?v=2", type: "image/png" }],
    shortcut: [{ url: "/web-logo.png?v=2", type: "image/png" }],
    apple: [{ url: "/web-logo.png?v=2", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`${fontKanit.variable} ${fontKanit.className}`}>
        <LanguageProvider>
          <ThemeProvider>
            <FeedbackProvider>
              <AuthProvider>
                <DocumentTitle />
                {children}
              </AuthProvider>
            </FeedbackProvider>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
