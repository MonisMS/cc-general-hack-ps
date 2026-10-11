import Link from "next/link";
import { Database } from "lucide-react";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <Database className="mx-auto h-5 w-5 text-zinc-600" aria-hidden />
        <h1 className="mt-3 text-[15px] font-medium text-zinc-100">Page not found</h1>
        <p className="mt-1 text-[13px] text-zinc-500">That page doesn&apos;t exist or was moved.</p>
        <Link href="/workflows" className="mt-4 inline-block text-[12.5px] text-accent-soft hover:underline">
          ← Back to workflows
        </Link>
      </div>
    </div>
  );
}
