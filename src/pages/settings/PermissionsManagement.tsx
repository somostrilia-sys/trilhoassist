import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Shield } from "lucide-react";

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  operator: "Operador",
  provider: "Prestador",
  client: "Associação",
};

const moduleLabels: Record<string, string> = {
  dashboard: "Dashboard",
  operation: "Operação",
  business: "Negócio",
  network: "Rede",
  finance: "Financeiro",
  reports: "Relatórios",
  settings: "Configurações",
};

const modules = Object.keys(moduleLabels);
const editableRoles = ["operator", "provider", "client"];

interface Permission {
  id: string;
  role: string;
  module: string;
  enabled: boolean;
}

export default function PermissionsManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: permissions = [], isLoading } = useQuery<Permission[]>({
    queryKey: ["role-permissions-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("*");
      if (error) throw error;
      return data as Permission[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ role, module, enabled }: { role: string; module: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("role_permissions")
        .update({ enabled })
        .eq("role", role as any)
        .eq("module", module);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-permissions-admin"] });
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      toast({ title: "Permissão atualizada!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    },
  });

  const getPermission = (role: string, module: string) =>
    permissions.find((p) => p.role === role && p.module === module);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Permissões por Perfil
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure quais módulos cada tipo de usuário pode acessar
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {editableRoles.map((role) => (
            <Card key={role}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{roleLabels[role]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {modules.map((module) => {
                  const perm = getPermission(role, module);
                  const isEnabled = perm?.enabled ?? false;

                  return (
                    <div key={module} className="flex items-center justify-between">
                      <span className="text-sm text-foreground">{moduleLabels[module]}</span>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ role, module, enabled: checked })
                        }
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
