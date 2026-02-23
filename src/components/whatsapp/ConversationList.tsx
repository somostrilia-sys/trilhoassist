import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone, Search, UserCheck, AlertCircle } from "lucide-react";
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

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  normal: "",
  low: "bg-muted text-muted-foreground",
};

interface ConversationListProps {
  conversations: any[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (val: string) => void;
  filter: string;
  onFilterChange: (val: string) => void;
  currentUserId?: string;
  getOperatorName: (id: string | null) => string | null;
}

export function ConversationList({
  conversations,
  isLoading,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  currentUserId,
  getOperatorName,
}: ConversationListProps) {
  const filtered = conversations.filter((c: any) => {
    // Text search
    const s = search.toLowerCase();
    const matchesSearch =
      !search ||
      c.phone?.includes(s) ||
      c.contact_name?.toLowerCase().includes(s) ||
      (c.beneficiaries as any)?.name?.toLowerCase().includes(s) ||
      c.detected_plate?.toLowerCase().includes(s);

    // Tab filter
    let matchesFilter = true;
    switch (filter) {
      case "mine":
        matchesFilter = c.assigned_to === currentUserId;
        break;
      case "unassigned":
        matchesFilter = !c.assigned_to;
        break;
      case "closed":
        matchesFilter = c.status === "closed";
        break;
      case "high":
        matchesFilter = c.priority === "high";
        break;
      default:
        matchesFilter = c.status !== "closed";
    }

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nome, telefone, placa..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs value={filter} onValueChange={onFilterChange}>
          <TabsList className="w-full grid grid-cols-4 h-8">
            <TabsTrigger value="all" className="text-xs">Todas</TabsTrigger>
            <TabsTrigger value="mine" className="text-xs">Minhas</TabsTrigger>
            <TabsTrigger value="unassigned" className="text-xs">Sem atend.</TabsTrigger>
            <TabsTrigger value="high" className="text-xs">Urgente</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">Nenhuma conversa encontrada</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((conv: any) => {
              const b = conv.beneficiaries as any;
              const assignedName = getOperatorName(conv.assigned_to);
              const isHigh = conv.priority === "high";

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                    selectedId === conv.id ? "bg-muted" : ""
                  } ${isHigh ? "border-l-2 border-l-destructive" : ""}`}
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
                      {(conv.detected_plate || b?.vehicle_plate) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          🚗 {conv.detected_plate || b?.vehicle_plate}
                          {(conv.detected_vehicle_model || b?.vehicle_model) &&
                            ` - ${conv.detected_vehicle_model || b?.vehicle_model}`}
                        </p>
                      )}
                      {assignedName && (
                        <p className="text-xs text-primary flex items-center gap-1 mt-0.5">
                          <UserCheck className="h-3 w-3" />
                          {assignedName}
                        </p>
                      )}
                      {conv.tags?.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {conv.tags.map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="secondary" className={STATUS_COLORS[conv.status] || ""}>
                        {STATUS_LABELS[conv.status] || conv.status}
                      </Badge>
                      {isHigh && (
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertCircle className="h-3 w-3 mr-0.5" /> Urgente
                        </Badge>
                      )}
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
