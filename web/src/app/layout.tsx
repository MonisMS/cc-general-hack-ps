import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DataPilot — AI Data Intelligence",
  description:
    "Describe the data you need in plain English. DataPilot plans, collects, cleans and validates a source-backed dataset.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-200">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <MobileNav />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
