import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  TestTube, Link2, Download, CheckCircle2, XCircle, Loader2,
  ArrowRight, Database, Zap, ChevronRight,
} from "lucide-react";

interface WizardProps {
  clientId: string;
  clientName: string;
  tenantId: string;
  onComplete?: () => void;
}

interface StepState {
  status: "pending" | "running" | "success" | "error";
  data?: any;
  error?: string;
}

export function ErpSetupWizard({ clientId, clientName, tenantId, onComplete }: WizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [testStep, setTestStep] = useState<StepState>({ status: "pending" });
  const [mapStep, setMapStep] = useState<StepState>({ status: "pending" });
  const [importStep, setImportStep] = useState<StepState>({ status: "pending" });
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, created: 0, updated: 0 });

  const callErp = async (action: string, extra = {}) => {
    const { data, error } = await supabase.functions.invoke("erp-integration", {
      body: { action, client_id: clientId, tenant_id: tenantId, ...extra },
    });
    if (error) throw error;
    return data;
  };

  // ─── Step 1: Test Connection ───
  const handleTest = async () => {
    setTestStep({ status: "running" });
    try {
      const result = await callErp("test");
      if (result.success) {
        setTestStep({ status: "success", data: result });
      } else {
        setTestStep({ status: "error", error: result.message });
      }
    } catch (err: any) {
      setTestStep({ status: "error", error: err.message });
    }
  };

  // ─── Step 2: Auto-Map Products ───
  const handleAutoMap = async () => {
    setMapStep({ status: "running" });
    try {
      const result = await callErp("auto_map_products");
      if (result.error) {
        setMapStep({ status: "error", error: result.error });
      } else {
        setMapStep({ status: "success", data: result });
        queryClient.invalidateQueries({ queryKey: ["erp-mappings"] });
        queryClient.invalidateQueries({ queryKey: ["plans-for-mapping"] });
      }
    } catch (err: any) {
      setMapStep({ status: "error", error: err.message });
    }
  };

  // ─── Step 3: Import with page-by-page progress ───
  const handleImport = async () => {
    setImportStep({ status: "running" });
    setImportProgress({ current: 0, total: 0, created: 0, updated: 0 });

    try {
      // First, get page count via test
      const testData = testStep.data;
      const totalPages = testData?.total_pages || 0;

      if (totalPages > 3) {
        // Page-by-page import for large clients
        let totalCreated = 0;
        let totalUpdated = 0;
        let totalFound = 0;

        setImportProgress({ current: 0, total: totalPages, created: 0, updated: 0 });

        for (let page = 1; page <= totalPages; page++) {
          const result = await callErp("import", { page, sync_type: "manual" });
          totalCreated += result.records_created || 0;
          totalUpdated += result.records_updated || 0;
          totalFound += result.records_found || 0;

          setImportProgress({
            current: page,
            total: totalPages,
            created: totalCreated,
            updated: totalUpdated,
          });
        }

        setImportStep({
          status: "success",
          data: { records_found: totalFound, records_created: totalCreated, records_updated: totalUpdated },
        });
      } else {
        // Small client: single import
        const result = await callErp("import", { sync_type: "manual" });
        if (result.error) {
          setImportStep({ status: "error", error: result.error });
        } else {
          setImportStep({ status: "success", data: result });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
      toast({ title: "Importação concluída!" });
      onComplete?.();
    } catch (err: any) {
      setImportStep({ status: "error", error: err.message });
    }
  };

  const steps = [
    { key: "test", label: "Testar Conexão", state: testStep },
    { key: "map", label: "Mapear Produtos", state: mapStep },
    { key: "import", label: "Importar Veículos", state: importStep },
  ];

  const getStepIcon = (state: StepState, index: number) => {
    if (state.status === "running") return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    if (state.status === "success") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    if (state.status === "error") return <XCircle className="h-5 w-5 text-destructive" />;
    return (
      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center text-xs text-muted-foreground font-bold">
        {index + 1}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stepper Header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <span className="font-semibold">{clientName}</span>
            </div>
            <Badge variant="outline" className="gap-1">
              <Zap className="h-3 w-3" /> Wizard de Integração
            </Badge>
          </div>

          <div className="flex items-center gap-2 mt-4">
            {steps.map((step, i) => (
              <div key={step.key} className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-2">
                  {getStepIcon(step.state, i)}
                  <span className={`text-sm font-medium ${
                    step.state.status === "success" ? "text-green-700" :
                    step.state.status === "error" ? "text-destructive" :
                    step.state.status === "running" ? "text-primary" :
                    "text-muted-foreground"
                  }`}>
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 ml-auto" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Test Connection */}
      <Card className={testStep.status === "success" ? "border-green-200" : undefined}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TestTube className="h-5 w-5" /> Passo 1 — Testar Conexão
          </CardTitle>
          <CardDescription>Verifica se o endpoint e token estão funcionando</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleTest}
            disabled={testStep.status === "running"}
            variant={testStep.status === "success" ? "outline" : "default"}
          >
            {testStep.status === "running" ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testando...</>
            ) : testStep.status === "success" ? (
              <><CheckCircle2 className="h-4 w-4 mr-2 text-green-600" /> Reconectar</>
            ) : (
              <><TestTube className="h-4 w-4 mr-2" /> Testar Conexão</>
            )}
          </Button>

          {testStep.status === "success" && testStep.data && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:bg-green-950/20 dark:border-green-800">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-300">{testStep.data.message}</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-primary">{testStep.data.total_pages || "—"}</p>
                  <p className="text-xs text-muted-foreground">Páginas</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-primary">{testStep.data.total_records || testStep.data.raw_count || "—"}</p>
                  <p className="text-xs text-muted-foreground">Registros</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-primary capitalize">{testStep.data.mode || "standard"}</p>
                  <p className="text-xs text-muted-foreground">Tipo API</p>
                </div>
              </div>
            </div>
          )}

          {testStep.status === "error" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="text-sm text-destructive">{testStep.error}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Auto-Map Products */}
      <Card className={`transition-opacity ${testStep.status !== "success" ? "opacity-50 pointer-events-none" : ""} ${mapStep.status === "success" ? "border-green-200" : ""}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="h-5 w-5" /> Passo 2 — Auto-Mapear Produtos
          </CardTitle>
          <CardDescription>Busca produtos do ERP e cria planos automaticamente no sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleAutoMap}
            disabled={mapStep.status === "running" || testStep.status !== "success"}
            variant={mapStep.status === "success" ? "outline" : "default"}
          >
            {mapStep.status === "running" ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Mapeando...</>
            ) : mapStep.status === "success" ? (
              <><CheckCircle2 className="h-4 w-4 mr-2 text-green-600" /> Remapear</>
            ) : (
              <><Link2 className="h-4 w-4 mr-2" /> Auto-Mapear Produtos</>
            )}
          </Button>

          {mapStep.status === "success" && mapStep.data && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:bg-green-950/20 dark:border-green-800">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-300">Mapeamento concluído</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-primary">{mapStep.data.products_found}</p>
                  <p className="text-xs text-muted-foreground">Produtos encontrados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-green-600">{mapStep.data.plans_created}</p>
                  <p className="text-xs text-muted-foreground">Planos criados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-blue-600">{mapStep.data.mappings_created}</p>
                  <p className="text-xs text-muted-foreground">Mapeamentos</p>
                </div>
              </div>
            </div>
          )}

          {mapStep.status === "error" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="text-sm text-destructive">{mapStep.error}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Import Vehicles */}
      <Card className={`transition-opacity ${mapStep.status !== "success" ? "opacity-50 pointer-events-none" : ""} ${importStep.status === "success" ? "border-green-200" : ""}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="h-5 w-5" /> Passo 3 — Importar Veículos
          </CardTitle>
          <CardDescription>Importa todos os beneficiários e veículos do ERP para o sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleImport}
            disabled={importStep.status === "running" || mapStep.status !== "success"}
            variant={importStep.status === "success" ? "outline" : "default"}
            size="lg"
          >
            {importStep.status === "running" ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando...</>
            ) : importStep.status === "success" ? (
              <><CheckCircle2 className="h-4 w-4 mr-2 text-green-600" /> Reimportar</>
            ) : (
              <><Download className="h-4 w-4 mr-2" /> Iniciar Importação</>
            )}
          </Button>

          {/* Progress bar for page-by-page import */}
          {importStep.status === "running" && importProgress.total > 0 && (
            <div className="space-y-2">
              <Progress value={(importProgress.current / importProgress.total) * 100} className="h-3" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Página {importProgress.current}/{importProgress.total}
                </span>
                <span className="font-medium">
                  {importProgress.created + importProgress.updated} importados
                </span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="text-green-600">{importProgress.created} criados</span>
                <span className="text-blue-600">{importProgress.updated} atualizados</span>
              </div>
            </div>
          )}

          {importStep.status === "success" && importStep.data && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:bg-green-950/20 dark:border-green-800">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-300">Importação concluída!</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-primary">{importStep.data.records_found}</p>
                  <p className="text-xs text-muted-foreground">Encontrados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-green-600">{importStep.data.records_created}</p>
                  <p className="text-xs text-muted-foreground">Criados</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-background border">
                  <p className="text-2xl font-bold text-blue-600">{importStep.data.records_updated}</p>
                  <p className="text-xs text-muted-foreground">Atualizados</p>
                </div>
              </div>
            </div>
          )}

          {importStep.status === "error" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="text-sm text-destructive">{importStep.error}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
