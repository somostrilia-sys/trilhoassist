import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileText, Eye, Loader2, CheckCircle2, XCircle, Clock, Download, Upload,
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

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

function extractStoragePath(fileUrl: string): string | null {
  // Handles both public and signed URLs from Supabase storage
  // Pattern: .../object/public/provider-invoices/PATH or .../object/sign/provider-invoices/PATH?token=...
  const patterns = [
    /\/object\/(?:public|sign)\/provider-invoices\/(.+?)(?:\?|$)/,
    /\/provider-invoices\/(.+?)(?:\?|$)/,
  ];
  for (const p of patterns) {
    const match = fileUrl.match(p);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

async function getSignedUrl(fileUrl: string): Promise<string> {
  const path = extractStoragePath(fileUrl);
  if (!path) return fileUrl; // fallback to original
  const { data, error } = await supabase.storage
    .from("provider-invoices")
    .createSignedUrl(path, 3600); // 1 hour
  if (error || !data?.signedUrl) return fileUrl;
  return data.signedUrl;
}

export function ProviderInvoiceReview({ dispatchId }: { dispatchId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [observation, setObservation] = useState("");
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");

  const { data: dispatch } = useQuery({
    queryKey: ["dispatch-for-invoice", dispatchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatches")
        .select("id, provider_id")
        .eq("id", dispatchId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!dispatchId,
  });

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !dispatch?.provider_id) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Formato não suportado. Use PDF, JPG ou PNG.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${dispatch.provider_id}/${dispatchId}/nf-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("provider-invoices")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("provider-invoices")
        .getPublicUrl(path);

      if (invoice) {
        // Update existing invoice record
        const { error } = await supabase
          .from("provider_invoices")
          .update({
            file_url: urlData.publicUrl,
            file_name: file.name,
            file_size: file.size,
            status: "attached",
            uploaded_at: new Date().toISOString(),
            observation: null,
            reviewed_at: null,
            reviewed_by: null,
          })
          .eq("id", invoice.id);
        if (error) throw error;
      } else {
        // Create new invoice record
        const { error } = await supabase
          .from("provider_invoices")
          .insert({
            dispatch_id: dispatchId,
            provider_id: dispatch.provider_id,
            file_url: urlData.publicUrl,
            file_name: file.name,
            file_size: file.size,
            status: "attached",
            uploaded_at: new Date().toISOString(),
          });
        if (error) throw error;
      }

      toast.success("NF anexada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["provider-invoice-review", dispatchId] });
    } catch (err: any) {
      toast.error("Erro ao anexar NF: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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

  // Hidden file input shared across states
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,.jpg,.jpeg,.png,.webp"
      className="hidden"
      onChange={handleFileUpload}
    />
  );

  const uploadButton = (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      disabled={uploading || !dispatch?.provider_id}
      onClick={() => fileInputRef.current?.click()}
    >
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      {uploading ? "Enviando..." : "Anexar NF"}
    </Button>
  );

  if (!invoice) {
    return (
      <Card>
        {fileInput}
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" /> NOTA FISCAL DO PRESTADOR
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Aguardando envio da NF pelo prestador.
          </p>
          <div className="pt-2 border-t">
            {uploadButton}
          </div>
        </CardContent>
      </Card>
    );
  }

  const status = NF_STATUS[invoice.status] || NF_STATUS.pending;

  return (
    <>
      <Card>
        {fileInput}
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
                onClick={async () => {
                  setPreviewName(invoice.file_name);
                  const url = await getSignedUrl(invoice.file_url);
                  setPreviewUrl(url);
                }}
              >
                <Eye className="h-4 w-4" />
                Visualizar
              </Button>
              <Button variant="outline" size="sm" className="gap-1"
                onClick={async () => {
                  const url = await getSignedUrl(invoice.file_url);
                  window.open(url, "_blank");
                }}
              >
                  <Download className="h-4 w-4" />
                  Baixar
                </a>
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
            {(invoice.status === "attached" || invoice.status === "pending") && (
              <>
                <Button size="sm" className="gap-1" onClick={() => handleReview("approved")}>
                  <CheckCircle2 className="h-4 w-4" />
                  Aprovar NF
                </Button>
                <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleReview("rejected")}>
                  <XCircle className="h-4 w-4" />
                  Rejeitar NF
                </Button>
              </>
            )}
            {uploadButton}
          </div>
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
