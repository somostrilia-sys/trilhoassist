import { formatCurrency, SERVICE_TYPE_LABELS } from "@/hooks/useFinancialData";
import { format } from "date-fns";

interface InvoiceItem {
  protocol: string;
  date: string;
  requesterName: string;
  vehiclePlate: string;
  vehicleModel: string;
  serviceType: string;
  chargedAmount: number;
  originAddress: string;
  destinationAddress: string;
  estimatedKm: number | null;
  cooperativa: string;
}

interface CooperativaGroup {
  cooperativa: string;
  plates: number;
  plateValue: number;
  items: InvoiceItem[];
  totalCharged: number;
}

interface InvoicePdfData {
  tenantName?: string;
  tenantLogo?: string;
  clientName: string;
  billingModel?: string;
  periodStart: string;
  periodEnd: string;
  dueDate?: string | null;
  totalPlates?: number;
  totalPlateValue?: number;
  items: InvoiceItem[];
  totalServices: number;
  totalCharged: number;
  totalProviderCost: number;
  markupAmount: number;
  notes?: string;
  type: "invoice" | "closing";
  providerName?: string;
  cooperativaGroups?: CooperativaGroup[];
}

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderItemRow(item: InvoiceItem, i: number) {
  const route = item.originAddress && item.destinationAddress
    ? `${escapeHtml(item.originAddress)} → ${escapeHtml(item.destinationAddress)}`
    : item.originAddress ? escapeHtml(item.originAddress) : "—";
  
  return `
    <tr style="${i % 2 === 0 ? "background:#f8fafc;" : ""}">
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px;">${escapeHtml(item.protocol)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${escapeHtml(item.date)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${escapeHtml(item.vehiclePlate || "—")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${escapeHtml(item.vehicleModel || "—")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${escapeHtml(item.serviceType)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;max-width:200px;word-break:break-word;">${route}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:11px;">${item.estimatedKm != null ? `${Number(item.estimatedKm).toFixed(0)} km` : "—"}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace;font-size:11px;font-weight:600;">${formatCurrency(item.chargedAmount)}</td>
    </tr>`;
}

function renderTableHeader() {
  return `
    <thead>
      <tr style="background:#1e3a5f;">
        <th style="padding:8px;text-align:left;color:#fff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Protocolo</th>
        <th style="padding:8px;text-align:left;color:#fff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Data</th>
        <th style="padding:8px;text-align:left;color:#fff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Placa</th>
        <th style="padding:8px;text-align:left;color:#fff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Modelo</th>
        <th style="padding:8px;text-align:left;color:#fff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Serviço</th>
        <th style="padding:8px;text-align:left;color:#fff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Roteirização</th>
        <th style="padding:8px;text-align:center;color:#fff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">KM</th>
        <th style="padding:8px;text-align:right;color:#fff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Valor</th>
      </tr>
    </thead>`;
}

function renderCooperativaSection(group: CooperativaGroup, billingModel?: string) {
  const itemRows = group.items.map((item, i) => renderItemRow(item, i)).join("");
  const showPlates = group.plates > 0;
  
  return `
    <div style="margin-bottom:28px;page-break-inside:avoid;">
      <div style="background:linear-gradient(135deg,#1e3a5f10,#1e3a5f05);border:1px solid #1e3a5f20;border-radius:8px;padding:14px 18px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:14px;font-weight:700;color:#1e3a5f;">${escapeHtml(group.cooperativa)}</div>
          </div>
          <div style="display:flex;gap:24px;font-size:12px;">
            ${showPlates ? `<div><span style="color:#64748b;">Placas:</span> <strong>${group.plates}</strong> (${formatCurrency(group.plateValue)})</div>` : ""}
            <div><span style="color:#64748b;">Acionamentos:</span> <strong>${group.items.length}</strong></div>
            <div><span style="color:#64748b;">Total:</span> <strong style="color:#1e3a5f;">${formatCurrency(group.totalCharged)}</strong></div>
          </div>
        </div>
      </div>
      ${group.items.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:11px;">
        ${renderTableHeader()}
        <tbody>${itemRows}</tbody>
      </table>` : `<p style="font-size:12px;color:#64748b;text-align:center;padding:8px;">Nenhum acionamento neste período.</p>`}
    </div>`;
}

export function generateFinancialPdf(data: InvoicePdfData) {
  const isInvoice = data.type === "invoice";
  const title = isInvoice ? "FATURA" : "FECHAMENTO FINANCEIRO";
  const entity = isInvoice ? data.clientName : data.providerName || "";
  const entityLabel = isInvoice ? "Cliente" : "Prestador";

  // For invoices with cooperativa groups, render grouped view
  const hasCooperativaGroups = data.cooperativaGroups && data.cooperativaGroups.length > 0;

  let servicesSection = "";

  if (hasCooperativaGroups && data.cooperativaGroups) {
    servicesSection = `
      <div style="margin-bottom:24px;">
        <div style="font-size:13px;font-weight:600;color:#1e3a5f;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.5px;">Detalhamento por Cooperativa</div>
        ${data.cooperativaGroups.map(g => renderCooperativaSection(g, data.billingModel)).join("")}
      </div>`;
  } else if (data.items.length > 0) {
    // Fallback: flat table (for closing PDFs or invoices without cooperativa)
    const itemRows = data.items.map((item, i) => renderItemRow(item, i)).join("");
    servicesSection = `
      <div style="margin-bottom:24px;">
        <div style="font-size:13px;font-weight:600;color:#1e3a5f;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;">Serviços Realizados</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          ${renderTableHeader()}
          <tbody>${itemRows}</tbody>
        </table>
      </div>`;
  }

  const plateSection =
    isInvoice && data.totalPlates && data.totalPlates > 0
      ? `
    <div style="margin-bottom:24px;padding:16px 20px;background:linear-gradient(135deg,#1e3a5f08,#1e3a5f05);border:1px solid #1e3a5f20;border-radius:8px;">
      <div style="font-size:13px;font-weight:600;color:#1e3a5f;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Resumo Geral de Placas</div>
      <div style="display:flex;gap:32px;">
        <div><span style="color:#64748b;font-size:12px;">Quantidade Total:</span> <strong>${data.totalPlates}</strong></div>
        <div><span style="color:#64748b;font-size:12px;">Valor Total:</span> <strong>${formatCurrency(data.totalPlateValue || 0)}</strong></div>
      </div>
    </div>`
      : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body { margin:0; padding:0; font-family:'Inter','Segoe UI',system-ui,sans-serif; color:#1e293b; background:#fff; }
    .page { max-width:900px; margin:0 auto; padding:40px; }
  </style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #1e3a5f;">
    <div>
      <div style="font-size:28px;font-weight:800;color:#1e3a5f;letter-spacing:-0.5px;">${escapeHtml(data.tenantName || "Trilho Soluções")}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">Gestão de Assistência 24h</div>
    </div>
    <div style="text-align:right;">
      <div style="display:inline-block;background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;padding:8px 20px;border-radius:6px;font-size:14px;font-weight:700;letter-spacing:1px;">${title}</div>
      <div style="font-size:11px;color:#64748b;margin-top:8px;">Emitido em ${format(new Date(), "dd/MM/yyyy")}</div>
    </div>
  </div>

  <!-- Info Cards -->
  <div style="display:flex;gap:16px;margin-bottom:24px;">
    <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${entityLabel}</div>
      <div style="font-size:16px;font-weight:700;color:#1e293b;">${escapeHtml(entity)}</div>
      ${data.billingModel ? `<div style="font-size:11px;color:#64748b;margin-top:4px;">Modelo: ${data.billingModel === "plate_only" ? "Somente Placa" : "Placa + Serviço"}</div>` : ""}
    </div>
    <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Período</div>
      <div style="font-size:16px;font-weight:700;color:#1e293b;">${format(new Date(data.periodStart), "dd/MM/yyyy")} a ${format(new Date(data.periodEnd), "dd/MM/yyyy")}</div>
      ${data.dueDate ? `<div style="font-size:11px;color:#64748b;margin-top:4px;">Vencimento: ${format(new Date(data.dueDate), "dd/MM/yyyy")}</div>` : ""}
    </div>
  </div>

  ${plateSection}

  ${servicesSection}

  <!-- Totals -->
  <div style="background:linear-gradient(135deg,#1e3a5f,#1e40af);color:#fff;border-radius:12px;padding:24px 28px;margin-bottom:24px;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">Total de Acionamentos</div>
        <div style="font-size:24px;font-weight:800;">${data.totalServices}</div>
      </div>
      ${isInvoice && data.totalPlates ? `
      <div style="text-align:center;">
        <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">Total de Placas</div>
        <div style="font-size:24px;font-weight:800;">${data.totalPlates}</div>
      </div>` : ""}
      <div style="text-align:right;">
        <div style="font-size:11px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">Valor Total</div>
        <div style="font-size:28px;font-weight:800;">${formatCurrency(data.totalCharged)}</div>
      </div>
    </div>
    ${!isInvoice ? `
    <div style="border-top:1px solid rgba(255,255,255,0.2);padding-top:12px;margin-top:12px;display:flex;justify-content:space-between;">
      <div>
        <span style="font-size:11px;opacity:0.7;">Valor por Serviço: </span>
        <span style="font-size:13px;font-weight:600;">${formatCurrency(data.totalProviderCost)}</span>
      </div>
    </div>` : ""}
  </div>

  ${data.notes ? `
  <div style="background:#fffbeb;border:1px solid #fbbf2420;border-radius:8px;padding:12px 16px;font-size:12px;color:#92400e;">
    <strong>Observações:</strong> ${escapeHtml(data.notes)}
  </div>` : ""}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:10px;color:#94a3b8;">
    Documento gerado automaticamente por ${escapeHtml(data.tenantName || "Trilho Soluções")} • ${format(new Date(), "dd/MM/yyyy HH:mm")}
  </div>
</div>
</body>
</html>`;

  // Open in new window and trigger print
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}
