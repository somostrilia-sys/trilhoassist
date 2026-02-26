import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Mic, Video, File, X, Loader2, Square, Circle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface UploadedFile {
  id?: string;
  file_url: string;
  file_name: string;
  file_type: "photo" | "audio" | "video" | "document";
  mime_type: string;
  file_size: number;
}

interface Props {
  serviceRequestId: string;
  onMediaChange?: (media: UploadedFile[]) => void;
  requireAudio?: boolean;
  requirePhotos?: boolean;
  requireDocuments?: boolean;
}

export default function PublicCollisionMedia({
  serviceRequestId,
  onMediaChange,
  requireAudio = true,
  requirePhotos = true,
  requireDocuments = true,
}: Props) {
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  // Audio recording
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    };
  }, []);

  const uploadFile = async (file: Blob, fileName: string, fileType: string, mimeType: string) => {
    const ext = fileName.split(".").pop() || "bin";
    const path = `${serviceRequestId}/${fileType}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage
      .from("collision-media")
      .upload(path, file, { contentType: mimeType });

    if (error) {
      toast({ title: `Erro ao enviar ${fileName}`, description: error.message, variant: "destructive" });
      return null;
    }

    const { data: urlData } = supabase.storage.from("collision-media").getPublicUrl(data.path);

    const { data: mediaRow } = await supabase
      .from("collision_media")
      .insert({
        service_request_id: serviceRequestId,
        file_url: urlData.publicUrl,
        file_name: fileName,
        file_type: fileType,
        mime_type: mimeType,
        file_size: file instanceof File ? file.size : (file as Blob).size,
      })
      .select("id")
      .single();

    return {
      id: mediaRow?.id,
      file_url: urlData.publicUrl,
      file_name: fileName,
      file_type: fileType as any,
      mime_type: mimeType,
      file_size: file instanceof File ? file.size : (file as Blob).size,
    } as UploadedFile;
  };

  const handleFileUpload = async (files: FileList, fileType: string) => {
    setUploading(fileType);
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      const result = await uploadFile(file, file.name, fileType, file.type);
      if (result) newFiles.push(result);
    }
    setUploadedFiles((prev) => {
      const updated = [...prev, ...newFiles];
      onMediaChange?.(updated);
      return updated;
    });
    setUploading(null);
    if (newFiles.length > 0) toast({ title: "Arquivo(s) enviado(s)!" });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setUploading("audio");
        const result = await uploadFile(blob, `audio_${Date.now()}.webm`, "audio", "audio/webm");
        if (result) {
          setUploadedFiles((prev) => {
            const updated = [...prev, result];
            onMediaChange?.(updated);
            return updated;
          });
          toast({ title: "Áudio gravado e enviado!" });
        }
        setUploading(null);
        setRecordingTime(0);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      toast({ title: "Erro ao acessar microfone", description: "Permita o acesso ao microfone.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleRemove = async (file: UploadedFile, index: number) => {
    if (file.id) await supabase.from("collision_media").delete().eq("id", file.id);
    const urlParts = file.file_url.split("/collision-media/");
    if (urlParts[1]) await supabase.storage.from("collision-media").remove([urlParts[1]]);
    setUploadedFiles((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      onMediaChange?.(updated);
      return updated;
    });
  };

  const photos = uploadedFiles.filter((f) => f.file_type === "photo");
  const audios = uploadedFiles.filter((f) => f.file_type === "audio");
  const docs = uploadedFiles.filter((f) => f.file_type === "document");
  const videos = uploadedFiles.filter((f) => f.file_type === "video");

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
          <Camera className="h-4 w-4" /> Mídias da Colisão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Validation badges */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant={photos.length > 0 ? "default" : "destructive"}>
            {photos.length > 0 ? "✓" : "!"} Fotos {photos.length > 0 ? `(${photos.length})` : "(obrigatório)"}
          </Badge>
          <Badge variant={audios.length > 0 ? "default" : "destructive"}>
            {audios.length > 0 ? "✓" : "!"} Áudio {audios.length > 0 ? `(${audios.length})` : "(obrigatório)"}
          </Badge>
          <Badge variant={docs.length > 0 ? "default" : "destructive"}>
            {docs.length > 0 ? "✓" : "!"} Documentos {docs.length > 0 ? `(${docs.length})` : "(obrigatório)"}
          </Badge>
          <Badge variant="outline">
            Vídeos ({videos.length})
          </Badge>
        </div>

        {/* Orientation text */}
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
          <p className="font-semibold">📋 Orientações:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs text-muted-foreground">
            <li>É <strong>obrigatório</strong> o envio de áudio relatando o ocorrido</li>
            <li>É <strong>obrigatório</strong> o envio de fotos do acidente</li>
            <li>O vídeo é <strong>recomendado</strong> para melhor análise</li>
            <li>Se houver terceiro envolvido, os documentos do terceiro são <strong>obrigatórios</strong></li>
            <li>Caso não haja terceiro, anexar apenas a <strong>CNH do condutor</strong></li>
          </ul>
        </div>

        {/* Audio recording */}
        <div className="space-y-2">
          <p className="text-sm font-medium">🎙️ Áudio (gravar relato)</p>
          {recording ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-destructive animate-pulse">
                <Circle className="h-3 w-3 fill-destructive" />
                <span className="text-sm font-mono">{formatTime(recordingTime)}</span>
              </div>
              <Button type="button" variant="destructive" size="sm" onClick={stopRecording} className="gap-1">
                <Square className="h-3 w-3" /> Parar
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startRecording}
              disabled={uploading === "audio"}
              className="gap-2"
            >
              {uploading === "audio" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              Gravar Áudio
            </Button>
          )}
        </div>

        {/* Photo capture */}
        <div className="space-y-2">
          <p className="text-sm font-medium">📷 Fotos do acidente</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => photoRef.current?.click()} disabled={uploading === "photo"} className="gap-2">
              {uploading === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Tirar Foto / Galeria
            </Button>
          </div>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "photo"); e.target.value = ""; } }} />
        </div>

        {/* Documents */}
        <div className="space-y-2">
          <p className="text-sm font-medium">📄 Documentos (CNH, docs do terceiro)</p>
          <Button type="button" variant="outline" size="sm" onClick={() => docRef.current?.click()} disabled={uploading === "document"} className="gap-2">
            {uploading === "document" ? <Loader2 className="h-4 w-4 animate-spin" /> : <File className="h-4 w-4" />}
            Enviar Documento
          </Button>
          <input ref={docRef} type="file" accept="image/*,.pdf,.doc,.docx" capture="environment" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "document"); e.target.value = ""; } }} />
        </div>

        {/* Video */}
        <div className="space-y-2">
          <p className="text-sm font-medium">🎥 Vídeo (recomendado)</p>
          <Button type="button" variant="outline" size="sm" onClick={() => videoRef.current?.click()} disabled={uploading === "video"} className="gap-2">
            {uploading === "video" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            Gravar Vídeo
          </Button>
          <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden"
            onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "video"); e.target.value = ""; } }} />
        </div>

        {/* Uploaded files */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Arquivos enviados:</p>
            <div className="grid grid-cols-1 gap-2">
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                  {file.file_type === "photo" ? (
                    <img src={file.file_url} alt={file.file_name} className="h-10 w-10 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                      {file.file_type === "audio" ? <Mic className="h-4 w-4" /> : file.file_type === "video" ? <Video className="h-4 w-4" /> : <File className="h-4 w-4" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{file.file_name}</p>
                    <p className="text-xs text-muted-foreground">{(file.file_size / 1024).toFixed(0)} KB</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemove(file, idx)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
