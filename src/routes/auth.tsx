import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site-header";
import { toast } from "sonner";
import { Mail, Lock } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · EuroSaver" },
      { name: "description", content: "Sign in to save shopping lists and track savings." },
      { property: "og:title", content: "Sign in · EuroSaver" },
      { property: "og:description", content: "Save your shopping lists across devices." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && user) navigate({ to: "/lists" });
  }, [ready, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Account created! Check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) toast.error(res.error.message);
  }

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        <div className="rounded-2xl bg-card border border-border p-8 shadow-sm">
          <h1 className="font-display text-2xl font-bold">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to sync your shopping lists." : "Save shopping lists and never pay more than you have to."}
          </p>

          <button
            onClick={google}
            className="mt-6 w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-background py-2.5 font-semibold hover:bg-secondary"
          >
            <svg className="size-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6L19 3.7C17.1 2 14.7 1 12 1 7.4 1 3.4 3.6 1.4 7.4l3.4 2.7C5.9 7 8.7 5 12 5z"/><path fill="#4285F4" d="M23 12c0-.7-.1-1.4-.2-2H12v4h6.2c-.3 1.4-1.1 2.6-2.4 3.4l3.7 2.9c2.2-2 3.5-5 3.5-8.3z"/><path fill="#FBBC05" d="M4.8 14.3A6.6 6.6 0 0 1 4.5 12c0-.8.1-1.6.3-2.3L1.4 7C.5 8.5 0 10.2 0 12s.5 3.5 1.4 5l3.4-2.7z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.4-2.7l-3.7-2.9c-1 .7-2.3 1.1-3.7 1.1-3.3 0-6.1-2-7.2-4.8L1.4 16.6C3.4 20.4 7.4 23 12 23z"/></svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6)"
                className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full rounded-lg bg-brand py-2.5 font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full text-sm text-muted-foreground hover:text-brand"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-brand">← Back to EuroSaver</Link>
        </p>
      </main>
    </div>
  );
}
