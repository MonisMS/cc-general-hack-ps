import { MobileNav, Sidebar } from "@/components/Sidebar";

/** The app shell: sidebar + framed workspace. The landing page at "/" renders without it. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <MobileNav />
      <main className="app-frame min-w-0 flex-1 md:my-2 md:mr-2 md:rounded-2xl md:border md:border-line md:bg-surface">{children}</main>
    </div>
  );
}
