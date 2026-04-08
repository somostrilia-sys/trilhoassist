
## Análise: O que JÁ EXISTE vs. O que FALTA

### 1. Fechamento Financeiro — Aba "À Vista (Pendente NF)"

**Já existe:**
- ✅ Botão "Excel Pendente NF" que exporta todos os prestadores à vista
- ✅ Filtro por prestador e período (data início/fim)

**Falta:**
- ❌ O botão atual exporta TODOS os à vista, não apenas os pendentes de NF. Precisa separar em **duas opções**: "Excel Pendente NF" (apenas sem NF) e "Excel Todos À Vista" (todos pagos à vista no período, com ou sem NF)

**Arquivo:** `src/pages/finance/FinancialClosing.tsx`
**Risco:** 🟢 Baixo

---

### 2. Relatórios — Filtro por período com datas específicas

**Já existe:**
- ✅ Dropdown com "Últimos 3/6/12 meses" (linhas 348-357)
- ✅ A query `useDetailedRequests` já usa `startStr` e `endStr` do período

**Falta:**
- ❌ Não há seletor de data inicial e final específicas (datepicker). O filtro atual só permite meses pré-definidos (3, 6, 12 meses). Precisa adicionar **dois datepickers** (De/Até) que substituam o período automático quando preenchidos.

**Arquivo:** `src/pages/finance/FinancialReports.tsx`
**Risco:** 🟡 Médio (afeta a query principal que alimenta todas as abas)

---

### 3. Relatórios — Dropdown "Todos os clientes" com lentidão e busca

**Já existe:**
- ✅ Select com lista de clientes (linhas 561-568)
- ✅ Filtro `clientFilter` funciona no código

**Problema:**
- ❌ O componente `Select` do shadcn não tem busca nativa — em listas grandes causa lentidão e dificuldade de seleção
- ❌ Falta campo de busca/lupa para localizar clientes pelo nome rapidamente

**Solução:**
- Substituir o `Select` por um **Combobox** (Command + Popover do shadcn) com busca integrada, em todas as abas que usam o filtro de clientes (Atendimentos, Beneficiários, Recebimentos)

**Arquivo:** `src/pages/finance/FinancialReports.tsx`
**Risco:** 🟢 Baixo

---

### 4. Relatórios — Exportação de Atendimentos sem prestador

**Já existe:**
- ✅ Botão "Exportar CSV" na aba Atendimentos (linha 580)
- ✅ Tabela mostra dados do atendimento

**Falta:**
- ❌ A coluna "Prestador" **NÃO existe** na tabela nem no CSV. A query `useDetailedRequests` não busca dados de dispatches/providers
- ❌ Precisa fazer JOIN com `dispatches → providers` para obter o nome do prestador vinculado

**Solução:**
- Adicionar query de dispatches para os requests ou fazer sub-query
- Adicionar coluna "Prestador" na tabela e no CSV exportado

**Arquivo:** `src/pages/finance/FinancialReports.tsx`
**Risco:** 🟡 Médio (precisa de query adicional)

---

## RESUMO

| # | Alteração | Arquivo | Risco |
|---|-----------|---------|-------|
| 1 | Separar export Excel: "Pendente NF" vs "Todos À Vista" | FinancialClosing.tsx | 🟢 Baixo |
| 2 | Datepickers (De/Até) no módulo de Relatórios | FinancialReports.tsx | 🟡 Médio |
| 3 | Combobox com busca no filtro de clientes | FinancialReports.tsx | 🟢 Baixo |
| 4 | Coluna "Prestador" na aba Atendimentos + CSV | FinancialReports.tsx | 🟡 Médio |

**Nenhuma alteração de banco de dados necessária.** Todas as mudanças são no frontend.
