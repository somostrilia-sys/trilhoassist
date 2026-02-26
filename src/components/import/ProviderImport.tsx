import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import ExcelImportDialog, { type ColumnDef, type ImportRow } from "./ExcelImportDialog";
import { unmask } from "@/lib/masks";

const COLUMNS: ColumnDef[] = [
  { key: "razao_social", label: "razao_social", required: true },
  { key: "cpf_cnpj", label: "cpf_cnpj", required: true },
  { key: "telefone", label: "telefone", required: true },
  { key: "email", label: "email", required: false },
  { key: "tipo_servico", label: "tipo_servico", required: true },
  { key: "regiao_atuacao", label: "regiao_atuacao", required: true },
  { key: "valor_km", label: "valor_km", required: false },
  { key: "valor_fixo", label: "valor_fixo", required: false },
  { key: "pix_chave", label: "pix_chave", required: false },
  { key: "banco", label: "banco", required: false },
  { key: "agencia", label: "agencia", required: false },
  { key: "conta", label: "conta", required: false },
];

const SERVICE_MAP: Record<string, string> = {
  guincho: "tow_light",
  "guincho leve": "tow_light",
  "guincho pesado": "tow_heavy",
  "guincho moto": "tow_motorcycle",
  reboque: "tow_light",
  "reboque leve": "tow_light",
  "reboque pesado": "tow_heavy",
  "reboque moto": "tow_motorcycle",
  chaveiro: "locksmith",
  "troca de pneu": "tire_change",
  pneu: "tire_change",
  bateria: "battery",
  combustivel: "fuel",
  combustível: "fuel",
  "pane seca": "fuel",
  outro: "other",
  outros: "other",
};

function isValidCpfCnpj(v: string): boolean {
  const raw = v.replace(/\D/g, "");
  return raw.length === 11 || raw.length === 14;
}

function parseServices(input: string): string[] {
  if (!input) return [];
  return input.split(/[,;\/]/).map(s => {
    const key = s.trim().toLowerCase();
    return SERVICE_MAP[key] || key;
  }).filter(Boolean);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onComplete: () => void;
}

export default function ProviderImport({ open, onOpenChange, tenantId, onComplete }: Props) {
  const validateRow = useCallback((row: Record<string, any>, rowNum: number): string[] => {
    const errors: string[] = [];
    if (!row.razao_social) errors.push("Razão social obrigatória");
    if (!row.cpf_cnpj) errors.push("CPF/CNPJ obrigatório");
    else if (!isValidCpfCnpj(String(row.cpf_cnpj))) errors.push("CPF/CNPJ inválido");
    if (!row.telefone) errors.push("Telefone obrigatório");
    if (!row.tipo_servico) errors.push("Tipo de serviço obrigatório");
    if (!row.regiao_atuacao) errors.push("Região de atuação obrigatória");
    return errors;
  }, []);

  const checkDuplicates = useCallback(async (rows: Record<string, any>[]): Promise<Map<number, string>> => {
    const cnpjs = rows.map(r => unmask(String(r.cpf_cnpj || "")));
    const { data: existing } = await supabase
      .from("providers")
      .select("cnpj")
      .eq("tenant_id", tenantId);

    const existingCnpjs = new Set((existing || []).map(e => unmask(e.cnpj || "")));

    const dupes = new Map<number, string>();
    rows.forEach((r, idx) => {
      if (existingCnpjs.has(cnpjs[idx]) && cnpjs[idx]) {
        dupes.set(idx, cnpjs[idx]);
      }
    });
    return dupes;
  }, [tenantId]);

  const handleImport = useCallback(async (rows: ImportRow[]): Promise<{ success: number; errors: number }> => {
    let success = 0;
    let errors = 0;

    const chunks: ImportRow[][] = [];
    for (let i = 0; i < rows.length; i += 50) {
      chunks.push(rows.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      const toInsert = chunk
        .filter(r => !r._isDuplicate)
        .map(r => {
          const region = String(r.regiao_atuacao || "");
          // Try to parse city/state from "Cidade/UF" or "Cidade - UF"
          const cityMatch = region.match(/^(.+?)\s*[-\/]\s*([A-Z]{2})$/i);
          return {
            name: String(r.razao_social),
            cnpj: unmask(String(r.cpf_cnpj)),
            phone: unmask(String(r.telefone)),
            email: r.email || null,
            services: parseServices(String(r.tipo_servico)),
            city: cityMatch ? cityMatch[1].trim() : region,
            state: cityMatch ? cityMatch[2].toUpperCase() : null,
            pix_key: r.pix_chave || null,
            bank_name: r.banco || null,
            bank_agency: r.agencia ? String(r.agencia) : null,
            bank_account: r.conta ? String(r.conta) : null,
            tenant_id: tenantId,
            active: true,
          };
        });

      if (toInsert.length > 0) {
        const { error } = await supabase.from("providers").insert(toInsert);
        if (error) errors += toInsert.length;
        else success += toInsert.length;
      }

      // Handle updates
      const toUpdate = chunk.filter(r => r._isDuplicate && r._duplicateAction === "update");
      for (const r of toUpdate) {
        const cnpj = unmask(String(r.cpf_cnpj));
        const region = String(r.regiao_atuacao || "");
        const cityMatch = region.match(/^(.+?)\s*[-\/]\s*([A-Z]{2})$/i);

        const { error } = await supabase
          .from("providers")
          .update({
            name: String(r.razao_social),
            phone: unmask(String(r.telefone)),
            email: r.email || null,
            services: parseServices(String(r.tipo_servico)),
            city: cityMatch ? cityMatch[1].trim() : region,
            state: cityMatch ? cityMatch[2].toUpperCase() : null,
            pix_key: r.pix_chave || null,
            bank_name: r.banco || null,
            bank_agency: r.agencia ? String(r.agencia) : null,
            bank_account: r.conta ? String(r.conta) : null,
          })
          .eq("cnpj", cnpj)
          .eq("tenant_id", tenantId);
        if (error) errors++;
        else success++;
      }
    }

    onComplete();
    return { success, errors };
  }, [tenantId, onComplete]);

  return (
    <ExcelImportDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Importar Prestadores"
      description="Importe prestadores a partir de uma planilha Excel (.xlsx). Baixe o modelo para usar o formato correto."
      columns={COLUMNS}
      templateFileName="modelo_prestadores.xlsx"
      validateRow={validateRow}
      checkDuplicates={checkDuplicates}
      onImport={handleImport}
    />
  );
}
