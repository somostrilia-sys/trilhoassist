import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EditableFieldProps {
  label: string;
  value: React.ReactNode;
  rawValue: string;
  onSave: (newValue: string) => Promise<void>;
  type?: "text" | "number" | "select" | "textarea" | "date" | "time";
  options?: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function EditableField({
  label,
  value,
  rawValue,
  onSave,
  type = "text",
  options,
  placeholder,
  className,
  disabled,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(rawValue);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (editValue === rawValue) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(editValue);
      setEditing(false);
    } catch {
      // error handled by caller
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(rawValue);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className={cn("flex flex-col sm:flex-row sm:items-start gap-1 py-2 group", className)}>
        <span className="text-sm text-muted-foreground sm:w-48 shrink-0">{label}</span>
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-sm font-medium">{value || "—"}</span>
          {!disabled && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={() => {
                setEditValue(rawValue);
                setEditing(true);
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-start gap-1 py-2", className)}>
      <span className="text-sm text-muted-foreground sm:w-48 shrink-0">{label}</span>
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {type === "select" && options ? (
          <Select value={editValue} onValueChange={setEditValue}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : type === "textarea" ? (
          <Textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="text-sm min-h-[60px]"
            placeholder={placeholder}
            autoFocus
          />
        ) : (
          <Input
            type={type}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-8 text-sm"
            placeholder={placeholder}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
          />
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCancel} disabled={saving}>
          <X className="h-3 w-3 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
