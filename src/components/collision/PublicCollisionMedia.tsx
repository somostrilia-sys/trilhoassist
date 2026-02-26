import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Mic, Video, File, X, Loader2, Upload, Square, Circle, Play, Pause } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
}

// Compress image to max ~1MB
async function compressImage(file: File, maxSizeKB = 1024): Promise<File> {
  if (file.size <= maxSizeKB * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      // Scale down if very large
      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // Try decreasing quality until under maxSize
      let quality = 0.8;
      const tryCompress = () => {
      canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            if (blob.size <= maxSizeKB * 1024 || quality <= 0.3) {
              const compressed = new window.File([blob], file.name, { type: "image/jpeg" });
              resolve(compressed);
            } else {
              quality -= 0.1;
              tryCompress();
            }
          },
          "image/jpeg",
          quality
        );
      };
      tryCompress();
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export default function PublicCollisionMedia({ serviceRequestId, onMediaChange }: Props) {
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  // Audio recording
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio preview before upload
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      if (pendingAudio?.url) URL.revokeObjectURL(pendingAudio.url);
    };
  }, []);

  const uploadViaEdgeFunction = async (file: Blob | File, fileName: string, fileType: string): Promise<UploadedFile | null> => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!projectId || !anonKey) {
      toast({ title: "Configuração inválida do app", variant: "destructive" });
      return null;
    }

    // Ensure we have a proper File object
    const uploadFile = file instanceof window.File ? file : new window.File([file], fileName, { type: (file as Blob).type || "application/octet-stream" });

    const formData = new FormData();
    formData.append("file", uploadFile, fileName);
    formData.append("service_request_id", serviceRequestId);
    formData.append("file_type", fileType);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/collision-upload`,
        {
          method: "POST",
          headers: { apikey: anonKey },
          body: formData,
          signal: controller.signal,
        }
      );

      const data = await res.json();

      if (!res.ok) {
        console.error("[CollisionMedia] Upload error:", data);
        toast({ title: `Erro ao enviar ${fileName}`, description: data.details || data.error, variant: "destructive" });
        return null;
      }

      return data as UploadedFile;
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      console.error("[CollisionMedia] Network error:", err);
      toast({
        title: isTimeout ? "Tempo excedido (30s)" : `Erro de rede ao enviar ${fileName}`,
        description: isTimeout ? "Verifique sua conexão e tente novamente." : String(err),
        variant: "destructive",
      });
      return null;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const handleFileUpload = async (files: FileList, fileType: string) => {
    setUploading(fileType);
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      let processedFile: File = file;

      // Compress images
      if (fileType === "photo" && file.type.startsWith("image/")) {
        processedFile = await compressImage(file);
      }

      const result = await uploadViaEdgeFunction(processedFile, processedFile.name, fileType);
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

  // Get supported mime type for MediaRecorder
  const getAudioMimeType = (): string => {
    if (typeof MediaRecorder !== "undefined") {
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
      if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) return "audio/ogg;codecs=opus";
      if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
    }
    return "audio/webm";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getAudioMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearInterval(timerRef.current);

        const baseMime = mimeType.split(";")[0];
        const blob = new Blob(chunksRef.current, { type: baseMime });
        const url = URL.createObjectURL(blob);
        setPendingAudio({ blob, url });
        setRecordingTime(0);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000); // collect every 1s for reliability
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      toast({ title: "Erro ao acessar microfone", description: "Permita o acesso ao microfone nas configurações do navegador.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleSendAudio = async () => {
    if (!pendingAudio) return;
    setUploading("audio");
    const ext = pendingAudio.blob.type.includes("ogg") ? "ogg" : pendingAudio.blob.type.includes("mp4") ? "m4a" : "webm";
    const fileName = `audio_${Date.now()}.${ext}`;
    const audioFile = new window.File([pendingAudio.blob], fileName, { type: pendingAudio.blob.type });
    const result = await uploadViaEdgeFunction(audioFile, fileName, "audio");
    if (result) {
      setUploadedFiles((prev) => {
        const updated = [...prev, result];
        onMediaChange?.(updated);
        return updated;
      });
      toast({ title: "Áudio enviado!" });
    }
    URL.revokeObjectURL(pendingAudio.url);
    setPendingAudio(null);
    setUploading(null);
  };

  const handleDiscardAudio = () => {
    if (pendingAudio?.url) URL.revokeObjectURL(pendingAudio.url);
    setPendingAudio(null);
  };

  const toggleAudioPreview = () => {
    if (!audioPreviewRef.current) return;
    if (audioPlaying) {
      audioPreviewRef.current.pause();
    } else {
      audioPreviewRef.current.play();
    }
    setAudioPlaying(!audioPlaying);
  };

  const handleRemove = (file: UploadedFile, index: number) => {
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
          <Upload className="h-4 w-4" /> Mídias da Colisão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <Badge variant="outline">Vídeos ({videos.length})</Badge>
        </div>

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
          ) : pendingAudio ? (
            <div className="space-y-2 p-3 rounded-md border bg-muted/30">
              <p className="text-xs text-muted-foreground">Prévia do áudio gravado:</p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={toggleAudioPreview}>
                  {audioPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <audio
                  ref={audioPreviewRef}
                  src={pendingAudio.url}
                  onEnded={() => setAudioPlaying(false)}
                  className="flex-1 h-8"
                  controls
                  style={{ maxWidth: "100%" }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSendAudio}
                  disabled={uploading === "audio"}
                  className="gap-1"
                >
                  {uploading === "audio" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  Enviar Áudio
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleDiscardAudio} className="gap-1">
                  <X className="h-3 w-3" /> Descartar
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={startRecording} disabled={uploading === "audio"} className="gap-2">
              {uploading === "audio" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              Gravar Áudio
            </Button>
          )}
        </div>

        {/* Photo capture - TWO buttons: camera + gallery */}
        <div className="space-y-2">
          <p className="text-sm font-medium">📷 Fotos do acidente</p>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()} disabled={uploading === "photo"} className="gap-2">
              {uploading === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Tirar Foto
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => photoRef.current?.click()} disabled={uploading === "photo"} className="gap-2">
              <File className="h-4 w-4" />
              Galeria
            </Button>
          </div>
          {/* Camera input (direct capture) */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "photo"); e.target.value = ""; } }}
          />
          {/* Gallery input (no capture attr) */}
          <input
            ref={photoRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,image/webp,image/*"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "photo"); e.target.value = ""; } }}
          />
        </div>

        {/* Documents */}
        <div className="space-y-2">
          <p className="text-sm font-medium">📄 Documentos (CNH, docs do terceiro)</p>
          <Button type="button" variant="outline" size="sm" onClick={() => docRef.current?.click()} disabled={uploading === "document"} className="gap-2">
            {uploading === "document" ? <Loader2 className="h-4 w-4 animate-spin" /> : <File className="h-4 w-4" />}
            Enviar Documento
          </Button>
          <input ref={docRef} type="file" accept="image/*,.pdf,.doc,.docx" multiple className="hidden"
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
                  ) : file.file_type === "audio" ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <Mic className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{file.file_name}</p>
                        <audio src={file.file_url} controls className="w-full h-6 mt-1" style={{ maxWidth: "100%" }} />
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemove(file, idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        {file.file_type === "video" ? <Video className="h-4 w-4" /> : <File className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">{(file.file_size / 1024).toFixed(0)} KB</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemove(file, idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  {file.file_type !== "audio" && (
                    <>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
