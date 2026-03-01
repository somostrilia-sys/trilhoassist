import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Shield } from "lucide-react";
import logoTrilho from "@/assets/logo-trilho.png";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });
    // Also check hash for type=recovery
    if (window.location.hash.includes("type=recovery")) {
      setReady(true);
    }
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Senhas não conferem", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao redefinir senha", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha redefinida com sucesso!" });
      navigate("/login");
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, hsl(218,58%,18%) 0%, hsl(218,58%,14%) 50%, hsl(218,45%,10%) 100%)" }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[hsl(48,92%,52%)]/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[hsl(354,82%,42%)]/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-4 space-y-8">
        <div className="text-center space-y-3">
          <img src={logoTrilho} alt="Trilho Soluções" className="mx-auto h-20 w-20 rounded-2xl bg-white/10 p-2 shadow-lg shadow-primary/20 object-contain" />
          <h1 className="text-3xl font-bold tracking-tight text-white">Redefinir Senha</h1>
          <p className="text-sm text-white/40">Informe sua nova senha abaixo</p>
        </div>

        <Card className="border border-white/[0.06] bg-white/[0.04] backdrop-blur-sm shadow-2xl">
          <div className="h-1 bg-gradient-to-r from-primary to-[hsl(218,58%,34%)]" />
          <CardContent className="p-6">
            {!ready ? (
              <p className="text-white/50 text-center text-sm py-4">
                Carregando sessão de recuperação...
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs font-medium">Nova senha</Label>
                  <Input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs font-medium">Confirmar senha</Label>
                  <Input
                    type="password"
                    placeholder="Repita a nova senha"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    className="bg-white/[0.06] border-white/[0.08] text-white placeholder:text-white/20"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Salvando..." : "Redefinir Senha"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-2 text-[11px] text-white/20">
          <Shield className="h-3 w-3" />
          <span>Conexão segura e criptografada</span>
        </div>
      </div>
    </div>
  );
}
