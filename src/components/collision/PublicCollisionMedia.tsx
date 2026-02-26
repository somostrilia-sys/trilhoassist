import { useState, useRef, useEffect, useCallback } from "react";
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

// Detect if running on iOS/Safari
function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  return isIOS || isSafari;
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
  const streamRef = useRef<MediaStream | null>(null);

  // Audio preview before upload
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; url: string; mimeType: string } | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // File input refs
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (mediaRecorderRef.current?.state === "recording") {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (pendingAudio?.url) URL.revokeObjectURL(pendingAudio.url);
    };
  }, []);

  // Upload helper with retry logic
  const uploadViaEdgeFunction = useCallback(async (
    file: Blob | File,
    fileName: string,
    fileType: string,
    retryCount = 0
  ): Promise<UploadedFile | null> => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!projectId || !anonKey) {
      console.error("[CollisionMedia] Missing env vars:", { projectId: !!projectId, anonKey: !!anonKey });
      toast({ title: "Configuração inválida do app", variant: "destructive" });
      return null;
    }

    // Ensure we have a proper File object with correct mime type
    let uploadFile: File;
    if (file instanceof window.File) {
      uploadFile = file;
    } else {
      const blobType = (file as Blob).type || "application/octet-stream";
      uploadFile = new window.File([file], fileName, { type: blobType });
    }

    console.log("[CollisionMedia] Uploading:", {
      fileName, fileType, size: uploadFile.size, mime: uploadFile.type, retry: retryCount,
    });

    const formData = new FormData();
    formData.append("file", uploadFile, fileName);
    formData.append("service_request_id", serviceRequestId);
    formData.append("file_type", fileType);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);

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

      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        data = { error: "Resposta inválida do servidor" };
      }

      if (!res.ok) {
        console.error("[CollisionMedia] Upload error:", res.status, data);
        if (res.status >= 500 && retryCount < 1) {
          console.log("[CollisionMedia] Retrying upload...");
          await new Promise((r) => setTimeout(r, 2000));
          return uploadViaEdgeFunction(file, fileName, fileType, retryCount + 1);
        }
        toast({
          title: `Erro ao enviar ${fileName}`,
          description: String(data.details || data.error || "Erro desconhecido"),
          variant: "destructive",
        });
        return null;
      }

      console.log("[CollisionMedia] Upload success:", data);
      return data as unknown as UploadedFile;
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      console.error("[CollisionMedia] Network error:", err);
      if (retryCount < 1) {
        console.log("[CollisionMedia] Retrying after error...");
        await new Promise((r) => setTimeout(r, 2000));
        return uploadViaEdgeFunction(file, fileName, fileType, retryCount + 1);
      }
      toast({
        title: isTimeout ? "Tempo excedido (45s)" : `Erro de rede ao enviar ${fileName}`,
        description: isTimeout ? "Verifique sua conexão e tente novamente." : String(err),
        variant: "destructive",
      });
      return null;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [serviceRequestId, toast]);

  // File upload handler
  const handleFileUpload = async (files: FileList, fileType: string) => {
    setUploading(fileType);
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      let processedFile: File = file;
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

  // Get best supported audio mime type (with iOS/Safari fallback)
  const getAudioMimeType = useCallback((): string => {
    if (typeof MediaRecorder === "undefined") return "audio/webm";
    const candidates = isIOSSafari()
      ? ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/aac"];
    for (const type of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(type)) {
          console.log("[CollisionMedia] Using audio mime:", type);
          return type;
        }
      } catch { /* isTypeSupported can throw on some browsers */ }
    }
    console.warn("[CollisionMedia] No supported audio mime found, defaulting to audio/webm");
    return "audio/webm";
  }, []);

  // Start audio recording
  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined") {
      toast({
        title: "Gravação não suportada",
        description: "Seu navegador não suporta gravação de áudio. Tente usar Chrome ou Safari atualizado.",
        variant: "destructive",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });
      streamRef.current = stream;
      const mimeType = getAudioMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        console.warn("[CollisionMedia] Failed with mimeType, trying default");
        recorder = new MediaRecorder(stream);
      }
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          console.log("[CollisionMedia] Chunk received:", e.data.size, "bytes");
        }
      };

      recorder.onstop = () => {
        console.log("[CollisionMedia] Recording stopped, chunks:", chunksRef.current.length);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }

        if (chunksRef.current.length === 0) {
          console.error("[CollisionMedia] No audio chunks recorded!");
          toast({ title: "Erro na gravação", description: "Nenhum áudio foi capturado. Tente novamente.", variant: "destructive" });
          setRecording(false);
          return;
        }

        const actualMime = recorder.mimeType || mimeType;
        const baseMime = actualMime.split(";")[0];
        console.log("[CollisionMedia] Creating blob with mime:", baseMime, "from chunks:", chunksRef.current.length);
        const blob = new Blob(chunksRef.current, { type: baseMime });
        console.log("[CollisionMedia] Audio blob created:", blob.size, "bytes, type:", blob.type);

        if (blob.size < 100) {
          console.error("[CollisionMedia] Audio blob too small:", blob.size);
          toast({ title: "Erro na gravação", description: "O áudio gravado está vazio. Verifique as permissões do microfone.", variant: "destructive" });
          return;
        }

        const url = URL.createObjectURL(blob);
        setPendingAudio({ blob, url, mimeType: baseMime });
        setRecordingTime(0);
      };

      recorder.onerror = (event) => {
        console.error("[CollisionMedia] MediaRecorder error:", event);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        setRecording(false);
        toast({ title: "Erro na gravação", description: "Ocorreu um erro durante a gravação. Tente novamente.", variant: "destructive" });
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500);
      console.log("[CollisionMedia] Recording started with mimeType:", recorder.mimeType);
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch (err) {
      console.error("[CollisionMedia] getUserMedia error:", err);
      toast({ title: "Erro ao acessar microfone", description: "Permita o acesso ao microfone nas configurações do navegador.", variant: "destructive" });
    }
  };

  // Stop audio recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.requestData();
        }
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("[CollisionMedia] Error stopping recorder:", err);
      }
      setRecording(false);
    }
  };

  // Send recorded audio
  const handleSendAudio = async () => {
    if (!pendingAudio) return;
    setUploading("audio");
    const mime = pendingAudio.mimeType || pendingAudio.blob.type || "audio/webm";
    let ext = "webm";
    if (mime.includes("mp4") || mime.includes("aac")) ext = "m4a";
    else if (mime.includes("ogg")) ext = "ogg";
    else if (mime.includes("wav")) ext = "wav";
    const fileName = `audio_${Date.now()}.${ext}`;
    console.log("[CollisionMedia] Sending audio:", { fileName, blobSize: pendingAudio.blob.size, blobType: pendingAudio.blob.type, mime, ext });
    const audioFile = new window.File([pendingAudio.blob], fileName, { type: mime });
    const result = await uploadViaEdgeFunction(audioFile, fileName, "audio");
    if (result) {
      setUploadedFiles((prev) => {
        const updated = [...prev, result];
        onMediaChange?.(updated);
        return updated;
      });
      toast({ title: "Áudio enviado com sucesso!" });
    }
    URL.revokeObjectURL(pendingAudio.url);
    setPendingAudio(null);
    setUploading(null);
  };

  // Discard recorded audio
  const handleDiscardAudio = () => {
    if (pendingAudio?.url) URL.revokeObjectURL(pendingAudio.url);
    setPendingAudio(null);
    setAudioPlaying(false);
  };

  // Toggle audio preview playback
  const toggleAudioPreview = () => {
    if (!audioPreviewRef.current) return;
    if (audioPlaying) {
      audioPreviewRef.current.pause();
    } else {
      audioPreviewRef.current.currentTime = 0;
      audioPreviewRef.current.play().catch((err) => {
        console.error("[CollisionMedia] Audio play error:", err);
        toast({ title: "Erro ao reproduzir", description: "Não foi possível reproduzir o áudio. Tente enviar mesmo assim.", variant: "destructive" });
      });
    }
    setAudioPlaying(!audioPlaying);
  };

  // Remove uploaded file
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

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
          <Upload className="h-4 w-4" />
          Mídias da Colisão
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
          <p className="font-semibold">Orientações:</p>
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
          <p className="text-sm font-medium">Áudio (gravar relato)</p>
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
                  onError={(e) => {
                    console.error("[CollisionMedia] Audio preview error:", e);
                    setAudioPlaying(false);
                  }}
                  className="flex-1 h-8"
                  controls
                  preload="auto"
                  style={{ maxWidth: "100%" }}
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={handleSendAudio} disabled={uploading === "audio"} className="gap-1">
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

        {/* Photo capture */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Fotos do acidente</p>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={() => cameraRef.current?.click()} disabled={uploading === "photo"} className="gap-2">
              {uploading === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Tirar Foto
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => photoRef.current?.click()} disabled={uploading === "photo"} className="gap-2">
              <File className="h-4 w-4" /> Galeria
            </Button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "photo"); e.target.value = ""; } }} />
          <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "photo"); e.target.value = ""; } }} />
        </div>

        {/* Documents */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Documentos (CNH, docs do terceiro)</p>
          <Button type="button" variant="outline" size="sm" onClick={() => docRef.current?.click()} disabled={uploading === "document"} className="gap-2">
            {uploading === "document" ? <Loader2 className="h-4 w-4 animate-spin" /> : <File className="h-4 w-4" />}
            Enviar Documento
          </Button>
          <input ref={docRef} type="file" accept="image/*,.pdf,.doc,.docx" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "document"); e.target.value = ""; } }} />
        </div>

        {/* Video */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Vídeo (recomendado)</p>
          <Button type="button" variant="outline" size="sm" onClick={() => videoRef.current?.click()} disabled={uploading === "video"} className="gap-2">
            {uploading === "video" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            Gravar Vídeo
          </Button>
          <input ref={videoRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "video"); e.target.value = ""; } }} />
        </div>

        {/* Uploaded files list */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Arquivos enviados:</p>
            <div className="grid grid-cols-1 gap-2">
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                  {file.file_type === "photo" ? (
                    <>
                      <img src={file.file_url} alt={file.file_name} className="h-10 w-10 rounded object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{file.file_name}</p>
                        <p className="text-xs text-muted-foreground">{(file.file_size / 1024).toFixed(0)} KB</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleRemove(file, idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : file.file_type === "audio" ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <Mic className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{file.file_name}</p>
                        <audio src={file.file_url} controls preload="metadata" className="w-full h-6 mt-1" style={{ maxWidth: "100%" }} />
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
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
