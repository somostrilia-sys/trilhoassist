import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import ExcelImportDialog, { type ColumnDef, type ImportRow } from "./ExcelImportDialog";
import { unmask } from "@/lib/masks";

const COLUMNS: ColumnDef[] = [
  { key: "nome_completo", label: "nome_completo", required: true },
  { key: "cpf_cnpj", label: "cpf_cnpj", required: true },
  { key: "telefone", label: "telefone", required: true },
  { key: "email", label: "email", required: false },
  { key: "placa", label: "placa", required: true },
  { key: "marca", label: "marca", required: false },
  { key: "modelo", label: "modelo", required: false },
  { key: "ano", label: "ano", required: false },
  { key: "plano", label: "plano", required: true },
  { key: "data_inicio", label: "data_inicio", required: true },
  { key: "data_fim", label: "data_fim", required: true },
  { key: "limite_acionamentos", label: "limite_acionamentos", required: true },
];

function isValidCpfCnpj(v: string): boolean {
  const raw = v.replace(/\D/g, "");
  return raw.length === 11 || raw.length === 14;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  planMap: Map<string, string>; // plan name -> plan id
  onComplete: () => void;
}

export default function BeneficiaryImport({ open, onOpenChange, clientId, planMap, onComplete }: Props) {
  const validateRow = useCallback((row: Record<string, any>, rowNum: number): string[] => {
    const errors: string[] = [];
    if (!row.nome_completo) errors.push("Nome obrigatório");
    if (!row.cpf_cnpj) errors.push("CPF/CNPJ obrigatório");
    else if (!isValidCpfCnpj(String(row.cpf_cnpj))) errors.push("CPF/CNPJ inválido");
    if (!row.telefone) errors.push("Telefone obrigatório");
    if (!row.placa) errors.push("Placa obrigatória");
    if (!row.plano) errors.push("Plano obrigatório");
    else if (!planMap.has(String(row.plano).toLowerCase().trim())) errors.push(`Plano "${row.plano}" não encontrado`);
    if (!row.limite_acionamentos) errors.push("Limite de acionamentos obrigatório");
    return errors;
  }, [planMap]);

  const checkDuplicates = useCallback(async (rows: Record<string, any>[]): Promise<Map<number, string>> => {
    const cpfs = rows.map(r => unmask(String(r.cpf_cnpj || "")));
    const plates = rows.map(r => String(r.placa || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));

    const { data: existing } = await supabase
      .from("beneficiaries")
      .select("cpf, vehicle_plate")
      .eq("client_id", clientId);

    const existingCpfs = new Set((existing || []).map(e => unmask(e.cpf || "")));
    const existingPlates = new Set((existing || []).map(e => (e.vehicle_plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "")));

    const dupes = new Map<number, string>();
    rows.forEach((r, idx) => {
      if (existingCpfs.has(cpfs[idx]) || existingPlates.has(plates[idx])) {
        dupes.set(idx, cpfs[idx]);
      }
    });
    return dupes;
  }, [clientId]);

  const handleImport = useCallback(async (rows: ImportRow[]): Promise<{ success: number; errors: number }> => {
    let success = 0;
    let errors = 0;

    // Batch insert in chunks of 50
    const chunks: ImportRow[][] = [];
    for (let i = 0; i < rows.length; i += 50) {
      chunks.push(rows.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      const toInsert = chunk
        .filter(r => !r._isDuplicate)
        .map(r => ({
          name: String(r.nome_completo),
          cpf: unmask(String(r.cpf_cnpj)),
          phone: unmask(String(r.telefone)),
          vehicle_plate: String(r.placa).toUpperCase().replace(/[^A-Z0-9]/g, ""),
          vehicle_model: r.modelo ? `${r.marca || ""} ${r.modelo}`.trim() : (r.marca || null),
          vehicle_year: r.ano ? parseInt(String(r.ano)) || null : null,
          plan_id: planMap.get(String(r.plano).toLowerCase().trim()) || null,
          client_id: clientId,
          active: true,
        }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("beneficiaries").insert(toInsert);
        if (error) {
          errors += toInsert.length;
        } else {
          success += toInsert.length;
        }
      }

      // Handle updates for duplicates marked as "update"
      const toUpdate = chunk.filter(r => r._isDuplicate && r._duplicateAction === "update");
      for (const r of toUpdate) {
        const cpf = unmask(String(r.cpf_cnpj));
        const { error } = await supabase
          .from("beneficiaries")
          .update({
            name: String(r.nome_completo),
            phone: unmask(String(r.telefone)),
            vehicle_plate: String(r.placa).toUpperCase().replace(/[^A-Z0-9]/g, ""),
            vehicle_model: r.modelo ? `${r.marca || ""} ${r.modelo}`.trim() : undefined,
            vehicle_year: r.ano ? parseInt(String(r.ano)) || null : undefined,
            plan_id: planMap.get(String(r.plano).toLowerCase().trim()) || undefined,
          })
          .eq("cpf", cpf)
          .eq("client_id", clientId);
        if (error) errors++;
        else success++;
      }
    }

    onComplete();
    return { success, errors };
  }, [clientId, planMap, onComplete]);

  return (
    <ExcelImportDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Importar Beneficiários"
      description="Importe beneficiários a partir de uma planilha Excel (.xlsx). Baixe o modelo para usar o formato correto."
      columns={COLUMNS}
      templateFileName="modelo_beneficiarios.xlsx"
      validateRow={validateRow}
      checkDuplicates={checkDuplicates}
      onImport={handleImport}
    />
  );
}
