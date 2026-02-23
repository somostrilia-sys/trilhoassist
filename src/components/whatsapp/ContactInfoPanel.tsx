import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  User, Phone, Car, MapPin, FileText, StickyNote, Send,
  ChevronDown, ChevronRight, History, Shield, CreditCard,
  Building2, Hash, Calendar,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface ContactInfoPanelProps {
  conversation: any;
  currentUserId?: string;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  tow_light: "Guincho Leve",
  tow_heavy: "Guincho Pesado",
  tow_motorcycle: "Guincho Moto",
  locksmith: "Chaveiro",
  tire_change: "Troca de Pneu",
  battery: "Bateria",
  fuel: "Combustível",
  lodging: "Hospedagem",
  collision: "Colisão",
  other: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  awaiting_dispatch: "Aguardando Despacho",
  dispatched: "Despachado",
  in_progress: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  open: "default",
  awaiting_dispatch: "outline",
  dispatched: "outline",
  in_progress: "secondary",
  completed: "default",
  cancelled: "destructive",
  refunded: "destructive",
};

export function ContactInfoPanel({ conversation, currentUserId }: ContactInfoPanelProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [openSections, setOpenSections] = useState({
    contact: true,
    vehicle: true,
    beneficiary: true,
    location: false,
    linkedRequest: true,
    history: true,
    notes: true,
  });

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

  // Fetch linked service request
  const { data: linkedRequest } = useQuery({
    queryKey: ["linked-request", conversation.service_request_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_requests")
        .select("id, protocol, status, service_type, event_type, created_at, origin_address, destination_address, provider_cost, charged_amount, vehicle_plate, vehicle_model")
        .eq("id", conversation.service_request_id!)
        .single();
      return data;
    },
    enabled: !!conversation.service_request_id,
  });

  // Fetch service history for beneficiary
  const { data: serviceHistory = [] } = useQuery({
    queryKey: ["beneficiary-service-history", b?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_requests")
        .select("id, protocol, status, service_type, event_type, created_at, origin_address, provider_cost, charged_amount")
        .eq("beneficiary_id", b!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!b?.id,
  });

  // Fetch beneficiary plan info
  const { data: planInfo } = useQuery({
    queryKey: ["beneficiary-plan", b?.plan_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("plans")
        .select("name, max_dispatches_per_year, max_tow_km, plate_fee")
        .eq("id", b!.plan_id)
        .single();
      return data;
    },
    enabled: !!b?.plan_id,
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

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-2">
        {/* Contact info */}
        <CollapsibleSection
          title="Contato"
          icon={<User className="h-4 w-4" />}
          open={openSections.contact}
          onToggle={() => toggleSection("contact")}
        >
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono">{formatPhone(conversation.phone)}</span>
            </div>
            {conversation.contact_name && (
              <p className="font-medium">{conversation.contact_name}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Primeira msg: {formatDistanceToNow(new Date(conversation.created_at), { addSuffix: true, locale: ptBR })}
            </p>
            {conversation.last_message_at && (
              <p className="text-xs text-muted-foreground">
                Última msg: {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true, locale: ptBR })}
              </p>
            )}
            <div className="flex items-center gap-1">
              <Badge variant={conversation.status === "open" ? "default" : "secondary"} className="text-xs">
                {conversation.status === "open" ? "Aberto" : "Fechado"}
              </Badge>
              {conversation.priority === "high" && (
                <Badge variant="destructive" className="text-xs">Urgente</Badge>
              )}
            </div>
          </div>
        </CollapsibleSection>

        {/* Vehicle info */}
        {(conversation.detected_plate || b?.vehicle_plate) && (
          <CollapsibleSection
            title="Veículo"
            icon={<Car className="h-4 w-4" />}
            open={openSections.vehicle}
            onToggle={() => toggleSection("vehicle")}
          >
            <div className="space-y-2 text-sm">
              <div className="bg-muted rounded-md p-2 text-center">
                <p className="font-mono font-bold text-lg tracking-wider">
                  {conversation.detected_plate || b?.vehicle_plate}
                </p>
              </div>
              {(conversation.detected_vehicle_model || b?.vehicle_model) && (
                <div className="flex items-center gap-2">
                  <Car className="h-3 w-3 text-muted-foreground" />
                  <span>{conversation.detected_vehicle_model || b?.vehicle_model}</span>
                </div>
              )}
              {(conversation.detected_vehicle_year || b?.vehicle_year) && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  <span>Ano: {conversation.detected_vehicle_year || b?.vehicle_year}</span>
                </div>
              )}
              {b?.vehicle_chassis && (
                <div className="flex items-center gap-2">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs font-mono">Chassi: {b.vehicle_chassis}</span>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Beneficiary info */}
        {b && (
          <CollapsibleSection
            title="Beneficiário"
            icon={<Shield className="h-4 w-4" />}
            open={openSections.beneficiary}
            onToggle={() => toggleSection("beneficiary")}
          >
            <div className="space-y-2 text-sm">
              <p className="font-medium">{b.name}</p>
              {b.cpf && (
                <p className="text-xs text-muted-foreground font-mono">CPF: {b.cpf}</p>
              )}
              {b.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">{b.phone}</span>
                </div>
              )}
              {b.clients?.name && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">Cliente: {b.clients.name}</span>
                </div>
              )}
              {b.cooperativa && (
                <p className="text-xs text-muted-foreground">Cooperativa: {b.cooperativa}</p>
              )}
              {planInfo && (
                <div className="bg-muted rounded-md p-2 space-y-1">
                  <p className="text-xs font-medium flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> Plano: {planInfo.name}
                  </p>
                  {planInfo.max_dispatches_per_year && (
                    <p className="text-xs text-muted-foreground">
                      Acionamentos/ano: {planInfo.max_dispatches_per_year}
                    </p>
                  )}
                  {planInfo.max_tow_km && (
                    <p className="text-xs text-muted-foreground">
                      KM guincho: {planInfo.max_tow_km} km
                    </p>
                  )}
                </div>
              )}
              <Badge variant={b.active ? "default" : "destructive"} className="text-xs">
                {b.active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
          </CollapsibleSection>
        )}

        {/* Location */}
        {conversation.origin_lat && conversation.origin_lng && (
          <CollapsibleSection
            title="Localização GPS"
            icon={<MapPin className="h-4 w-4" />}
            open={openSections.location}
            onToggle={() => toggleSection("location")}
          >
            <div className="text-sm space-y-2">
              <p className="text-xs font-mono text-muted-foreground">
                {Number(conversation.origin_lat).toFixed(6)}, {Number(conversation.origin_lng).toFixed(6)}
              </p>
              <Button size="sm" variant="outline" className="w-full text-xs" asChild>
                <a
                  href={`https://maps.google.com/?q=${conversation.origin_lat},${conversation.origin_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin className="h-3 w-3 mr-1" /> Abrir no Google Maps
                </a>
              </Button>
            </div>
          </CollapsibleSection>
        )}

        {/* Linked service request */}
        {linkedRequest && (
          <CollapsibleSection
            title="Atendimento Vinculado"
            icon={<FileText className="h-4 w-4" />}
            open={openSections.linkedRequest}
            onToggle={() => toggleSection("linkedRequest")}
          >
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs">{linkedRequest.protocol}</span>
                <Badge variant={STATUS_VARIANTS[linkedRequest.status] || "outline"} className="text-xs">
                  {STATUS_LABELS[linkedRequest.status] || linkedRequest.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {SERVICE_TYPE_LABELS[linkedRequest.service_type] || linkedRequest.service_type}
              </p>
              {linkedRequest.origin_address && (
                <p className="text-xs text-muted-foreground truncate" title={linkedRequest.origin_address}>
                  📍 {linkedRequest.origin_address}
                </p>
              )}
              {(linkedRequest.provider_cost != null && Number(linkedRequest.provider_cost) > 0) && (
                <p className="text-xs">
                  Custo: R$ {Number(linkedRequest.provider_cost).toFixed(2)}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                onClick={() => navigate(`/operation/${linkedRequest.id}`)}
              >
                Ver Detalhes
              </Button>
            </div>
          </CollapsibleSection>
        )}

        <Separator />

        {/* Service History */}
        {b && (
          <CollapsibleSection
            title={`Histórico (${serviceHistory.length})`}
            icon={<History className="h-4 w-4" />}
            open={openSections.history}
            onToggle={() => toggleSection("history")}
          >
            <div className="space-y-2">
              {serviceHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Nenhum atendimento anterior
                </p>
              ) : (
                serviceHistory.map((sr: any) => (
                  <div
                    key={sr.id}
                    className="bg-muted rounded-md p-2 space-y-1 cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => navigate(`/operation/${sr.id}`)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{sr.protocol}</span>
                      <Badge variant={STATUS_VARIANTS[sr.status] || "outline"} className="text-[10px] px-1.5 py-0">
                        {STATUS_LABELS[sr.status] || sr.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {SERVICE_TYPE_LABELS[sr.service_type] || sr.service_type}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(sr.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                    {sr.origin_address && (
                      <p className="text-[10px] text-muted-foreground truncate" title={sr.origin_address}>
                        📍 {sr.origin_address}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </CollapsibleSection>
        )}

        <Separator />

        {/* Internal notes */}
        <CollapsibleSection
          title={`Notas Internas (${notes.length})`}
          icon={<StickyNote className="h-4 w-4" />}
          open={openSections.notes}
          onToggle={() => toggleSection("notes")}
        >
          <div className="space-y-2">
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

            <div className="space-y-2 mt-2">
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
        </CollapsibleSection>
      </div>
    </ScrollArea>
  );
}

/* ─── Collapsible section wrapper ─── */
function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full text-sm font-medium py-1.5 px-1 rounded hover:bg-muted/50 transition-colors">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {icon}
          {title}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 pr-1 pb-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

function formatPhone(phone: string) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return phone;
}