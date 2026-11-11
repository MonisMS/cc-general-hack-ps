import Link from "next/link";
import { LockKeyhole, Plug } from "lucide-react";

export default function ConnectPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-zinc-500">
        <Plug className="h-3.5 w-3.5" aria-hidden /> MCP connections
      </div>
      <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-zinc-50">Connect your AI assistant</h1>
      <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-zinc-400">
        Connect your AI assistant to your DataPilot datasets with a paid subscription.
      </p>

      <section aria-labelledby="subscription-title" className="glass mt-6 rounded-xl p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[12px] font-medium text-accent-ink">
          <LockKeyhole className="h-4 w-4" aria-hidden /> Paid feature · Coming soon
        </div>
        <h2 id="subscription-title" className="mt-3 text-[18px] font-semibold text-zinc-100">A paid subscription will be required</h2>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-zinc-400">
          Subscriptions are coming soon. MCP connections are currently unavailable for all accounts, including existing connections.
          You can continue creating and exploring datasets in the web app.
        </p>
        <button type="button" disabled className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-raised px-4 text-[13.5px] font-medium text-zinc-500 disabled:cursor-not-allowed">
          <LockKeyhole className="h-4 w-4" aria-hidden /> Subscriptions coming soon
        </button>
      </section>

      <div className="mt-5 flex flex-wrap gap-4 text-[13px]">
        <Link href="/workflows" className="text-zinc-300 underline underline-offset-4 hover:text-zinc-50">View your datasets</Link>
        <Link href="/new" className="text-zinc-300 underline underline-offset-4 hover:text-zinc-50">Create a dataset</Link>
      </div>
    </div>
  );
}
