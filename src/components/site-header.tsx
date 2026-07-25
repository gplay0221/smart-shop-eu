import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "@/hooks/use-location";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications } from "@/hooks/use-notifications";
import { MapPin, ChevronDown, LogIn, LogOut, Bell } from "lucide-react";

export function SiteHeader() {
  const { location } = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { data: notifs, markAllRead } = useNotifications();
  const unread = notifs?.filter((n) => !n.read).length ?? 0;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-12">
        <div className="flex items-center gap-8">
          <Link to="/" className="font-display text-2xl font-bold tracking-tight text-foreground">
            Euro<span className="text-brand">Saver</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link to="/" activeOptions={{ exact: true }} className="hover:text-brand transition-colors [&.active]:text-foreground">
              Price Finder
            </Link>
            <Link to="/plan" className="hover:text-brand transition-colors [&.active]:text-foreground">
              Meal Planner
            </Link>
            <Link to="/lists" className="hover:text-brand transition-colors [&.active]:text-foreground">
              My Lists
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="hidden sm:inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:border-brand hover:text-foreground transition"
          >
            {location ? (
              <>
                <MapPin className="size-3.5 text-brand" />
                <span>{location.cityName}, {location.countryName}</span>
                <ChevronDown className="size-3 opacity-60" />
              </>
            ) : (
              <>
                <MapPin className="size-3.5 text-brand" />
                <span>Choose location</span>
              </>
            )}
          </button>
          {user && (
            <div className="relative">
              <button
                onClick={() => { setNotifOpen((v) => !v); if (unread) markAllRead(); }}
                className="relative inline-flex items-center justify-center rounded-full p-2 text-muted-foreground hover:text-brand hover:bg-secondary transition"
              >
                <Bell className="size-4" />
                {unread > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-4 h-4 rounded-full bg-brand text-[10px] font-bold text-brand-foreground grid place-items-center px-1">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 mt-2 w-80 z-50 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Price alerts</p>
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-border">
                      {(!notifs || notifs.length === 0) && (
                        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                          <Bell className="size-5 mx-auto mb-2 opacity-40" />
                          No alerts yet. Set one on a product page.
                        </div>
                      )}
                      {notifs?.map((n) => (
                        <div key={n.id} className="px-4 py-3">
                          <p className="text-sm font-semibold text-foreground">{n.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                          <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {user ? (
            <button
              onClick={() => supabase.auth.signOut()}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted-foreground hover:text-destructive transition"
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          ) : (
            <Link to="/auth" className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90">
              <LogIn className="size-4" /> <span>Sign in</span>
            </Link>
          )}
        </div>
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
