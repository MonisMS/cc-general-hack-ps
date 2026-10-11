"use client";

import { useEffect } from "react";
import { XOctagon } from "lucide-react";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div className="max-w-md rounded-xl border border-danger/20 bg-danger/5 p-6">
        <XOctagon className="mx-auto h-7 w-7 text-danger" aria-hidden />
        <h1 className="mt-3 text-sm text-zinc-200">Something went wrong</h1>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-4 h-7 rounded-md bg-zinc-50 px-2.5 text-[12.5px] font-medium text-zinc-950 hover:bg-zinc-200"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
