import type { Metadata } from "next";
import "./globals.css";

import { Kanit } from "next/font/google";
import { AuthProvider } from "@/src/providers/AuthProvider";
import { LanguageProvider } from "@/src/providers/LanguageProvider";
import { ThemeProvider } from "@/src/providers/ThemeProvider";

const fontKanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-kanit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Restaurant Hub",
  description: "Restaurant management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={fontKanit.className}>
        <LanguageProvider>
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
