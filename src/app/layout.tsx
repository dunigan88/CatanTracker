import type { Metadata } from "next";
import { Nunito, JetBrains_Mono } from "next/font/google";
import Header from "@/components/Header";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "catan tracker.io",
  description: "Stats tracker for your Catan / Colonist.io group",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Shown only on narrow viewports. The main layout is hidden
            alongside it via the same breakpoint. */}
        <div className="mobile-gate md:hidden min-h-screen flex items-center justify-center px-8 text-center bg-[#faf5e4]">
          <div className="max-w-sm space-y-4">
            <div className="text-5xl font-extrabold tracking-tight">
              <span style={{ color: "#517d19" }}>catan</span>
              <span style={{ color: "#f0ad00" }}>tracker</span>
              <span style={{ color: "#4fa6eb" }}>.io</span>
            </div>
            <p className="text-lg font-semibold text-black leading-snug">
              Only optimized for desktop.
            </p>
            <p className="text-sm text-muted">
              Please open this site on a larger screen.
            </p>
          </div>
        </div>
        <div className="hidden md:flex flex-1 flex-col">
          <Header />
          <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
