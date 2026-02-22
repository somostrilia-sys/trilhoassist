import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Phone, User, Clock, Plus, Search, ArrowRight, X, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  pending_service: "Pré-Atendimento",
  service_created: "Atendimento Criado",
  closed: "Encerrado",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  pending_service: "bg-amber-100 text-amber-800",
  service_created: "bg-green-100 text-green-800",
  closed: "bg-muted text-muted-foreground",
};

export default function WhatsAppQueue() {
  const { data: tenantId } = useTenantId();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["whatsapp-conversations", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("*, beneficiaries(id, name, vehicle_plate, vehicle_model, client_id, clients(name))")
        .eq("tenant_id", tenantId!)
        .in("status", ["open", "pending_service"])
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
    refetchInterval: 5000,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["whatsapp-messages", selectedConversation],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", selectedConversation!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedConversation,
    refetchInterval: 3000,
  });

  // Realtime subscription
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("whatsapp-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, queryClient]);

  const selectedConv = conversations.find((c: any) => c.id === selectedConversation);

  const filteredConversations = conversations.filter((c: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.phone?.includes(s) ||
      c.contact_name?.toLowerCase().includes(s) ||
      (c.beneficiaries as any)?.name?.toLowerCase().includes(s)
    );
  });

  const handleCreateService = () => {
    if (!selectedConv) return;
    const b = selectedConv.beneficiaries as any;
    const params = new URLSearchParams();
    params.set("phone", selectedConv.phone || "");
    params.set("name", selectedConv.contact_name || (selectedConv as any).detected_beneficiary_name || b?.name || "");
    
    // Use detected plate or beneficiary plate
    const plate = (selectedConv as any).detected_plate || b?.vehicle_plate;
    if (plate) params.set("plate", plate);
    
    const model = (selectedConv as any).detected_vehicle_model || b?.vehicle_model;
    if (model) params.set("model", model);
    
    const year = (selectedConv as any).detected_vehicle_year || b?.vehicle_year;
    if (year) params.set("year", String(year));
    
    // Use stored GPS location as origin
    const lat = (selectedConv as any).origin_lat;
    const lng = (selectedConv as any).origin_lng;
    if (lat && lng) params.set("origin_coords", `${lat},${lng}`);
    
    params.set("conversation_id", selectedConv.id);

    // Collect last text messages as notes
    const lastMsgs = messages
      .filter((m: any) => m.direction === "inbound" && m.content)
      .slice(-5)
      .map((m: any) => m.content)
      .join("\n");
    if (lastMsgs) params.set("notes", lastMsgs);

    navigate(`/operation/new?${params.toString()}`);
  };

  const handleCloseConversation = async (id: string) => {
    await supabase.from("whatsapp_conversations").update({ status: "closed" }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    if (selectedConversation === id) setSelectedConversation(null);
    toast({ title: "Conversa encerrada" });
  };

  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-600" />
            WhatsApp - Fila de Atendimento
          </h1>
          <p className="text-sm text-muted-foreground">
            Conversas recebidas via WhatsApp · {conversations.length} ativa(s)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100%-4rem)]">
        {/* Conversation list */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader className="pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full">
              {isLoading ? (
                <div className="p-4 text-center text-muted-foreground">Carregando...</div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">Nenhuma conversa ativa</div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredConversations.map((conv: any) => {
                    const b = conv.beneficiaries as any;
                    return (
                      <button
                        key={conv.id}
                        onClick={() => setSelectedConversation(conv.id)}
                        className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                          selectedConversation === conv.id ? "bg-muted" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {conv.contact_name || b?.name || "Desconhecido"}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {formatPhone(conv.phone)}
                            </p>
                            {b?.vehicle_plate && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                🚗 {b.vehicle_plate} - {b.vehicle_model}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="secondary" className={STATUS_COLORS[conv.status] || ""}>
                              {STATUS_LABELS[conv.status] || conv.status}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {conv.last_message_at &&
                                formatDistanceToNow(new Date(conv.last_message_at), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat area */}
        <Card className="lg:col-span-2 flex flex-col">
          {selectedConv ? (
            <>
              <CardHeader className="pb-2 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {selectedConv.contact_name || "Desconhecido"}
                      <span className="text-muted-foreground font-normal">
                        · {formatPhone(selectedConv.phone)}
                      </span>
                    </CardTitle>
                    {(selectedConv.beneficiaries as any)?.name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Beneficiário: {(selectedConv.beneficiaries as any).name}
                        {(selectedConv.beneficiaries as any)?.clients?.name &&
                          ` · ${(selectedConv.beneficiaries as any).clients.name}`}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleCloseConversation(selectedConv.id)}>
                      <X className="h-4 w-4 mr-1" /> Encerrar
                    </Button>
                    <Button size="sm" onClick={handleCreateService}>
                      <Plus className="h-4 w-4 mr-1" /> Criar Atendimento
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full p-4">
                  <div className="space-y-3">
                    {messages.map((msg: any) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                            msg.direction === "outbound"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          {msg.message_type === "location" ? (
                            <a
                              href={`https://maps.google.com/?q=${msg.latitude},${msg.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline flex items-center gap-1"
                            >
                              📍 Ver localização
                            </a>
                          ) : msg.media_url ? (
                            <div>
                              <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="underline">
                                📎 Mídia
                              </a>
                              {msg.content && <p className="mt-1">{msg.content}</p>}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                          <p className="text-[10px] opacity-60 mt-1">
                            {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Selecione uma conversa para visualizar</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function formatPhone(phone: string) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return phone;
}
