import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/Sidebar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DataPilot",
  description:
    "Describe the data you need in plain English. DataPilot plans, collects, cleans and validates a source-backed dataset.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full text-[13.5px] text-zinc-200">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <MobileNav />
          <main className="min-w-0 flex-1 md:my-2 md:mr-2 md:rounded-2xl md:border md:border-[#a36bf0]/25 md:bg-[#09080b] md:shadow-[0_0_0_1px_rgba(157,92,242,0.08),0_40px_120px_-30px_rgba(126,34,206,0.55)]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
