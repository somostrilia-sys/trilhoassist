import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield, Building2, Wrench, ArrowLeft, ChevronRight, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoTrilho from "@/assets/logo-trilho.png";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Portal = "assistencia" | "prestador" | "associacao" | null;

const portals = [
  {
    id: "assistencia" as Portal,
    label: "Assistência 24h",
    description: "Operação e gestão completa do sistema",
    icon: Truck,
    roles: ["admin", "operator", "super_admin"],
    gradient: "from-primary to-[hsl(218,58%,34%)]",
    iconBg: "bg-primary/20",
    iconColor: "text-primary",
  },
  {
    id: "prestador" as Portal,
    label: "Prestador",
    description: "Atendimentos realizados e fechamento financeiro",
    icon: Wrench,
    roles: ["provider"],
    gradient: "from-[hsl(48,92%,52%)] to-[hsl(40,90%,45%)]",
    iconBg: "bg-accent/20",
    iconColor: "text-accent",
  },
  {
    id: "associacao" as Portal,
    label: "Associação",
    description: "Gestão de associados e acompanhamento de atendimentos",
    icon: Building2,
    roles: ["client"],
    gradient: "from-[hsl(354,82%,42%)] to-[hsl(354,70%,35%)]",
    iconBg: "bg-destructive/20",
    iconColor: "text-destructive",
  },
];

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState<Portal>(null);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

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
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-[hsl(218,58%,14%)]">
      {/* Background video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/bg-login.mp4" type="video/mp4" />
      </video>
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative z-10 w-full max-w-md px-4 space-y-8">
        {/* Logo & Title */}
        <div className="text-center space-y-3">
          <img src={logoTrilho} alt="ASSIST AI" className="mx-auto h-20 w-20 rounded-2xl bg-white/10 p-2 shadow-lg shadow-primary/20 object-contain" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              ASSIST AI
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
                <button
                  type="button"
                  onClick={() => { setForgotEmail(loginData.email); setForgotOpen(true); }}
                  className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors mt-1"
                >
                  Esqueceu sua senha?
                </button>
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

      {/* Forgot Password Dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="bg-[hsl(218,58%,16%)] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">Recuperar Senha</DialogTitle>
            <DialogDescription className="text-white/50">
              Informe seu e-mail para receber o link de redefinição de senha.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setForgotLoading(true);
              const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              setForgotLoading(false);
              if (error) {
                toast({ title: "Erro", description: error.message, variant: "destructive" });
              } else {
                toast({ title: "E-mail enviado!", description: "Verifique sua caixa de entrada para redefinir a senha." });
                setForgotOpen(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label className="text-white/60 text-xs">E-mail</Label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                className="bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20"
              />
            </div>
            <Button type="submit" className="w-full" disabled={forgotLoading}>
              {forgotLoading ? "Enviando..." : "Enviar link de recuperação"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
