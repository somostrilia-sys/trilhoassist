import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { extractVerificationFromChat } from "@/lib/extractVerificationFromChat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantId } from "@/hooks/useFinancialData";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Info, FileText } from "lucide-react";
import { ConversationList } from "@/components/whatsapp/ConversationList";
import { ChatArea } from "@/components/whatsapp/ChatArea";
import { ContactInfoPanel } from "@/components/whatsapp/ContactInfoPanel";
import { SendTemplateDialog } from "@/components/whatsapp/SendTemplateDialog";
import { Button } from "@/components/ui/button";

export default function WhatsAppQueue() {
  const { user } = useAuth();
  const { data: tenantId } = useTenantId();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  // Fetch all conversations (including closed for filter)
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["whatsapp-conversations", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("*, beneficiaries(id, name, vehicle_plate, vehicle_model, vehicle_year, client_id, clients(name))")
        .eq("tenant_id", tenantId!)
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

  // Quick replies
  const { data: quickReplies = [] } = useQuery({
    queryKey: ["quick-replies", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_quick_replies")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  // Operators
  const { data: operators = [] } = useQuery({
    queryKey: ["operators-profiles", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  // Notification sound using Web Audio API
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playNotificationSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio not available
    }
  }, []);

  // Realtime
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel("whatsapp-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations" }, () => {
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
        if ((payload.new as any)?.direction === "inbound") {
          playNotificationSound();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, queryClient, playNotificationSound]);

  const getOperatorName = (userId: string | null) => {
    if (!userId) return null;
    const op = operators.find((o: any) => o.user_id === userId);
    return op?.full_name || "Atendente";
  };

  const selectedConv = conversations.find((c: any) => c.id === selectedConversation);

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConv || sending) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: { phone: selectedConv.phone, message: replyText.trim(), conversation_id: selectedConv.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    } catch (err: any) {
      toast({
        title: "Erro ao enviar",
        description: err.message || "Verifique as credenciais do WhatsApp.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleQuickReply = (message: string) => {
    setReplyText(message);
  };

  const handleAssignToMe = async () => {
    if (!selectedConv || !user) return;
    await supabase.from("whatsapp_conversations").update({ assigned_to: user.id }).eq("id", selectedConv.id);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    toast({ title: "Conversa atribuída a você" });
  };

  const handleTransfer = async (userId: string) => {
    if (!selectedConv) return;
    await supabase.from("whatsapp_conversations").update({ assigned_to: userId }).eq("id", selectedConv.id);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    toast({ title: "Conversa transferida" });
  };

  const handleTogglePriority = async () => {
    if (!selectedConv) return;
    const newPriority = (selectedConv as any).priority === "high" ? "normal" : "high";
    await supabase.from("whatsapp_conversations").update({ priority: newPriority }).eq("id", selectedConv.id);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    toast({ title: newPriority === "high" ? "Marcado como urgente" : "Urgência removida" });
  };

  const handleAddTag = async (tag: string) => {
    if (!selectedConv) return;
    const currentTags = (selectedConv as any).tags || [];
    if (currentTags.includes(tag)) return;
    await supabase
      .from("whatsapp_conversations")
      .update({ tags: [...currentTags, tag] })
      .eq("id", selectedConv.id);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
  };

  const handleRemoveTag = async (tag: string) => {
    if (!selectedConv) return;
    const currentTags = ((selectedConv as any).tags || []).filter((t: string) => t !== tag);
    await supabase.from("whatsapp_conversations").update({ tags: currentTags }).eq("id", selectedConv.id);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
  };

  const handleCloseConversation = async () => {
    if (!selectedConv) return;
    await supabase.from("whatsapp_conversations").update({ status: "closed" }).eq("id", selectedConv.id);
    queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    setSelectedConversation(null);
    toast({ title: "Conversa encerrada" });
  };

  const handleCreateService = () => {
    if (!selectedConv) return;
    const b = selectedConv.beneficiaries as any;
    const params = new URLSearchParams();
    params.set("phone", selectedConv.phone || "");
    params.set("name", selectedConv.contact_name || (selectedConv as any).detected_beneficiary_name || b?.name || "");
    const plate = (selectedConv as any).detected_plate || b?.vehicle_plate;
    if (plate) params.set("plate", plate);
    const model = (selectedConv as any).detected_vehicle_model || b?.vehicle_model;
    if (model) params.set("model", model);
    const year = (selectedConv as any).detected_vehicle_year || b?.vehicle_year;
    if (year) params.set("year", String(year));
    const lat = (selectedConv as any).origin_lat;
    const lng = (selectedConv as any).origin_lng;
    if (lat && lng) params.set("origin_coords", `${lat},${lng}`);
    // Destination coordinates
    const destLat = (selectedConv as any).destination_lat;
    const destLng = (selectedConv as any).destination_lng;
    if (destLat && destLng) params.set("destination_coords", `${destLat},${destLng}`);
    params.set("conversation_id", selectedConv.id);

    // Extract verification answers from chat messages
    const extracted = extractVerificationFromChat(messages);
    if (extracted.vehicle_category) params.set("vehicle_category", extracted.vehicle_category);
    if (extracted.service_type) params.set("service_type", extracted.service_type);
    if (extracted.event_type) params.set("event_type", extracted.event_type);
    if (extracted.vehicle_lowered !== undefined) params.set("vehicle_lowered", String(extracted.vehicle_lowered));
    if (extracted.difficult_access !== undefined) params.set("difficult_access", String(extracted.difficult_access));

    // Pass verification answers as JSON
    if (Object.keys(extracted.carVerification).length > 0) {
      params.set("car_verification", JSON.stringify(extracted.carVerification));
    }
    if (Object.keys(extracted.motoVerification).length > 0) {
      params.set("moto_verification", JSON.stringify(extracted.motoVerification));
    }
    if (Object.keys(extracted.truckVerification).length > 0) {
      params.set("truck_verification", JSON.stringify(extracted.truckVerification));
    }

    // Also look for destination address from location messages
    const locationMsgs = messages.filter((m: any) => m.message_type === "location" && m.latitude && m.longitude);
    if (locationMsgs.length >= 2) {
      // Second location = destination
      const destMsg = locationMsgs[1];
      if (!destLat) {
        params.set("destination_coords", `${destMsg.latitude},${destMsg.longitude}`);
      }
    }

    const lastMsgs = messages
      .filter((m: any) => m.direction === "inbound" && m.content)
      .slice(-5)
      .map((m: any) => m.content)
      .join("\n");
    if (lastMsgs) params.set("notes", lastMsgs);
    navigate(`/operation/new?${params.toString()}`);
  };

  const activeCount = conversations.filter((c: any) => c.status !== "closed").length;

  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-600" />
            WhatsApp CRM
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeCount} conversa(s) ativa(s) · Evolution API
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTemplateDialog(true)}>
            <FileText className="h-4 w-4 mr-1" />
            Enviar Template
          </Button>
          {selectedConv && (
            <Button
              variant={showInfo ? "default" : "outline"}
              size="sm"
              onClick={() => setShowInfo(!showInfo)}
              className="lg:flex hidden"
            >
              <Info className="h-4 w-4 mr-1" />
              {showInfo ? "Ocultar Painel" : "Informações"}
            </Button>
          )}
        </div>
      </div>

      <div className={`grid gap-4 h-[calc(100%-4rem)] ${
        showInfo && selectedConv
          ? "grid-cols-1 lg:grid-cols-[320px_1fr_320px]"
          : "grid-cols-1 lg:grid-cols-[320px_1fr]"
      }`}>
        {/* Conversation list */}
        <Card className="flex flex-col overflow-hidden">
          <ConversationList
            conversations={conversations}
            isLoading={isLoading}
            selectedId={selectedConversation}
            onSelect={setSelectedConversation}
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
            currentUserId={user?.id}
            getOperatorName={getOperatorName}
          />
        </Card>

        {/* Chat area */}
        <Card className="flex flex-col overflow-hidden">
          {selectedConv ? (
            <ChatArea
              conversation={selectedConv}
              messages={messages}
              sending={sending}
              replyText={replyText}
              onReplyChange={setReplyText}
              onSendReply={handleSendReply}
              onAssignToMe={handleAssignToMe}
              onClose={handleCloseConversation}
              onCreateService={handleCreateService}
              onTogglePriority={handleTogglePriority}
              onTransfer={handleTransfer}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              currentUserId={user?.id}
              getOperatorName={getOperatorName}
              operators={operators}
              quickReplies={quickReplies}
              onQuickReply={handleQuickReply}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Selecione uma conversa para visualizar</p>
              </div>
            </div>
          )}
        </Card>

        {/* Info panel */}
        {showInfo && selectedConv && (
          <Card className="hidden lg:flex flex-col overflow-hidden">
            <ContactInfoPanel
              conversation={selectedConv}
              currentUserId={user?.id}
            />
          </Card>
        )}
      </div>

      <SendTemplateDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        defaultPhone={selectedConv?.phone || ""}
        conversationId={selectedConv?.id}
        onSent={() => {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
          queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
        }}
      />
    </div>
  );
}
