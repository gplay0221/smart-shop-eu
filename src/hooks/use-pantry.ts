import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type PantryItem = {
  id: string;
  name: string;
  product_id: string | null;
  quantity: number;
  unit: string;
  expires_at: string | null;
};

export function usePantry() {
  const { user, ready } = useAuth();
  return useQuery({
    queryKey: ["pantry", user?.id],
    enabled: ready && !!user,
    queryFn: async (): Promise<PantryItem[]> => {
      const { data, error } = await supabase
        .from("pantry_items")
        .select("id,name,product_id,quantity,unit,expires_at")
        .order("expires_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
