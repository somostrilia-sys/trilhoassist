import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  User, Phone, Car, MapPin, Clock, FileText, StickyNote, Send,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ContactInfoPanelProps {
  conversation: any;
  currentUserId?: string;
}

export function ContactInfoPanel({ conversation, currentUserId }: ContactInfoPanelProps) {
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const b = conversation.beneficiaries as any;

  const { data: notes = [] } = useQuery({
    queryKey: ["conversation-notes", conversation.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("whatsapp_conversation_notes")
        .select("*, profiles:user_id(full_name)")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Fetch service request linked to conversation
  const { data: linkedRequest } = useQuery({
    queryKey: ["linked-request", conversation.service_request_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_requests")
        .select("id, protocol, status, service_type, created_at")
        .eq("id", conversation.service_request_id!)
        .single();
      return data;
    },
    enabled: !!conversation.service_request_id,
  });

  const handleSaveNote = async () => {
    if (!noteText.trim() || !currentUserId) return;
    setSavingNote(true);
    try {
      await supabase.from("whatsapp_conversation_notes").insert({
        conversation_id: conversation.id,
        user_id: currentUserId,
        content: noteText.trim(),
      });
      setNoteText("");
      queryClient.invalidateQueries({ queryKey: ["conversation-notes"] });
    } catch (err) {
      console.error("Error saving note:", err);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {/* Contact info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" /> Contato
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span>{formatPhone(conversation.phone)}</span>
            </div>
            {conversation.contact_name && (
              <p className="text-muted-foreground">{conversation.contact_name}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Início: {formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </CardContent>
        </Card>

        {/* Vehicle info */}
        {(conversation.detected_plate || b?.vehicle_plate) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Car className="h-4 w-4" /> Veículo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-mono font-medium">
                {conversation.detected_plate || b?.vehicle_plate}
              </p>
              {(conversation.detected_vehicle_model || b?.vehicle_model) && (
                <p className="text-muted-foreground">
                  {conversation.detected_vehicle_model || b?.vehicle_model}
                </p>
              )}
              {(conversation.detected_vehicle_year || b?.vehicle_year) && (
                <p className="text-muted-foreground">
                  Ano: {conversation.detected_vehicle_year || b?.vehicle_year}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Beneficiary info */}
        {b && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="h-4 w-4" /> Beneficiário
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{b.name}</p>
              {b.clients?.name && (
                <p className="text-muted-foreground">Cliente: {b.clients.name}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Location */}
        {conversation.origin_lat && conversation.origin_lng && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Localização
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <a
                href={`https://maps.google.com/?q=${conversation.origin_lat},${conversation.origin_lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline text-xs"
              >
                📍 Abrir no Google Maps
              </a>
            </CardContent>
          </Card>
        )}

        {/* Linked service request */}
        {linkedRequest && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> Atendimento Vinculado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-mono text-xs">{linkedRequest.protocol}</p>
              <p className="text-muted-foreground capitalize">{linkedRequest.status}</p>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Internal notes */}
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
            <StickyNote className="h-4 w-4" /> Notas Internas
          </h3>
          <div className="space-y-2 mb-3">
            <Textarea
              placeholder="Adicionar nota interna..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="text-sm min-h-[60px]"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={savingNote || !noteText.trim()}
              onClick={handleSaveNote}
              className="w-full"
            >
              <Send className="h-3 w-3 mr-1" /> Salvar Nota
            </Button>
          </div>

          <div className="space-y-2">
            {notes.map((note: any) => (
              <div key={note.id} className="bg-muted rounded-lg p-2 text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium">
                    {(note.profiles as any)?.full_name || "Operador"}
                  </span>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(note.created_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
            {notes.length === 0 && (
              <p className="text-xs text-muted-foreground text-center">Nenhuma nota</p>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function formatPhone(phone: string) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return phone;
}
