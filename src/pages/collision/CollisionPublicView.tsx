import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MapPin, Car, User, FileText, Camera, Mic, Video, File, Loader2, AlertTriangle } from "lucide-react";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Aberto", variant: "default" },
  awaiting_dispatch: { label: "Aguardando", variant: "outline" },
  dispatched: { label: "Acionado", variant: "secondary" },
  in_progress: { label: "Em Andamento", variant: "default" },
  completed: { label: "Finalizado", variant: "secondary" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  refunded: { label: "Reembolso", variant: "destructive" },
};

const eventTypeMap: Record<string, string> = {
  mechanical_failure: "Pane Mecânica",
  accident: "Acidente",
  theft: "Roubo/Furto",
  flat_tire: "Pneu Furado",
  locked_out: "Chave Trancada",
  battery_dead: "Bateria Descarregada",
  fuel_empty: "Sem Combustível",
  other: "Outro",
};

const fileTypeIcons: Record<string, React.ReactNode> = {
  photo: <Camera className="h-4 w-4" />,
  audio: <Mic className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  document: <File className="h-4 w-4" />,
};

interface CollisionMedia {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

interface CollisionRequest {
  id: string;
  protocol: string;
  requester_name: string;
  requester_phone: string;
  vehicle_plate: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_category: string | null;
  service_type: string;
  event_type: string;
  origin_address: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  destination_address: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  client_name: string | null;
}

export default function CollisionPublicView() {
  const { token } = useParams<{ token: string }>();
  const [request, setRequest] = useState<CollisionRequest | null>(null);
  const [media, setMedia] = useState<CollisionMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    fetch(
      `https://${projectId}.supabase.co/functions/v1/collision-public?token=${encodeURIComponent(token)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError("Registro de colisão não encontrado.");
        } else {
          setRequest(data.request);
          setMedia(data.media);
        }
      })
      .catch(() => setError("Erro ao carregar dados."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-bold mb-2">Não encontrado</h2>
            <p className="text-muted-foreground">{error || "Registro não encontrado."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const st = statusMap[request.status] || statusMap.open;
  const photos = media.filter((m) => m.file_type === "photo");
  const audios = media.filter((m) => m.file_type === "audio");
  const videos = media.filter((m) => m.file_type === "video");
  const documents = media.filter((m) => m.file_type === "document");

  const googleMapsUrl = request.origin_lat && request.origin_lng
    ? `https://www.google.com/maps?q=${request.origin_lat},${request.origin_lng}`
    : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Registro de Colisão</h1>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-base">{request.protocol}</Badge>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(request.created_at).toLocaleDateString("pt-BR")} às{" "}
            {new Date(request.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {request.client_name && (
            <p className="text-sm text-muted-foreground">Cliente: {request.client_name}</p>
          )}
        </div>

        {/* Requester */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-5 w-5" /> Solicitante
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Nome:</span>
              <p className="font-medium">{request.requester_name}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Telefone:</span>
              <p className="font-medium">{request.requester_phone}</p>
            </div>
          </CardContent>
        </Card>

        {/* Vehicle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="h-5 w-5" /> Veículo
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Placa:</span>
              <p className="font-medium">{request.vehicle_plate || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Modelo:</span>
              <p className="font-medium">{request.vehicle_model || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Ano:</span>
              <p className="font-medium">{request.vehicle_year || "—"}</p>
            </div>
          </CardContent>
        </Card>

        {/* Event info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5" /> Detalhes do Evento
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div>
              <span className="text-muted-foreground">Tipo do Evento:</span>
              <p className="font-medium">{eventTypeMap[request.event_type] || request.event_type}</p>
            </div>
            {request.notes && (
              <div>
                <span className="text-muted-foreground">Observações:</span>
                <p className="font-medium whitespace-pre-wrap">{request.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Location */}
        {request.origin_address && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-5 w-5" /> Localização
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <p className="font-medium">{request.origin_address}</p>
              {googleMapsUrl && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <MapPin className="h-4 w-4" />
                  Abrir no Google Maps
                </a>
              )}
              {request.origin_lat && request.origin_lng && (
                <p className="text-xs text-muted-foreground">
                  Coordenadas: {request.origin_lat.toFixed(6)}, {request.origin_lng.toFixed(6)}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Camera className="h-5 w-5" /> Fotos ({photos.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map((p) => (
                  <a key={p.id} href={p.file_url} target="_blank" rel="noopener noreferrer" className="block">
                    <img
                      src={p.file_url}
                      alt={p.file_name}
                      className="w-full h-40 object-cover rounded-lg border hover:opacity-90 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Videos */}
        {videos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Video className="h-5 w-5" /> Vídeos ({videos.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {videos.map((v) => (
                <div key={v.id}>
                  <video controls className="w-full rounded-lg border" preload="metadata">
                    <source src={v.file_url} type={v.mime_type || "video/mp4"} />
                    Seu navegador não suporta vídeo.
                  </video>
                  <p className="text-xs text-muted-foreground mt-1">{v.file_name}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Audios */}
        {audios.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mic className="h-5 w-5" /> Áudios ({audios.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {audios.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <audio controls className="flex-1">
                    <source src={a.file_url} type={a.mime_type || "audio/mpeg"} />
                  </audio>
                  <span className="text-xs text-muted-foreground shrink-0">{a.file_name}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5" /> Documentos ({documents.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {documents.map((d) => (
                <a
                  key={d.id}
                  href={d.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <File className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.file_name}</p>
                    {d.file_size && (
                      <p className="text-xs text-muted-foreground">
                        {(d.file_size / 1024).toFixed(0)} KB
                      </p>
                    )}
                  </div>
                </a>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground py-4">
          Este é um registro público de colisão. Dados compartilhados de forma segura.
        </p>
      </div>
    </div>
  );
}
