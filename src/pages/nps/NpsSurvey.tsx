import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const NPS_LABELS: Record<number, string> = {
  0: "Péssimo",
  1: "Muito ruim",
  2: "Ruim",
  3: "Insatisfeito",
  4: "Pouco satisfeito",
  5: "Neutro",
  6: "Razoável",
  7: "Bom",
  8: "Muito bom",
  9: "Ótimo",
  10: "Excelente!",
};

function getScoreColor(score: number): string {
  if (score <= 6) return "bg-red-500";
  if (score <= 8) return "bg-amber-500";
  return "bg-emerald-500";
}

export default function NpsSurvey() {
  const { token } = useParams<{ token: string }>();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "submitting" | "success" | "error" | "already_answered">("loading");
  const [tenantName, setTenantName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Link inválido.");
      return;
    }
    // Validate token
    const validate = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nps-submit?token=${encodeURIComponent(token)}`,
          { method: "GET" }
        );
        const data = await res.json();
        if (data.already_answered) {
          setStatus("already_answered");
          setTenantName(data.tenant_name || "");
        } else if (data.valid) {
          setStatus("ready");
          setTenantName(data.tenant_name || "");
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Link inválido ou expirado.");
        }
      } catch {
        setStatus("error");
        setErrorMsg("Erro ao verificar link.");
      }
    };
    validate();
  }, [token]);

  const handleSubmit = async () => {
    if (score === null || !token) return;
    setStatus("submitting");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nps-submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, score, comment: comment.trim().slice(0, 1000) }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Erro ao enviar avaliação.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Erro de conexão.");
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-lg font-semibold">Ops!</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "already_answered") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-semibold">Avaliação já registrada</h2>
            <p className="text-sm text-muted-foreground">
              Você já respondeu a pesquisa para este atendimento.
              {tenantName && <> Obrigado por avaliar o <strong>{tenantName}</strong>!</>}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="relative mx-auto w-16 h-16">
              <CheckCircle2 className="h-16 w-16 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold">Obrigado pela sua avaliação!</h2>
            <p className="text-sm text-muted-foreground">
              Sua opinião é muito importante para melhorarmos nossos serviços.
              {tenantName && <> A equipe do <strong>{tenantName}</strong> agradece!</>}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Ready state — show survey
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="max-w-lg w-full shadow-lg">
        <CardHeader className="text-center pb-2">
          {tenantName && (
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{tenantName}</p>
          )}
          <h1 className="text-xl font-bold">Como foi seu atendimento?</h1>
          <p className="text-sm text-muted-foreground">
            Em uma escala de 0 a 10, qual a chance de você recomendar nosso serviço?
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Score selector */}
          <div className="space-y-3">
            <div className="grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setScore(i)}
                  className={cn(
                    "aspect-square rounded-lg text-sm font-bold transition-all duration-150 border-2",
                    score === i
                      ? `${getScoreColor(i)} text-white border-transparent scale-110 shadow-md`
                      : "bg-background border-border hover:border-primary/40 text-foreground hover:scale-105"
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
              <span>Nada provável</span>
              <span>Muito provável</span>
            </div>
            {score !== null && (
              <div className="text-center">
                <span className={cn(
                  "inline-block px-3 py-1 rounded-full text-xs font-medium text-white",
                  getScoreColor(score)
                )}>
                  {NPS_LABELS[score]}
                </span>
              </div>
            )}
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Quer deixar um comentário? <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <Textarea
              rows={3}
              maxLength={1000}
              placeholder="Conte-nos como podemos melhorar..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            {comment.length > 0 && (
              <p className="text-[10px] text-muted-foreground text-right">{comment.length}/1000</p>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={score === null || status === "submitting"}
            className="w-full"
            size="lg"
          >
            {status === "submitting" ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</>
            ) : (
              <><Star className="h-4 w-4 mr-2" /> Enviar Avaliação</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
