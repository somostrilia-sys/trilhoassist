import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileText, Eye, Loader2, CheckCircle2, XCircle, Clock, Download,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const NF_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  attached: { label: "NF Anexada", variant: "secondary" },
  approved: { label: "Aprovada", variant: "default" },
  rejected: { label: "Rejeitada", variant: "destructive" },
};

export function ProviderInvoiceReview({ dispatchId }: { dispatchId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [observation, setObservation] = useState("");
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["provider-invoice-review", dispatchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_invoices")
        .select("*")
        .eq("dispatch_id", dispatchId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!dispatchId,
  });

  const handleReview = async (action: "approved" | "rejected") => {
    setReviewAction(action);
    setReviewDialogOpen(true);
  };

  const confirmReview = async () => {
    if (!invoice) return;
    setReviewLoading(true);
    try {
      const { error } = await supabase
        .from("provider_invoices")
        .update({
          status: reviewAction,
          observation: observation.trim() || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id || null,
        })
        .eq("id", invoice.id);
      if (error) throw error;
      toast.success(reviewAction === "approved" ? "NF aprovada!" : "NF rejeitada.");
      queryClient.invalidateQueries({ queryKey: ["provider-invoice-review", dispatchId] });
      setReviewDialogOpen(false);
      setObservation("");
    } catch (err: any) {
      toast.error("Erro ao revisar NF: " + err.message);
    } finally {
      setReviewLoading(false);
    }
  };

  if (isLoading) return null;
  if (!invoice) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" /> NOTA FISCAL DO PRESTADOR
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Aguardando envio da NF pelo prestador.
          </p>
        </CardContent>
      </Card>
    );
  }

  const status = NF_STATUS[invoice.status] || NF_STATUS.pending;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" /> NOTA FISCAL DO PRESTADOR
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={status.variant}>{status.label}</Badge>
                <span className="text-sm text-muted-foreground">{invoice.file_name}</span>
              </div>
              {invoice.uploaded_at && (
                <p className="text-xs text-muted-foreground">
                  Enviada em: {new Date(invoice.uploaded_at).toLocaleDateString("pt-BR")} às{" "}
                  {new Date(invoice.uploaded_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              {invoice.observation && (
                <p className="text-xs text-destructive">Obs: {invoice.observation}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  setPreviewName(invoice.file_name);
                  setPreviewUrl(invoice.file_url);
                }}
              >
                <Eye className="h-4 w-4" />
                Visualizar
              </Button>
              <Button variant="outline" size="sm" className="gap-1" asChild>
                <a href={invoice.file_url} target="_blank" rel="noopener noreferrer" download>
                  <Download className="h-4 w-4" />
                  Baixar
                </a>
              </Button>
            </div>
          </div>

          {(invoice.status === "attached" || invoice.status === "pending") && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                size="sm"
                className="gap-1"
                onClick={() => handleReview("approved")}
              >
                <CheckCircle2 className="h-4 w-4" />
                Aprovar NF
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1"
                onClick={() => handleReview("rejected")}
              >
                <XCircle className="h-4 w-4" />
                Rejeitar NF
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approved" ? "Aprovar Nota Fiscal" : "Rejeitar Nota Fiscal"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder={reviewAction === "rejected" ? "Motivo da rejeição (obrigatório)" : "Observação (opcional)"}
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant={reviewAction === "approved" ? "default" : "destructive"}
              disabled={reviewLoading || (reviewAction === "rejected" && !observation.trim())}
              onClick={confirmReview}
            >
              {reviewLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{previewName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {previewUrl && (
              previewName.toLowerCase().endsWith(".pdf") ? (
                <iframe src={previewUrl} className="w-full h-[60vh] rounded border" />
              ) : (
                <img src={previewUrl} alt="Nota Fiscal" className="w-full rounded" />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
