import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviderData } from "@/hooks/useProviderData";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText, Upload, Eye, Loader2, CheckCircle2, XCircle, Clock, AlertCircle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const NF_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pendente", variant: "outline", icon: Clock },
  attached: { label: "NF Anexada", variant: "secondary", icon: FileText },
  approved: { label: "Aprovada", variant: "default", icon: CheckCircle2 },
  rejected: { label: "Rejeitada", variant: "destructive", icon: XCircle },
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function ProviderInvoices() {
  const { provider, dispatches, isLoading } = useProviderData();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState("");

  // Only completed dispatches
  const completedDispatches = dispatches.filter((d) => d.status === "completed");

  // Fetch existing invoices for this provider
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["provider-invoices", provider?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_invoices")
        .select("*")
        .eq("provider_id", provider!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!provider?.id,
  });

  const invoiceMap = new Map(invoices.map((inv: any) => [inv.dispatch_id, inv]));

  const handleFileSelect = async (dispatchId: string, file: File) => {
    if (!provider?.id) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Formato não aceito. Use PDF, JPG ou PNG.");
      return;
    }

    setUploadingId(dispatchId);
    try {
      const ext = file.name.split(".").pop();
      const path = `${provider.id}/${dispatchId}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("provider-invoices")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("provider-invoices")
        .getPublicUrl(path);

      // Since bucket is private, we use signed URL approach
      const { data: signedData, error: signedErr } = await supabase.storage
        .from("provider-invoices")
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

      const fileUrl = signedData?.signedUrl || urlData.publicUrl;

      // Check if there's already an invoice for this dispatch
      const existing = invoiceMap.get(dispatchId);
      if (existing) {
        const { error } = await supabase
          .from("provider_invoices")
          .update({
            file_url: fileUrl,
            file_name: file.name,
            file_size: file.size,
            status: "attached",
            uploaded_at: new Date().toISOString(),
            observation: null,
            reviewed_at: null,
            reviewed_by: null,
          })
          .eq("id", (existing as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("provider_invoices").insert({
          dispatch_id: dispatchId,
          provider_id: provider.id,
          file_url: fileUrl,
          file_name: file.name,
          file_size: file.size,
          status: "attached",
        });
        if (error) throw error;
      }

      toast.success("Nota fiscal anexada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["provider-invoices"] });
    } catch (err: any) {
      toast.error("Erro ao enviar NF: " + (err.message || "Tente novamente"));
    } finally {
      setUploadingId(null);
    }
  };

  const openPreview = async (inv: any) => {
    setPreviewName(inv.file_name);
    setPreviewUrl(inv.file_url);
  };

  if (isLoading || invoicesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notas Fiscais</h1>
        <p className="text-muted-foreground">Anexe NFs dos atendimentos concluídos</p>
      </div>

      {completedDispatches.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhum atendimento concluído para anexar NF.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {completedDispatches.map((dispatch) => {
            const sr = dispatch.service_requests as any;
            const inv = invoiceMap.get(dispatch.id) as any;
            const nfStatus = inv ? NF_STATUS[inv.status] || NF_STATUS.pending : NF_STATUS.pending;
            const StatusIcon = nfStatus.icon;
            const amount = Number(dispatch.final_amount || dispatch.quoted_amount || 0);

            return (
              <Card key={dispatch.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">
                          {sr?.protocol || "—"}
                        </span>
                        <Badge variant={nfStatus.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {nfStatus.label}
                        </Badge>
                      </div>
                      <p className="text-sm truncate">
                        <span className="text-muted-foreground">Beneficiário:</span>{" "}
                        {sr?.requester_name || "—"}
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">
                          {sr?.created_at
                            ? new Date(sr.created_at).toLocaleDateString("pt-BR")
                            : "—"}
                        </span>
                        <span className="font-semibold text-primary">{fmt(amount)}</span>
                      </div>
                      {inv?.observation && (
                        <p className="text-xs text-destructive mt-1">
                          Obs: {inv.observation}
                        </p>
                      )}
                      {inv?.uploaded_at && (
                        <p className="text-xs text-muted-foreground">
                          Enviada em: {new Date(inv.uploaded_at).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {inv && inv.status !== "pending" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPreview(inv)}
                          className="gap-1"
                        >
                          <Eye className="h-4 w-4" />
                          Ver NF
                        </Button>
                      )}

                      {(!inv || inv.status === "pending" || inv.status === "rejected") && (
                        <>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            ref={uploadingId === dispatch.id ? fileInputRef : undefined}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileSelect(dispatch.id, f);
                              e.target.value = "";
                            }}
                          />
                          <Button
                            size="sm"
                            disabled={uploadingId === dispatch.id}
                            onClick={() => {
                              setUploadingId(dispatch.id);
                              // Create a fresh file input
                              const input = document.createElement("input");
                              input.type = "file";
                              input.accept = ".pdf,.jpg,.jpeg,.png";
                              input.onchange = (e) => {
                                const f = (e.target as HTMLInputElement).files?.[0];
                                if (f) handleFileSelect(dispatch.id, f);
                                else setUploadingId(null);
                              };
                              input.click();
                            }}
                            className="gap-1"
                          >
                            {uploadingId === dispatch.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            {inv?.status === "rejected" ? "Reenviar NF" : "Anexar NF"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewName}
            </DialogTitle>
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
          <DialogFooter>
            <Button variant="outline" asChild>
              <a href={previewUrl || "#"} target="_blank" rel="noopener noreferrer">
                Abrir em nova aba
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
