import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Trash2, Edit2, X, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface TemplateForm {
  name: string;
  meta_template_name: string;
  language: string;
  category: string;
  header_text: string;
  body_text: string;
  footer_text: string;
}

const emptyForm: TemplateForm = {
  name: "",
  meta_template_name: "",
  language: "pt_BR",
  category: "UTILITY",
  header_text: "",
  body_text: "",
  footer_text: "",
};

export default function TemplatesSettings() {
  const { data: tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["whatsapp-templates", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_templates" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  // Extract variables from body_text (e.g., {{1}}, {{2}})
  const extractVariables = (text: string) => {
    const matches = text.match(/\{\{\d+\}\}/g);
    return matches ? [...new Set(matches)].sort() : [];
  };

  const handleSave = async () => {
    if (!form.name || !form.meta_template_name || !form.body_text || !tenantId) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const variables = extractVariables(form.body_text);
      const payload = {
        ...form,
        tenant_id: tenantId,
        variables: variables.map((v, i) => ({ placeholder: v, index: i + 1, label: `Variável ${i + 1}` })),
      };

      if (editingId) {
        const { error } = await supabase
          .from("whatsapp_templates" as any)
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast({ title: "Template atualizado" });
      } else {
        const { error } = await supabase
          .from("whatsapp_templates" as any)
          .insert(payload);
        if (error) throw error;
        toast({ title: "Template cadastrado" });
      }
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      setForm(emptyForm);
      setEditingId(null);
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (tpl: any) => {
    setForm({
      name: tpl.name,
      meta_template_name: tpl.meta_template_name,
      language: tpl.language,
      category: tpl.category,
      header_text: tpl.header_text || "",
      body_text: tpl.body_text,
      footer_text: tpl.footer_text || "",
    });
    setEditingId(tpl.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("whatsapp_templates" as any).delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    toast({ title: "Template removido" });
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    await supabase.from("whatsapp_templates" as any).update({ active: !active }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
  };

  const preview = form.body_text || "Prévia do template aparecerá aqui...";
  const vars = extractVariables(form.body_text);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Templates HSM
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastre templates pré-aprovados pela Meta para iniciar conversas
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setForm(emptyForm); setEditingId(null); }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Novo Template</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar Template" : "Novo Template HSM"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome interno *</Label>
                  <Input
                    placeholder="Ex: Confirmação de atendimento"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome do template na Meta *</Label>
                  <Input
                    placeholder="Ex: confirmacao_atendimento"
                    value={form.meta_template_name}
                    onChange={(e) => setForm({ ...form, meta_template_name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Idioma</Label>
                  <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt_BR">Português (BR)</SelectItem>
                      <SelectItem value="en_US">English (US)</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTILITY">Utilidade</SelectItem>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cabeçalho (opcional)</Label>
                <Input
                  placeholder="Ex: Atualização do seu atendimento"
                  value={form.header_text}
                  onChange={(e) => setForm({ ...form, header_text: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Corpo da mensagem *</Label>
                <Textarea
                  placeholder="Use {{1}}, {{2}} para variáveis. Ex: Olá {{1}}, seu atendimento {{2}} está confirmado."
                  value={form.body_text}
                  onChange={(e) => setForm({ ...form, body_text: e.target.value })}
                  rows={4}
                />
                {vars.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">Variáveis detectadas:</span>
                    {vars.map((v) => (
                      <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Rodapé (opcional)</Label>
                <Input
                  placeholder="Ex: Trilho Soluções"
                  value={form.footer_text}
                  onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
                />
              </div>

              {/* Preview */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Prévia</p>
                {form.header_text && <p className="font-semibold text-sm mb-1">{form.header_text}</p>}
                <p className="text-sm whitespace-pre-wrap">{preview}</p>
                {form.footer_text && <p className="text-xs text-muted-foreground mt-2">{form.footer_text}</p>}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setDialogOpen(false); setForm(emptyForm); setEditingId(null); }}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Salvando..." : editingId ? "Atualizar" : "Cadastrar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Nenhum template cadastrado</p>
            <p className="text-xs mt-1">Cadastre templates aprovados pela Meta para iniciar conversas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates.map((tpl: any) => {
            const vars = extractVariables(tpl.body_text);
            return (
              <Card key={tpl.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{tpl.name}</h3>
                        <Badge variant={tpl.active ? "default" : "secondary"} className="text-xs">
                          {tpl.active ? "Ativo" : "Inativo"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{tpl.category}</Badge>
                        <Badge variant="outline" className="text-xs">{tpl.language}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Meta: <code className="bg-muted px-1 rounded">{tpl.meta_template_name}</code>
                      </p>
                      {tpl.header_text && <p className="text-sm font-medium">{tpl.header_text}</p>}
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{tpl.body_text}</p>
                      {tpl.footer_text && <p className="text-xs text-muted-foreground mt-1">{tpl.footer_text}</p>}
                      {vars.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {vars.map((v) => (
                            <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleToggleActive(tpl.id, tpl.active)}>
                        {tpl.active ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(tpl)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(tpl.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
