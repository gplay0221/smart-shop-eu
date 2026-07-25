import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@/hooks/use-location";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import { Users, Leaf, Store, Check, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Welcome to EuroSaver · Personalize your experience" },
      { name: "description", content: "Tell us a bit about your household so we can tailor prices and meal suggestions to you." },
      { property: "og:title", content: "Welcome to EuroSaver" },
      { property: "og:description", content: "Personalized grocery savings across the EU." },
    ],
  }),
  component: OnboardingPage,
});

const DIETARY = [
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
  { key: "gluten_free", label: "Gluten-free" },
  { key: "halal", label: "Halal" },
  { key: "kosher", label: "Kosher" },
  { key: "lactose_free", label: "Lactose-free" },
  { key: "pescatarian", label: "Pescatarian" },
  { key: "no_pork", label: "No pork" },
];

function OnboardingPage() {
  const { user, ready } = useAuth();
  const { location } = useLocation();
  const { profile, refetch } = useProfile();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [size, setSize] = useState(2);
  const [prefs, setPrefs] = useState<string[]>([]);
  const [chains, setChains] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/auth" });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (profile) {
      setSize(profile.household_size);
      setPrefs(profile.dietary_prefs ?? []);
      setChains(profile.favorite_store_chains ?? []);
    }
  }, [profile]);

  const { data: cityChains } = useQuery({
    queryKey: ["city-chains", location?.cityId],
    enabled: !!location?.cityId,
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("chain").eq("city_id", location!.cityId);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((s) => s.chain))).sort();
    },
  });

  function toggle<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  async function finish() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("user_profiles").upsert({
      user_id: user.id,
      household_size: size,
      dietary_prefs: prefs,
      favorite_store_chains: chains,
      onboarded_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("You're all set — let's start saving.");
    await refetch();
    navigate({ to: "/" });
  }

  if (!ready || !user) return null;

  const steps = ["Household", "Diet", "Stores"];

  return (
    <div className="min-h-screen bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-brand">Welcome</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold mt-2">Let's personalize EuroSaver</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Three quick questions and we'll tailor prices, meals and stores to your household.
          </p>
        </div>

        <div className="flex items-center gap-2 mb-8">
          {steps.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-brand" : "bg-border"}`} />
              <p className={`text-[10px] font-bold uppercase tracking-widest mt-2 ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          {step === 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="size-5 text-brand" />
                <h2 className="font-display text-xl font-bold">How many people are you shopping for?</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">We use this to scale meal quantities.</p>
              <div className="grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSize(n)}
                    className={`rounded-lg border py-4 font-display font-bold text-lg transition ${
                      size === n ? "bg-brand text-brand-foreground border-brand" : "border-border bg-background hover:border-brand"
                    }`}
                  >
                    {n === 6 ? "6+" : n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Leaf className="size-5 text-brand" />
                <h2 className="font-display text-xl font-bold">Any dietary preferences?</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">Optional — pick any that apply. We'll filter suggestions accordingly.</p>
              <div className="flex flex-wrap gap-2">
                {DIETARY.map((d) => {
                  const on = prefs.includes(d.key);
                  return (
                    <button
                      key={d.key}
                      onClick={() => setPrefs(toggle(prefs, d.key))}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
                        on ? "bg-foreground text-background border-foreground" : "border-border bg-background hover:border-brand"
                      }`}
                    >
                      {on && <Check className="size-3.5" />} {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Store className="size-5 text-brand" />
                <h2 className="font-display text-xl font-bold">Favorite supermarkets?</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                {location
                  ? `Chains available in ${location.cityName}. We'll prioritize these when suggesting where to shop.`
                  : "Pick a location from the header to see chains in your city."}
              </p>
              {cityChains && cityChains.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {cityChains.map((c) => {
                    const on = chains.includes(c);
                    return (
                      <button
                        key={c}
                        onClick={() => setChains(toggle(chains, c))}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${
                          on ? "bg-foreground text-background border-foreground" : "border-border bg-background hover:border-brand"
                        }`}
                      >
                        {on && <Check className="size-3.5" />} {c}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No stores loaded yet — you can set favorites anytime later.</p>
              )}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Back
            </button>
            {step < 2 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:opacity-90"
              >
                Continue <ArrowRight className="size-4" />
              </button>
            ) : (
              <button
                onClick={finish}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Finish"}
                <Check className="size-4" />
              </button>
            )}
          </div>
        </section>

        <button
          onClick={() => {
            void finish();
          }}
          className="mt-6 mx-auto block text-xs text-muted-foreground hover:text-foreground"
        >
          Skip for now
        </button>
      </main>
    </div>
  );
}
