import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  User, Phone, Plus, X, Send, UserCheck, Zap, ArrowRightLeft,
  AlertCircle, Tag, ClipboardCheck, Car, Bike, Truck,
} from "lucide-react";
import { buildVerificationFormMessage, type VehicleCategory } from "@/lib/verificationFormMessages";
interface ChatAreaProps {
  conversation: any;
  messages: any[];
  sending: boolean;
  replyText: string;
  onReplyChange: (val: string) => void;
  onSendReply: () => void;
  onAssignToMe: () => void;
  onClose: () => void;
  onCreateService: () => void;
  onTogglePriority: () => void;
  onTransfer: (userId: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  currentUserId?: string;
  getOperatorName: (id: string | null) => string | null;
  operators: any[];
  quickReplies: any[];
  onQuickReply: (message: string) => void;
  onSendVerification?: (category: VehicleCategory) => void;
}

export function ChatArea({
  conversation,
  messages,
  sending,
  replyText,
  onReplyChange,
  onSendReply,
  onAssignToMe,
  onClose,
  onCreateService,
  onTogglePriority,
  onTransfer,
  onAddTag,
  onRemoveTag,
  currentUserId,
  getOperatorName,
  operators,
  quickReplies,
  onQuickReply,
  onSendVerification,
}: ChatAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const b = conversation.beneficiaries as any;
  const isHigh = conversation.priority === "high";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              {conversation.contact_name || "Desconhecido"}
              <span className="text-muted-foreground font-normal text-sm">
                · {formatPhone(conversation.phone)}
              </span>
              {isHigh && (
                <Badge variant="destructive" className="text-xs">Urgente</Badge>
              )}
            </CardTitle>
            {b?.name && (
              <p className="text-xs text-muted-foreground mt-1">
                Beneficiário: {b.name}
                {b?.clients?.name && ` · ${b.clients.name}`}
              </p>
            )}
            {getOperatorName(conversation.assigned_to) && (
              <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                <UserCheck className="h-3 w-3" />
                Atendente: {getOperatorName(conversation.assigned_to)}
              </p>
            )}
          </div>
          <div className="flex gap-1 flex-wrap justify-end">
            {conversation.assigned_to !== currentUserId && (
              <Button size="sm" variant="outline" onClick={onAssignToMe} title="Assumir conversa">
                <UserCheck className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant={isHigh ? "destructive" : "outline"}
              onClick={onTogglePriority}
              title={isHigh ? "Remover urgência" : "Marcar urgente"}
            >
              <AlertCircle className="h-4 w-4" />
            </Button>

            {/* Transfer */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" title="Transferir">
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2">
                <p className="text-xs font-medium mb-2">Transferir para:</p>
                {operators
                  .filter((op: any) => op.user_id !== currentUserId)
                  .map((op: any) => (
                    <Button
                      key={op.user_id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => onTransfer(op.user_id)}
                    >
                      {op.full_name || "Atendente"}
                    </Button>
                  ))}
                {operators.filter((op: any) => op.user_id !== currentUserId).length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum outro atendente</p>
                )}
              </PopoverContent>
            </Popover>

            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={onCreateService}>
              <Plus className="h-4 w-4 mr-1" /> Atendimento
            </Button>
          </div>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1 flex-wrap">
          <Tag className="h-3 w-3 text-muted-foreground" />
          {conversation.tags?.map((tag: string) => (
            <Badge
              key={tag}
              variant="secondary"
              className="text-xs cursor-pointer hover:bg-destructive/20"
              onClick={() => onRemoveTag(tag)}
            >
              {tag} ×
            </Badge>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (tagInput.trim()) {
                onAddTag(tagInput.trim());
                setTagInput("");
              }
            }}
            className="inline-flex"
          >
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="+ tag"
              className="h-6 w-20 text-xs px-2"
            />
          </form>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
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
                  {new Date(msg.created_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Quick replies + Verification */}
      <div className="border-t px-3 py-2">
        <div className="flex gap-1 flex-wrap items-center">
          {/* Verification form button */}
          {onSendVerification && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                  <ClipboardCheck className="h-3 w-3" /> Verificação
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-44 p-2">
                <p className="text-xs font-medium mb-2">Enviar checklist:</p>
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs gap-2" onClick={() => onSendVerification("car")}>
                  <Car className="h-3 w-3" /> Veículo
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs gap-2" onClick={() => onSendVerification("motorcycle")}>
                  <Bike className="h-3 w-3" /> Motocicleta
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start text-xs gap-2" onClick={() => onSendVerification("truck")}>
                  <Truck className="h-3 w-3" /> Caminhão
                </Button>
              </PopoverContent>
            </Popover>
          )}

          {quickReplies.length > 0 && (
            <>
              <Zap className="h-4 w-4 text-muted-foreground mr-1" />
              {quickReplies.map((qr: any) => (
                <Button
                  key={qr.id}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => onQuickReply(qr.message)}
                >
                  {qr.title}
                </Button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Reply input */}
      <div className="border-t p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSendReply();
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="Digite sua mensagem..."
            value={replyText}
            onChange={(e) => onReplyChange(e.target.value)}
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={sending || !replyText.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
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
