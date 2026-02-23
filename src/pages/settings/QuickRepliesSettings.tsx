import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Zap, Plus, Trash2 } from "lucide-react";

export default function QuickRepliesSettings() {
  const { data: tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: replies = [], isLoading } = useQuery({
    queryKey: ["quick-replies", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_quick_replies")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const handleAdd = async () => {
    if (!title.trim() || !message.trim() || !tenantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("whatsapp_quick_replies").insert({
        tenant_id: tenantId,
        title: title.trim(),
        message: message.trim(),
        sort_order: replies.length,
      });
      if (error) throw error;
      setTitle("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
      toast({ title: "Resposta rápida adicionada" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("whatsapp_quick_replies").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    toast({ title: "Resposta rápida removida" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Respostas Rápidas do WhatsApp
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure mensagens pré-definidas para agilizar o atendimento.
        </p>
      </div>

      {/* Add new */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Nova Resposta Rápida</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Título (ex: Saudação)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Mensagem (ex: Olá! Como posso ajudar?)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[80px]"
          />
          <Button onClick={handleAdd} disabled={saving || !title.trim() || !message.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : replies.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma resposta rápida cadastrada.</p>
        ) : (
          replies.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-medium text-sm">{r.title}</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{r.message}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
