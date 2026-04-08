
## Problema 1: Lupa de clientes (Combobox) não mostra dados

**Causa raiz:** A lista de `clients` usada no Combobox vem do hook `useBeneficiaryReport()`, que busca clientes com `active: true`. Porém, o Combobox da aba **Atendimentos** (linha 628-655) usa o estado `clientComboOpen` corretamente, mas os Comboboxes das **outras abas** (Beneficiários, linha 814-841) **não controlam estado de abertura/fechamento** — faltam `open` e `onOpenChange` no `<Popover>`. Isso faz o dropdown não fechar ao selecionar.

Além disso, se a query de `useBeneficiaryReport` falhar ou retornar vazio (ex: sem tenant_id), `clients` fica `[]` e o Combobox aparece vazio.

**Correção:**
- Criar uma query **independente** para buscar clientes (não depender de `useBeneficiaryReport`)
- Adicionar controle de `open/onOpenChange` em TODOS os Comboboxes
- Garantir que a busca no `CommandInput` funciona corretamente com o `value` do `CommandItem`

---

## Problema 2: Relatório não extrai todos os prestadores

**Causa raiz:** O `dispatchProviderMap` (linha 213-235) busca dispatches filtrados por `status: "completed"`. Muitos atendimentos podem ter dispatches com status `accepted` ou outro status — esses ficam **sem prestador** no relatório e no CSV.

**Correção:**
- Remover o filtro `.eq("status", "completed")` da query de dispatches para o mapa de prestadores
- Usar qualquer dispatch que tenha `provider_id` preenchido (priorizar o mais recente ou o completado)
- Garantir que o CSV e a tabela mostram o prestador corretamente

---

## Problema 3 (bônus): Excel "Pendente NF" exporta TODOS, não só pendentes

**Causa raiz:** `exportPendingNfExcel` recebe `tabDispatches` (todos os à vista filtrados), sem verificar se realmente falta NF. Deveria filtrar apenas dispatches sem registro em `provider_invoices`.

**Correção:**
- Buscar IDs dos dispatches que JÁ têm invoice
- Filtrar para exportar apenas os que NÃO têm

---

## Arquivos alterados
- `src/pages/finance/FinancialReports.tsx`

## Risco: 🟡 Médio
