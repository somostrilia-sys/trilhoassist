import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield, Truck, Building2, Wrench, ArrowLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Portal = "assistencia" | "prestador" | "associacao" | null;

const portals = [
  {
    id: "assistencia" as Portal,
    label: "Assistência 24h",
    description: "Operação e gestão completa do sistema",
    icon: Truck,
    roles: ["admin", "operator"],
    gradient: "from-primary to-[hsl(200,65%,30%)]",
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
  },
  {
    id: "prestador" as Portal,
    label: "Prestador",
    description: "Atendimentos realizados e fechamento financeiro",
    icon: Wrench,
    roles: ["provider"],
    gradient: "from-accent to-[hsl(28,90%,42%)]",
    iconBg: "bg-accent/20",
    iconColor: "text-accent",
  },
  {
    id: "associacao" as Portal,
    label: "Associação",
    description: "Gestão de associados e acompanhamento de atendimentos",
    icon: Building2,
    roles: ["client"],
    gradient: "from-[hsl(210,30%,28%)] to-[hsl(210,30%,18%)]",
    iconBg: "bg-sidebar-accent/40",
    iconColor: "text-sidebar-foreground",
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

  const activePortal = portals.find((p) => p.id === selectedPortal);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(210,30%,18%) 0%, hsl(210,30%,14%) 50%, hsl(215,35%,10%) 100%)' }}>
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/[0.02] blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4 space-y-8">
        {/* Logo & Title */}
        <div className="text-center space-y-3">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-[hsl(200,65%,30%)] flex items-center justify-center shadow-lg shadow-primary/20">
            <Truck className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Assistência 24h
            </h1>
            <p className="text-sm text-white/40 mt-1">
              Sistema de Gestão de Assistência Veicular
            </p>
          </div>
        </div>

        {!selectedPortal ? (
          /* Portal Selection */
          <div className="space-y-3">
            <p className="text-center text-xs font-medium uppercase tracking-widest text-white/30">
              Selecione seu acesso
            </p>
            {portals.map((portal) => (
              <button
                key={portal.id}
                onClick={() => setSelectedPortal(portal.id)}
                className="w-full group"
              >
                <Card className="border border-white/[0.06] bg-white/[0.04] backdrop-blur-sm shadow-lg transition-all duration-200 hover:bg-white/[0.08] hover:border-white/[0.12] hover:shadow-xl hover:-translate-y-0.5">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${portal.gradient} flex items-center justify-center shrink-0 shadow-md`}>
                      <portal.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <h3 className="font-semibold text-white text-[15px]">
                        {portal.label}
                      </h3>
                      <p className="text-xs text-white/40 mt-0.5">
                        {portal.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        ) : (
          /* Login Form */
          <Card className="border border-white/[0.06] bg-white/[0.04] backdrop-blur-sm shadow-2xl overflow-hidden">
            {/* Portal indicator bar */}
            <div className={`h-1 bg-gradient-to-r ${activePortal!.gradient}`} />
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPortal(null);
                    setLoginData({ email: "", password: "" });
                  }}
                  className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </button>
              </div>

              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${activePortal!.gradient} flex items-center justify-center shadow-md`}>
                  {(() => {
                    const Icon = activePortal!.icon;
                    return <Icon className="h-5 w-5 text-white" />;
                  })()}
                </div>
                <div>
                  <h2 className="font-semibold text-white text-[15px]">
                    {activePortal!.label}
                  </h2>
                  <p className="text-xs text-white/40">
                    Entre com suas credenciais
                  </p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-white/60 text-xs font-medium">
                    E-mail
                  </Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginData.email}
                    onChange={(e) =>
                      setLoginData({ ...loginData, email: e.target.value })
                    }
                    required
                    className="bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-white/60 text-xs font-medium">
                    Senha
                  </Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginData.password}
                    onChange={(e) =>
                      setLoginData({ ...loginData, password: e.target.value })
                    }
                    required
                    className="bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20 focus:border-primary/50 focus:ring-primary/20"
                  />
                </div>
                <Button
                  type="submit"
                  className={`w-full bg-gradient-to-r ${activePortal!.gradient} hover:opacity-90 transition-opacity shadow-lg text-white font-medium`}
                  disabled={loading}
                >
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-white/20">
          <Shield className="h-3 w-3" />
          <span>Conexão segura e criptografada</span>
        </div>
      </div>
    </div>
  );
}
