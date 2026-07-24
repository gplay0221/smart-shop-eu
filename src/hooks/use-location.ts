import { useEffect, useState } from "react";
import { readLocation, writeLocation, type Location } from "@/lib/location";

export function useLocation() {
  const [location, setLocation] = useState<Location | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocation(readLocation());
    setReady(true);
    const onChange = () => setLocation(readLocation());
    window.addEventListener("eurosaver:location", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("eurosaver:location", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return {
    location,
    ready,
    setLocation: (loc: Location | null) => { writeLocation(loc); setLocation(loc); },
  };
}
