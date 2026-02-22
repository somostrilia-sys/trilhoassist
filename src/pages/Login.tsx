import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield, Truck, Building2, Wrench, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Portal = "assistencia" | "prestador" | "associacao" | null;

const portals = [
  {
    id: "assistencia" as Portal,
    label: "Assistência 24h",
    description: "Painel principal de operação e gestão do sistema",
    icon: Truck,
    roles: ["admin", "operator"],
    color: "bg-primary",
  },
  {
    id: "prestador" as Portal,
    label: "Prestador",
    description: "Acompanhe seus atendimentos e fechamentos",
    icon: Wrench,
    roles: ["provider"],
    color: "bg-accent",
  },
  {
    id: "associacao" as Portal,
    label: "Associação",
    description: "Gerencie seus associados e acompanhe atendimentos",
    icon: Building2,
    roles: ["client"],
    color: "bg-sidebar-background",
  },
];

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState<Portal>(null);
  const [loginData, setLoginData] = useState({ email: "", password: "" });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPortal) return;
    setLoading(true);

    const portal = portals.find((p) => p.id === selectedPortal)!;

    try {
      await signIn(loginData.email, loginData.password);

      // Check if user has the correct role for this portal
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não encontrado");

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const userRoles = roles?.map((r) => r.role) ?? [];
      const hasAccess = portal.roles.some((r) => userRoles.includes(r as any));

      if (!hasAccess) {
        await supabase.auth.signOut();
        toast({
          title: "Acesso negado",
          description: "Você não tem permissão para acessar este portal.",
          variant: "destructive",
        });
        return;
      }

      // Redirect based on portal
      if (selectedPortal === "assistencia") {
        navigate("/dashboard");
      } else if (selectedPortal === "prestador") {
        navigate("/provider/dashboard");
      } else {
        navigate("/client/dashboard");
      }
    } catch (err: any) {
      toast({
        title: "Erro ao entrar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-14 w-14 rounded-xl bg-primary flex items-center justify-center">
            <Truck className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-sidebar-foreground">
            Assistência 24h
          </h1>
          <p className="text-sm text-sidebar-foreground/60">
            Sistema de Gestão de Assistência
          </p>
        </div>

        {!selectedPortal ? (
          /* Portal Selection */
          <div className="space-y-3">
            <p className="text-center text-sm font-medium text-sidebar-foreground/80">
              Selecione seu portal de acesso
            </p>
            {portals.map((portal) => (
              <Card
                key={portal.id}
                className="border-0 shadow-lg cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl"
                onClick={() => setSelectedPortal(portal.id)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div
                    className={`h-12 w-12 rounded-xl ${portal.color} flex items-center justify-center shrink-0`}
                  >
                    <portal.icon className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">
                      {portal.label}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {portal.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* Login Form */
          <Card className="border-0 shadow-2xl">
            <CardHeader className="pb-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedPortal(null);
                  setLoginData({ email: "", password: "" });
                }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
              <div className="flex items-center gap-3 pt-2">
                <div
                  className={`h-10 w-10 rounded-lg ${portals.find((p) => p.id === selectedPortal)!.color} flex items-center justify-center`}
                >
                  {(() => {
                    const Icon = portals.find((p) => p.id === selectedPortal)!.icon;
                    return <Icon className="h-5 w-5 text-primary-foreground" />;
                  })()}
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">
                    {portals.find((p) => p.id === selectedPortal)!.label}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Entre com suas credenciais
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-mail</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginData.email}
                    onChange={(e) =>
                      setLoginData({ ...loginData, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData({ ...loginData, password: e.target.value })
                    }
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-center gap-2 text-xs text-sidebar-foreground/40">
          <Shield className="h-3 w-3" />
          <span>Conexão segura e criptografada</span>
        </div>
      </div>
    </div>
  );
}
