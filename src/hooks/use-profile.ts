import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type UserProfile = {
  user_id: string;
  household_size: number;
  dietary_prefs: string[];
  favorite_store_chains: string[];
  onboarded_at: string | null;
};

export function useProfile() {
  const { user, ready } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["user-profile", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<UserProfile | null> => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as UserProfile | null;
    },
  });

  return {
    profile: query.data ?? null,
    loading: !ready || query.isLoading,
    needsOnboarding: !!user && query.isFetched && !query.data?.onboarded_at,
    refetch: () => qc.invalidateQueries({ queryKey: ["user-profile", user?.id] }),
  };
}
