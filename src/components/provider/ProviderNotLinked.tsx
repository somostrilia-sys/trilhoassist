import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, LogOut, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export function ProviderNotLinked() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-lg w-full border-amber-200">
        <CardContent className="pt-8 pb-6 text-center space-y-5">
          <div className="mx-auto h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-amber-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">
              Conta não vinculada
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sua conta de acesso (<span className="font-mono text-foreground">{user?.email}</span>) ainda não está vinculada a um cadastro de prestador no sistema.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Por isso seus atendimentos, faturas e valores não aparecem.
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 text-left space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4" /> O que fazer agora
            </p>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>Entre em contato com a Assistência</li>
              <li>Confirme que o e-mail cadastrado na sua ficha de prestador é exatamente <span className="font-mono text-foreground">{user?.email}</span></li>
              <li>Após o ajuste, faça logout e login novamente</li>
            </ol>
          </div>

          <Button
            variant="outline"
            onClick={handleSignOut}
            className="gap-2 mx-auto"
          >
            <LogOut className="h-4 w-4" />
            Sair e tentar com outra conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
