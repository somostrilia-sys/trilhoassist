import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Zap, Plus, Trash2, GitBranch, GripVertical, ArrowDown, Clock, Car, Bike, Truck, Power, PowerOff } from "lucide-react";

const CATEGORY_OPTIONS = [
  { value: "car", label: "Veículo", icon: Car },
  { value: "motorcycle", label: "Motocicleta", icon: Bike },
  { value: "truck", label: "Caminhão", icon: Truck },
];

export default function QuickRepliesSettings() {
  const { data: tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Quick replies state
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Flow state
  const [flowName, setFlowName] = useState("");
  const [flowCategory, setFlowCategory] = useState("car");
  const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
  const [newStepText, setNewStepText] = useState("");
  const [newStepTimeout, setNewStepTimeout] = useState("3");
  const [newStepIsFirst, setNewStepIsFirst] = useState(false);

  // Queries
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

  const { data: flows = [] } = useQuery({
    queryKey: ["whatsapp-flows", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_flows")
        .select("*, whatsapp_flow_steps(*)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((f: any) => ({
        ...f,
        whatsapp_flow_steps: (f.whatsapp_flow_steps || []).sort(
          (a: any, b: any) => a.step_order - b.step_order
        ),
      }));
    },
    enabled: !!tenantId,
  });

  // Quick reply handlers
  const handleAddReply = async () => {
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

  const handleDeleteReply = async (id: string) => {
    await supabase.from("whatsapp_quick_replies").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
    toast({ title: "Resposta rápida removida" });
  };

  // Flow handlers
  const handleCreateFlow = async () => {
    if (!flowName.trim() || !tenantId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("whatsapp_flows")
        .insert({ tenant_id: tenantId, name: flowName.trim(), vehicle_category: flowCategory })
        .select()
        .single();
      if (error) throw error;
      setFlowName("");
      setEditingFlowId(data.id);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-flows"] });
      toast({ title: "Fluxo criado" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFlow = async (flowId: string, active: boolean) => {
    await supabase.from("whatsapp_flows").update({ active: !active }).eq("id", flowId);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-flows"] });
  };

  const handleDeleteFlow = async (flowId: string) => {
    await supabase.from("whatsapp_flows").delete().eq("id", flowId);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-flows"] });
    if (editingFlowId === flowId) setEditingFlowId(null);
    toast({ title: "Fluxo removido" });
  };

  const handleAddStep = async () => {
    if (!editingFlowId || !newStepText.trim()) return;
    const flow = flows.find((f: any) => f.id === editingFlowId);
    const nextOrder = (flow?.whatsapp_flow_steps?.length || 0) + 1;
    setSaving(true);
    try {
      const { error } = await supabase.from("whatsapp_flow_steps").insert({
        flow_id: editingFlowId,
        step_order: nextOrder,
        message_text: newStepText.trim(),
        timeout_minutes: parseInt(newStepTimeout) || 3,
        is_first_manual: nextOrder === 1,
      });
      if (error) throw error;
      setNewStepText("");
      setNewStepTimeout("3");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-flows"] });
      toast({ title: "Passo adicionado" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    await supabase.from("whatsapp_flow_steps").delete().eq("id", stepId);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-flows"] });
    toast({ title: "Passo removido" });
  };

  const editingFlow = flows.find((f: any) => f.id === editingFlowId);
  const categoryIcon = (cat: string) => {
    const opt = CATEGORY_OPTIONS.find(o => o.value === cat);
    if (!opt) return null;
    const Icon = opt.icon;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Respostas Rápidas & Fluxos
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure respostas pré-definidas e fluxos automatizados de atendimento.
        </p>
      </div>

      <Tabs defaultValue="quick-replies">
        <TabsList>
          <TabsTrigger value="quick-replies" className="gap-1">
            <Zap className="h-3.5 w-3.5" /> Respostas Rápidas
          </TabsTrigger>
          <TabsTrigger value="flows" className="gap-1">
            <GitBranch className="h-3.5 w-3.5" /> Fluxos Automáticos
          </TabsTrigger>
        </TabsList>

        {/* ========== TAB: QUICK REPLIES ========== */}
        <TabsContent value="quick-replies" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Nova Resposta Rápida</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Título (ex: Saudação)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea placeholder="Mensagem (ex: Olá! Como posso ajudar?)" value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[80px]" />
              <Button onClick={handleAddReply} disabled={saving || !title.trim() || !message.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </CardContent>
          </Card>

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
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteReply(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* ========== TAB: FLOWS ========== */}
        <TabsContent value="flows" className="space-y-4">
          {/* Create flow */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Novo Fluxo de Atendimento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3">
                <Input placeholder="Nome do fluxo (ex: Verificação Carro)" value={flowName} onChange={(e) => setFlowName(e.target.value)} className="flex-1" />
                <Select value={flowCategory} onValueChange={setFlowCategory}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="flex items-center gap-2">
                          <o.icon className="h-3.5 w-3.5" /> {o.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                A 1ª mensagem é enviada manualmente pelo operador. As seguintes serão enviadas automaticamente após a resposta do cliente ou após o timeout configurado.
              </p>
              <Button onClick={handleCreateFlow} disabled={saving || !flowName.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Criar Fluxo
              </Button>
            </CardContent>
          </Card>

          {/* Flow list */}
          <div className="space-y-3">
            {flows.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum fluxo cadastrado.</p>
            ) : (
              flows.map((flow: any) => (
                <Card key={flow.id} className={editingFlowId === flow.id ? "ring-2 ring-primary" : ""}>
                  <CardContent className="pt-4 space-y-3">
                    {/* Flow header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {categoryIcon(flow.vehicle_category)}
                        <span className="font-medium text-sm">{flow.name}</span>
                        <Badge variant={flow.active ? "default" : "secondary"} className="text-xs">
                          {flow.active ? "Ativo" : "Inativo"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {flow.whatsapp_flow_steps?.length || 0} passos
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleToggleFlow(flow.id, flow.active)} title={flow.active ? "Desativar" : "Ativar"}>
                          {flow.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingFlowId(editingFlowId === flow.id ? null : flow.id)}>
                          {editingFlowId === flow.id ? "Fechar" : "Editar"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteFlow(flow.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Steps (when editing) */}
                    {editingFlowId === flow.id && (
                      <div className="space-y-3 pt-2 border-t">
                        {/* Existing steps */}
                        {flow.whatsapp_flow_steps?.map((step: any, idx: number) => (
                          <div key={step.id} className="flex items-start gap-2">
                            <div className="flex flex-col items-center mt-1">
                              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                                {idx + 1}
                              </div>
                              {idx < flow.whatsapp_flow_steps.length - 1 && (
                                <ArrowDown className="h-4 w-4 text-muted-foreground mt-1" />
                              )}
                            </div>
                            <div className="flex-1 rounded-md border p-2 space-y-1">
                              <p className="text-xs whitespace-pre-wrap">{step.message_text}</p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                {step.is_first_manual && <Badge variant="outline" className="text-[10px] px-1 py-0">Manual</Badge>}
                                <span className="flex items-center gap-0.5">
                                  <Clock className="h-3 w-3" /> Timeout: {step.timeout_minutes}min
                                </span>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="mt-1" onClick={() => handleDeleteStep(step.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ))}

                        {/* Add step */}
                        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                          <Label className="text-xs font-medium">Adicionar passo</Label>
                          <Textarea
                            placeholder="Mensagem deste passo..."
                            value={newStepText}
                            onChange={(e) => setNewStepText(e.target.value)}
                            className="min-h-[60px] text-sm"
                          />
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <Label className="text-xs whitespace-nowrap">Timeout (min):</Label>
                              <Input
                                type="number"
                                min="1"
                                max="60"
                                value={newStepTimeout}
                                onChange={(e) => setNewStepTimeout(e.target.value)}
                                className="w-20 h-8 text-sm"
                              />
                            </div>
                            <Button size="sm" onClick={handleAddStep} disabled={saving || !newStepText.trim()}>
                              <Plus className="h-3 w-3 mr-1" /> Passo
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
