"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Logo } from "@/components/Logo";

const AFTER_AUTH = "/new";

function GoogleMark() {
  // Google's brand mark; its colors are fixed by Google's brand rules, so they are not theme tokens.
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Email/password accounts must confirm their address with a 6-digit code before they get a session.
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const signUp = mode === "sign-up";

  function done() {
    router.replace(AFTER_AUTH);
    router.refresh();
  }

  async function sendCode(email: string) {
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    if (error) setError(error.message || "Couldn't send the code. Try again in a minute.");
    else setNotice(`We sent a new code to ${email}.`);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    setBusy("email");
    setError(null);
    const { data, error } = signUp
      ? await authClient.signUp.email({ name: String(f.get("name") ?? "").trim() || email.split("@")[0], email, password })
      : await authClient.signIn.email({ email, password });
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") {
        // signed up earlier but never confirmed: send a fresh code and ask for it
        setVerifyEmail(email);
        await sendCode(email);
      } else setError(error.message || (signUp ? "Couldn't create your account." : "Wrong email or password."));
      setBusy(null);
      return;
    }
    // sign-up sends the code automatically and returns an unverified user without a session
    if (signUp && !(data && "user" in data && data.user?.emailVerified)) {
      setVerifyEmail(email);
      setNotice(`We sent a 6-digit code to ${email}.`);
      setBusy(null);
      return;
    }
    done();
  }

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!verifyEmail) return;
    const otp = String(new FormData(e.currentTarget).get("otp") ?? "").replace(/\D/g, "");
    setBusy("email");
    setError(null);
    const { data, error } = await authClient.emailOtp.verifyEmail({ email: verifyEmail, otp });
    if (error) {
      setError(error.message || "That code didn't work. Check it or send a new one.");
      setBusy(null);
      return;
    }
    if (data && "token" in data && data.token == null) {
      // verified, but auto sign-in is off: send them to sign in with their password
      setNotice("Email confirmed. Sign in to continue.");
      setVerifyEmail(null);
      setBusy(null);
      return;
    }
    done();
  }

  async function google() {
    setBusy("google");
    setError(null);
    // absolute URL: a bare path would be resolved against the auth server's origin, not this app
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: `${window.location.origin}${AFTER_AUTH}` });
    if (error) {
      setError(error.message || "Google sign-in failed.");
      setBusy(null);
    }
  }

  const input =
    "h-11 w-full rounded-lg border border-line-strong bg-zinc-950/70 px-3.5 text-[14px] text-zinc-50 caret-zinc-50 transition placeholder:text-zinc-600 hover:border-zinc-600 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-50/10";

  return (
    <div className="lp-hero grain relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-16">
      <div className="lp-pillars-warm" aria-hidden />
      <div className="lp-pillars-cool" aria-hidden />
      <main className="glass relative z-10 w-full max-w-[400px] rounded-2xl p-7 sm:p-8">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo size={22} />
          <span className="text-[15px] font-semibold text-zinc-50">DataPilot</span>
        </Link>
        {verifyEmail ? (
          <>
            <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.02em] text-zinc-50">Check your email</h1>
            <p className="mt-1 text-[14px] text-zinc-400">
              Enter the 6-digit code we sent to <span className="text-zinc-200">{verifyEmail}</span>. It expires in 15 minutes.
            </p>
            <form onSubmit={onVerify} className="mt-6 space-y-3.5">
              <div>
                <label htmlFor="otp" className="mb-1.5 block text-[13px] text-zinc-300">
                  Verification code
                </label>
                <input
                  id="otp"
                  name="otp"
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\s*\d{6}\s*"
                  maxLength={8}
                  placeholder="123456"
                  className={`${input} font-mono tracking-[0.3em]`}
                />
              </div>
              {notice && !error && <p className="text-[13px] text-zinc-400">{notice}</p>}
              {error && (
                <p role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-[13px] text-danger-soft">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy !== null} className="btn-glow inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-medium">
                {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Verify and continue
              </button>
            </form>
            <p className="mt-6 text-center text-[13px] text-zinc-400">
              No code?{" "}
              <button type="button" onClick={() => (setError(null), sendCode(verifyEmail))} className="font-medium text-zinc-100 underline-offset-4 hover:underline">
                Send a new one
              </button>
              {" · "}
              <button
                type="button"
                onClick={() => (setVerifyEmail(null), setError(null), setNotice(null))}
                className="font-medium text-zinc-100 underline-offset-4 hover:underline"
              >
                Use a different email
              </button>
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.02em] text-zinc-50">{signUp ? "Create your account" : "Welcome back"}</h1>
            <p className="mt-1 text-[14px] text-zinc-400">{signUp ? "Your datasets stay private to you." : "Sign in to your datasets."}</p>

            <button
              type="button"
              onClick={google}
              disabled={busy !== null}
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-line-strong bg-zinc-50/[0.04] text-[14px] font-medium text-zinc-100 transition hover:bg-zinc-50/[0.08] disabled:opacity-50"
            >
              {busy === "google" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <GoogleMark />} Continue with Google
            </button>

            <div className="my-5 flex items-center gap-3 text-[12px] text-zinc-500" aria-hidden>
              <span className="h-px flex-1 bg-line-strong" /> or with email <span className="h-px flex-1 bg-line-strong" />
            </div>

            <form onSubmit={onSubmit} className="space-y-3.5">
              {signUp && (
                <div>
                  <label htmlFor="name" className="mb-1.5 block text-[13px] text-zinc-300">
                    Name
                  </label>
                  <input id="name" name="name" autoComplete="name" placeholder="Ada Lovelace" className={input} />
                </div>
              )}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[13px] text-zinc-300">
                  Email
                </label>
                <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" className={input} />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-[13px] text-zinc-300">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={signUp ? "new-password" : "current-password"}
                  placeholder={signUp ? "At least 8 characters" : "Your password"}
                  className={input}
                />
              </div>
              {notice && !error && <p className="text-[13px] text-zinc-400">{notice}</p>}
              {error && (
                <p role="alert" className="rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-[13px] text-danger-soft">
                  {error}
                </p>
              )}
              <button type="submit" disabled={busy !== null} className="btn-glow inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-medium">
                {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {signUp ? "Create account" : "Sign in"}
                {busy !== "email" && <ArrowRight className="h-4 w-4" aria-hidden />}
              </button>
            </form>

            <p className="mt-6 text-center text-[13px] text-zinc-400">
              {signUp ? "Already have an account? " : "New to DataPilot? "}
              <Link href={signUp ? "/auth/sign-in" : "/auth/sign-up"} className="font-medium text-zinc-100 underline-offset-4 hover:underline">
                {signUp ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
