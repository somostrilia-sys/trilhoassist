import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, XCircle, AlertTriangle,
} from "lucide-react";

export interface ColumnDef {
  key: string;
  label: string;
  required: boolean;
}

export interface ImportRow {
  _rowNum: number;
  _errors: string[];
  _isDuplicate: boolean;
  _duplicateAction: "skip" | "update";
  [key: string]: any;
}

interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  columns: ColumnDef[];
  templateFileName: string;
  validateRow: (row: Record<string, any>, rowNum: number) => string[];
  checkDuplicates: (rows: Record<string, any>[]) => Promise<Map<number, string>>;
  onImport: (rows: ImportRow[]) => Promise<{ success: number; errors: number }>;
}

function generateTemplate(columns: ColumnDef[], fileName: string) {
  const ws = XLSX.utils.aoa_to_sheet([columns.map(c => c.label)]);
  // Set column widths
  ws["!cols"] = columns.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dados");
  XLSX.writeFile(wb, fileName);
}

export default function ExcelImportDialog({
  open, onOpenChange, title, description, columns, templateFileName,
  validateRow, checkDuplicates, onImport,
}: ExcelImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);
  const [parseError, setParseError] = useState("");
  const [progress, setProgress] = useState(0);

  const reset = useCallback(() => {
    setStep("upload");
    setRows([]);
    setImportResult(null);
    setParseError("");
    setProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

      if (jsonData.length === 0) {
        setParseError("A planilha está vazia.");
        return;
      }

      if (jsonData.length > 5000) {
        setParseError("Máximo de 5.000 registros por importação.");
        return;
      }

      // Map header labels to keys
      const headerMap = new Map<string, string>();
      columns.forEach(c => {
        headerMap.set(c.label.toLowerCase().trim(), c.key);
      });

      const mappedRows: ImportRow[] = jsonData.map((raw, idx) => {
        const mapped: Record<string, any> = {};
        Object.entries(raw).forEach(([header, value]) => {
          const key = headerMap.get(header.toLowerCase().trim());
          if (key) {
            mapped[key] = typeof value === "string" ? value.trim() : value;
          }
        });
        const errors = validateRow(mapped, idx + 2);
        return {
          ...mapped,
          _rowNum: idx + 2,
          _errors: errors,
          _isDuplicate: false,
          _duplicateAction: "skip" as const,
        };
      });

      // Check duplicates
      const dupeMap = await checkDuplicates(mappedRows);
      mappedRows.forEach((row, idx) => {
        if (dupeMap.has(idx)) {
          row._isDuplicate = true;
        }
      });

      setRows(mappedRows);
      setStep("preview");
    } catch (err: any) {
      setParseError(`Erro ao ler planilha: ${err.message}`);
    }
  }, [columns, validateRow, checkDuplicates]);

  const errorRows = rows.filter(r => r._errors.length > 0);
  const duplicateRows = rows.filter(r => r._isDuplicate);
  const validRows = rows.filter(r => r._errors.length === 0);

  const handleImport = useCallback(async () => {
    const toImport = validRows.filter(r => !r._isDuplicate || r._duplicateAction === "update");
    if (toImport.length === 0) return;

    setStep("importing");
    setProgress(0);

    // Simulate progress
    const interval = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 90));
    }, 300);

    try {
      const result = await onImport(toImport);
      clearInterval(interval);
      setProgress(100);
      setImportResult(result);
      setStep("done");
    } catch {
      clearInterval(interval);
      setParseError("Erro durante a importação. Tente novamente.");
      setStep("preview");
    }
  }, [validRows, onImport]);

  const toggleDuplicateAction = (rowNum: number) => {
    setRows(prev => prev.map(r =>
      r._rowNum === rowNum
        ? { ...r, _duplicateAction: r._duplicateAction === "skip" ? "update" : "skip" }
        : r
    ));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Arraste um arquivo .xlsx ou clique para selecionar
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                Selecionar Planilha
              </Button>
            </div>

            {parseError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <p className="text-sm text-muted-foreground">
                Não tem o modelo? Baixe o template com as colunas corretas.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => generateTemplate(columns, templateFileName)}
              >
                <Download className="h-4 w-4" />
                Baixar Modelo
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1">
                <FileSpreadsheet className="h-3 w-3" />
                {rows.length} registro(s)
              </Badge>
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {validRows.length} válido(s)
              </Badge>
              {errorRows.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  {errorRows.length} com erro(s)
                </Badge>
              )}
              {duplicateRows.length > 0 && (
                <Badge className="gap-1 bg-amber-500">
                  <AlertTriangle className="h-3 w-3" />
                  {duplicateRows.length} duplicado(s)
                </Badge>
              )}
            </div>

            {/* Error report */}
            {errorRows.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Erros encontrados — corrija na planilha e reimporte:</p>
                  <ScrollArea className="max-h-32">
                    <ul className="text-xs space-y-1 list-disc pl-4">
                      {errorRows.slice(0, 50).map(r => (
                        <li key={r._rowNum}>
                          <strong>Linha {r._rowNum}:</strong> {r._errors.join("; ")}
                        </li>
                      ))}
                      {errorRows.length > 50 && (
                        <li>... e mais {errorRows.length - 50} erros</li>
                      )}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}

            {/* Duplicate report */}
            {duplicateRows.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Registros duplicados encontrados:</p>
                  <ScrollArea className="max-h-32">
                    <ul className="text-xs space-y-1">
                      {duplicateRows.map(r => (
                        <li key={r._rowNum} className="flex items-center justify-between gap-2">
                          <span>Linha {r._rowNum}: <strong>{r.nome_completo || r.razao_social || "—"}</strong> (CPF/CNPJ já existe)</span>
                          <Button
                            variant={r._duplicateAction === "update" ? "default" : "outline"}
                            size="sm"
                            className="h-6 text-xs shrink-0"
                            onClick={() => toggleDuplicateAction(r._rowNum)}
                          >
                            {r._duplicateAction === "update" ? "Atualizar" : "Ignorar"}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            )}

            {/* Preview table */}
            <ScrollArea className="flex-1 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    {columns.slice(0, 5).map(c => (
                      <TableHead key={c.key}>{c.label}</TableHead>
                    ))}
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 100).map(r => (
                    <TableRow key={r._rowNum} className={r._errors.length > 0 ? "bg-destructive/5" : r._isDuplicate ? "bg-amber-500/5" : ""}>
                      <TableCell className="font-mono text-xs">{r._rowNum}</TableCell>
                      {columns.slice(0, 5).map(c => (
                        <TableCell key={c.key} className="text-sm truncate max-w-[150px]">
                          {r[c.key] != null ? String(r[c.key]) : "—"}
                        </TableCell>
                      ))}
                      <TableCell>
                        {r._errors.length > 0 ? (
                          <Badge variant="destructive" className="text-xs">Erro</Badge>
                        ) : r._isDuplicate ? (
                          <Badge className="text-xs bg-amber-500">Duplicado</Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">OK</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {step === "importing" && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Importando registros...</p>
            <Progress value={progress} className="max-w-xs mx-auto" />
          </div>
        )}

        {step === "done" && importResult && (
          <div className="py-12 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
            <div>
              <p className="text-lg font-semibold">Importação concluída!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {importResult.success} registro(s) importado(s) com sucesso
                {importResult.errors > 0 && `, ${importResult.errors} erro(s)`}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={reset}>Voltar</Button>
              <Button
                disabled={validRows.length === 0}
                onClick={handleImport}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Importar {validRows.filter(r => !r._isDuplicate || r._duplicateAction === "update").length} registro(s)
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => { reset(); onOpenChange(false); }}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
