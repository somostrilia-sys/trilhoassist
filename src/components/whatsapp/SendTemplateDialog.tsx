import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Send } from "lucide-react";

interface SendTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPhone?: string;
  conversationId?: string;
  onSent?: () => void;
}

export function SendTemplateDialog({ open, onOpenChange, defaultPhone, conversationId, onSent }: SendTemplateDialogProps) {
  const { data: tenantId } = useTenantId();
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["whatsapp-templates-active", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_templates" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("name");
      return data ?? [];
    },
    enabled: !!tenantId && open,
  });

  const selectedTemplate = templates.find((t: any) => t.id === selectedTemplateId) as any;

  const extractVariables = (text: string): string[] => {
    const matches = text?.match(/\{\{\d+\}\}/g);
    return matches ? [...new Set(matches)].sort() : [];
  };

  const templateVars = selectedTemplate ? extractVariables(selectedTemplate.body_text) : [];

  const getPreview = () => {
    if (!selectedTemplate) return "";
    let text = selectedTemplate.body_text;
    templateVars.forEach((v) => {
      text = text.replace(v, variables[v] || v);
    });
    return text;
  };

  const handleSend = async () => {
    if (!selectedTemplate || !phone.trim()) {
      toast({ title: "Selecione um template e informe o telefone", variant: "destructive" });
      return;
    }
    // Check all variables are filled
    const missing = templateVars.filter((v) => !variables[v]?.trim());
    if (missing.length > 0) {
      toast({ title: "Preencha todas as variáveis", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      // Build components for Meta API
      const bodyParams = templateVars.map((v) => ({
        type: "text",
        text: variables[v],
      }));

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          phone: phone.trim(),
          conversation_id: conversationId || null,
          tenant_id: tenantId,
          template: {
            name: selectedTemplate.meta_template_name,
            language: selectedTemplate.language,
            components: bodyParams.length > 0
              ? [{ type: "body", parameters: bodyParams }]
              : [],
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Template enviado com sucesso!" });
      onOpenChange(false);
      setSelectedTemplateId("");
      setVariables({});
      setPhone(defaultPhone || "");
      onSent?.();
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar Template HSM</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Telefone do destinatário *</Label>
            <Input
              placeholder="5511999887766"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Template *</Label>
            <Select value={selectedTemplateId} onValueChange={(v) => { setSelectedTemplateId(v); setVariables({}); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum template ativo. Cadastre em Configurações → Templates HSM.
              </p>
            )}
          </div>

          {templateVars.length > 0 && (
            <div className="space-y-2">
              <Label>Variáveis</Label>
              {templateVars.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <span className="text-sm font-mono bg-muted px-2 py-1 rounded w-14 text-center">{v}</span>
                  <Input
                    placeholder={`Valor para ${v}`}
                    value={variables[v] || ""}
                    onChange={(e) => setVariables({ ...variables, [v]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}

          {selectedTemplate && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Prévia</p>
              {selectedTemplate.header_text && (
                <p className="font-semibold text-sm mb-1">{selectedTemplate.header_text}</p>
              )}
              <p className="text-sm whitespace-pre-wrap">{getPreview()}</p>
              {selectedTemplate.footer_text && (
                <p className="text-xs text-muted-foreground mt-1">{selectedTemplate.footer_text}</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSend} disabled={sending || !selectedTemplateId}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Enviando..." : "Enviar Template"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
