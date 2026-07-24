import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@/hooks/use-location";
import { useAuth } from "@/hooks/use-auth";
import { MapPin, ChevronDown, LogIn, LogOut, ListChecks } from "lucide-react";

export function SiteHeader() {
  const { location } = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Link to="/" className="font-display text-xl font-bold tracking-tight text-brand">
            EuroSaver
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-brand-soft transition"
          >
            <span className="size-2 rounded-full bg-savings" />
            {location ? (
              <>
                <span>{location.flag}</span>
                <span>{location.cityName}, {location.countryName}</span>
              </>
            ) : (
              <>
                <MapPin className="size-4" />
                <span>Choose location</span>
              </>
            )}
            <ChevronDown className="size-3.5 opacity-60" />
          </button>
        </div>
        <nav className="flex items-center gap-1 sm:gap-2 text-sm font-medium">
          <Link to="/" activeOptions={{ exact: true }} className="hidden sm:inline-block px-3 py-2 text-muted-foreground hover:text-brand [&.active]:text-brand">
            Price Finder
          </Link>
          <Link to="/lists" className="inline-flex items-center gap-1.5 px-3 py-2 text-muted-foreground hover:text-brand [&.active]:text-brand">
            <ListChecks className="size-4" /> <span className="hidden sm:inline">My Lists</span>
          </Link>
          {user ? (
            <button
              onClick={() => supabase.auth.signOut()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          ) : (
            <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-brand-foreground hover:opacity-90">
              <LogIn className="size-4" /> <span>Sign in</span>
            </Link>
          )}
        </nav>
      </div>
      {open && <LocationPicker onClose={() => setOpen(false)} />}
    </header>
  );
}

export function LocationPicker({ onClose }: { onClose: () => void }) {
  const { setLocation } = useLocation();
  const { data: countries } = useQuery({
    queryKey: ["countries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("countries").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  const [countryCode, setCountryCode] = useState<string | null>(null);

  const { data: cities } = useQuery({
    queryKey: ["cities", countryCode],
    enabled: !!countryCode,
    queryFn: async () => {
      const { data, error } = await supabase.from("cities").select("*").eq("country_code", countryCode!).order("name");
      if (error) throw error;
      return data;
    },
  });

  const country = countries?.find(c => c.code === countryCode);

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto mt-24 w-[min(560px,92vw)] rounded-2xl bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-bold mb-1">Choose your location</h2>
        <p className="text-sm text-muted-foreground mb-5">Prices and stores are shown for the city you pick.</p>

        {!countryCode ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto">
            {countries?.map(c => (
              <button
                key={c.code}
                onClick={() => setCountryCode(c.code)}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-sm font-medium hover:border-brand hover:bg-brand-soft transition"
              >
                <span className="text-lg">{c.flag}</span> {c.name}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <button onClick={() => setCountryCode(null)} className="text-xs text-brand mb-3 hover:underline">
              ← Change country
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto">
              {cities?.map(city => (
                <button
                  key={city.id}
                  onClick={() => {
                    setLocation({
                      countryCode: country!.code,
                      countryName: country!.name,
                      flag: country!.flag,
                      cityId: city.id,
                      cityName: city.name,
                    });
                    onClose();
                  }}
                  className="rounded-lg border border-border bg-background px-3 py-3 text-sm font-medium hover:border-brand hover:bg-brand-soft transition text-left"
                >
                  {city.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
