import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface RolePermission {
  role: string;
  module: string;
  enabled: boolean;
}

export function usePermissions() {
  const { roles } = useAuth();

  const { data: permissions = [], isLoading } = useQuery<RolePermission[]>({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, module, enabled");
      if (error) throw error;
      return data as RolePermission[];
    },
  });

  const canAccessModule = (module: string): boolean => {
    if (roles.includes("admin")) return true; // admin always has access
    return roles.some((role) =>
      permissions.some(
        (p) => p.role === role && p.module === module && p.enabled
      )
    );
  };

  return { permissions, isLoading, canAccessModule };
}
