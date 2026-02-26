import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Mic, Video, File, X, Loader2, Upload } from "lucide-react";
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
}

export default function PublicCollisionMedia({ serviceRequestId, onMediaChange }: Props) {
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  const photoRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: globalThis.File, fileType: string) => {
    const ext = file.name.split(".").pop() || "bin";
    const path = `${serviceRequestId}/${fileType}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    console.log("[CollisionMedia] Uploading:", { path, fileType, size: file.size, mime: file.type });

    const { data, error } = await supabase.storage
      .from("collision-media")
      .upload(path, file, { contentType: file.type });

    if (error) {
      console.error("[CollisionMedia] Storage error:", error);
      toast({ title: `Erro ao enviar ${file.name}`, description: error.message, variant: "destructive" });
      return null;
    }

    console.log("[CollisionMedia] Storage OK:", data.path);
    const { data: urlData } = supabase.storage.from("collision-media").getPublicUrl(data.path);

    console.log("[CollisionMedia] Inserting into table...");
    const { data: mediaRow, error: insertError } = await supabase
      .from("collision_media")
      .insert({
        service_request_id: serviceRequestId,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: fileType,
        mime_type: file.type,
        file_size: file.size,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[CollisionMedia] Insert error:", insertError);
      toast({ title: `Erro ao registrar ${file.name}`, description: insertError.message, variant: "destructive" });
      return null;
    }

    console.log("[CollisionMedia] Insert OK:", mediaRow?.id);

    return {
      id: mediaRow?.id,
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_type: fileType as any,
      mime_type: file.type,
      file_size: file.size,
    } as UploadedFile;
  };

  const handleFileUpload = async (files: FileList, fileType: string) => {
    setUploading(fileType);
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(files)) {
      const result = await uploadFile(file, fileType);
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

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
          <Upload className="h-4 w-4" /> Mídias da Colisão
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
          <Badge variant="outline">Vídeos ({videos.length})</Badge>
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

        {/* Audio upload */}
        <div className="space-y-2">
          <p className="text-sm font-medium">🎙️ Áudio (envie gravação do relato)</p>
          <Button type="button" variant="outline" size="sm" onClick={() => audioRef.current?.click()} disabled={uploading === "audio"} className="gap-2">
            {uploading === "audio" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            Selecionar Áudio
          </Button>
          <input ref={audioRef} type="file" accept="audio/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "audio"); e.target.value = ""; } }} />
        </div>

        {/* Photo upload */}
        <div className="space-y-2">
          <p className="text-sm font-medium">📷 Fotos do acidente</p>
          <Button type="button" variant="outline" size="sm" onClick={() => photoRef.current?.click()} disabled={uploading === "photo"} className="gap-2">
            {uploading === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Selecionar Fotos
          </Button>
          <input ref={photoRef} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "photo"); e.target.value = ""; } }} />
        </div>

        {/* Documents */}
        <div className="space-y-2">
          <p className="text-sm font-medium">📄 Documentos (CNH, docs do terceiro)</p>
          <Button type="button" variant="outline" size="sm" onClick={() => docRef.current?.click()} disabled={uploading === "document"} className="gap-2">
            {uploading === "document" ? <Loader2 className="h-4 w-4 animate-spin" /> : <File className="h-4 w-4" />}
            Selecionar Documento
          </Button>
          <input ref={docRef} type="file" accept="image/*,.pdf,.doc,.docx" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) { handleFileUpload(e.target.files, "document"); e.target.value = ""; } }} />
        </div>

        {/* Video upload */}
        <div className="space-y-2">
          <p className="text-sm font-medium">🎥 Vídeo (recomendado)</p>
          <Button type="button" variant="outline" size="sm" onClick={() => videoRef.current?.click()} disabled={uploading === "video"} className="gap-2">
            {uploading === "video" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            Selecionar Vídeo
          </Button>
          <input ref={videoRef} type="file" accept="video/*" multiple className="hidden"
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
