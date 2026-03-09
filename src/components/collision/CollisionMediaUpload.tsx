import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Mic, Video, File, Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UploadedFile {
  id?: string;
  file_url: string;
  file_name: string;
  file_type: "photo" | "audio" | "video" | "document";
  mime_type: string;
  file_size: number;
}

interface CollisionMediaUploadProps {
  serviceRequestId: string;
  onMediaChange?: (media: UploadedFile[]) => void;
}

const acceptMap: Record<string, string> = {
  photo: "image/*",
  audio: "audio/*",
  video: "video/*",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv",
};

const iconMap: Record<string, React.ReactNode> = {
  photo: <Camera className="h-4 w-4" />,
  audio: <Mic className="h-4 w-4" />,
  video: <Video className="h-4 w-4" />,
  document: <File className="h-4 w-4" />,
};

const labelMap: Record<string, string> = {
  photo: "Fotos",
  audio: "Áudios",
  video: "Vídeos",
  document: "Documentos",
};

export default function CollisionMediaUpload({ serviceRequestId, onMediaChange }: CollisionMediaUploadProps) {
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentType, setCurrentType] = useState<string>("photo");

  const handleUpload = async (files: FileList, fileType: string) => {
    setUploading(fileType);

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${serviceRequestId}/${fileType}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { data, error } = await supabase.storage
        .from("collision-media")
        .upload(path, file, { contentType: file.type });

      if (error) {
        toast({ title: `Erro ao enviar ${file.name}`, description: error.message, variant: "destructive" });
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("collision-media")
        .getPublicUrl(data.path);

      // Save to collision_media table
      const { data: mediaRow, error: insertErr } = await supabase
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

      if (!insertErr) {
        const newFile: UploadedFile = {
          id: mediaRow?.id,
          file_url: urlData.publicUrl,
          file_name: file.name,
          file_type: fileType as any,
          mime_type: file.type,
          file_size: file.size,
        };
        setUploadedFiles((prev) => {
          const updated = [...prev, newFile];
          onMediaChange?.(updated);
          return updated;
        });
      }
    }

    setUploading(null);
    toast({ title: "Arquivo(s) enviado(s) com sucesso!" });
  };

  const handleRemove = async (file: UploadedFile, index: number) => {
    if (file.id) {
      await supabase.from("collision_media").delete().eq("id", file.id);
    }
    // Extract path from URL for storage deletion
    const urlParts = file.file_url.split("/collision-media/");
    if (urlParts[1]) {
      await supabase.storage.from("collision-media").remove([urlParts[1]]);
    }
    setUploadedFiles((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      onMediaChange?.(updated);
      return updated;
    });
  };

  const triggerUpload = (type: string) => {
    setCurrentType(type);
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const photos = uploadedFiles.filter((f) => f.file_type === "photo");
  const hasRequiredPhotos = photos.length > 0;
  const hasRequiredDocs = uploadedFiles.some((f) => f.file_type === "document");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-5 w-5" /> MÍDIAS DA COLISÃO
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Validation badges */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant={hasRequiredPhotos ? "default" : "destructive"}>
            {hasRequiredPhotos ? "✓" : "!"} Fotos {hasRequiredPhotos ? `(${photos.length})` : "(obrigatório)"}
          </Badge>
          <Badge variant={hasRequiredDocs ? "default" : "destructive"}>
            {hasRequiredDocs ? "✓" : "!"} Documentos {hasRequiredDocs ? `(${uploadedFiles.filter(f => f.file_type === "document").length})` : "(obrigatório)"}
          </Badge>
          <Badge variant="outline">
            Áudios ({uploadedFiles.filter(f => f.file_type === "audio").length})
          </Badge>
          <Badge variant="outline">
            Vídeos ({uploadedFiles.filter(f => f.file_type === "video").length})
          </Badge>
        </div>

        {/* Upload buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(["photo", "audio", "video", "document"] as const).map((type) => (
            <Button
              key={type}
              type="button"
              variant="outline"
              className="gap-2"
              disabled={uploading === type}
              onClick={() => triggerUpload(type)}
            >
              {uploading === type ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                iconMap[type]
              )}
              {labelMap[type]}
            </Button>
          ))}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptMap[currentType]}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              handleUpload(e.target.files, currentType);
              e.target.value = "";
            }
          }}
        />

        {/* Uploaded files list */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Arquivos enviados:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {uploadedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
                >
                  {file.file_type === "photo" ? (
                    <img src={file.file_url} alt={file.file_name} className="h-10 w-10 rounded object-cover shrink-0" />
                  ) : file.file_type === "audio" ? (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                      {iconMap[file.file_type]}
                    </div>
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                      {iconMap[file.file_type]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{file.file_name}</p>
                    {file.file_type === "audio" ? (
                      <audio src={file.file_url} controls preload="metadata" className="w-full h-8 mt-1" style={{ maxWidth: "100%" }} />
                    ) : file.file_type === "video" ? (
                      <video src={file.file_url} controls preload="metadata" className="w-full h-20 mt-1 rounded" style={{ maxWidth: "100%" }} />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {(file.file_size / 1024).toFixed(0)} KB
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => handleRemove(file, idx)}
                  >
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
