
# Análise: Relatório Técnico – Módulo Financeiro / Prestadores

## Comparação: O que JÁ EXISTE vs. O que FALTA

---

### 1. FILTRO "PENDENTE DE NOTA FISCAL" (Fechamento Prestadores)
- **Rota:** `FechamentoPrestadores.tsx`
- **Status: ⚠️ PARCIAL**
- ✅ Já existe a aba "À Vista (Pendente NF)" no `FinancialClosing.tsx` com destaque visual para NFs pendentes
- ❌ **Falta** no `FechamentoPrestadores.tsx`: não existe filtro por "Pendente de Nota Fiscal". A página lista prestadores sem filtro de status de NF
- **Impacto:** Baixo — adicionar um filtro dropdown no `FechamentoPrestadores.tsx` que cruze `provider_invoices` com os dispatches do período

---

### 2. EXPORTAÇÃO EXCEL – FECHAMENTO DE PRESTADORES
- **Rota:** `FechamentoPrestadores.tsx`
- **Status: ✅ JÁ EXISTE (parcial)**
- ✅ Função `exportExcel()` já implementada (linha 213) — exporta por prestador individual com abas "À Vista" e "Faturado"
- ❌ **Falta:** Exportação GERAL (todos os prestadores de uma vez) com layout conforme imagem 1 (colunas: Nome prestador, Período, Qtd atendimentos, Valor total, Status NF)
- **Impacto:** Médio — criar botão "Exportar Excel" global no cabeçalho da página

---

### 3. BUSCA (LUPA) NOS MÓDULOS FINANCEIROS
- **Status por rota:**
  - `Billing.tsx` (Faturamento): ✅ **JÁ TEM** busca por cliente (linha 293-294)
  - `FechamentoMensal.tsx`: ✅ **JÁ TEM** campo de busca (linha 35, search state)
  - `FinancialClosing.tsx` (Fechamento): ✅ **JÁ TEM** campo de busca (linha 19, Search importado)
  - `FechamentoPrestadores.tsx`: ❌ **NÃO TEM** campo de busca — apenas filtro de período
- **Falta:** Busca no `FechamentoPrestadores.tsx` que pesquise por nome do prestador, placa, protocolo, tipo de serviço
- **Campos pesquisáveis que faltam em TODOS:** busca por placa, protocolo e tipo de serviço (a maioria filtra só por nome)
- **Impacto:** Médio — ampliar os filtros de busca existentes e adicionar busca no FechamentoPrestadores

---

### 4. EXPORTAÇÃO DE SERVIÇOS POR PERÍODO – PRESTADORES
- **Rota:** `FechamentoPrestadores.tsx`
- **Status: ✅ PARCIAL**
- ✅ Já exporta Excel e PDF por prestador individual (funções `exportExcel` e `exportPDF`)
- ❌ **Falta:** Exportação conforme layout da imagem 2 (Data, Protocolo, Placa, Valor) com filtro de período e VALOR TOTAL no final
- **Impacto:** Baixo — ajustar layout do Excel existente

---

### 5. PORTAL DO PRESTADOR – LISTAGEM DE SERVIÇOS
- **Rota:** `ProviderServices.tsx`
- **Status: ✅ JÁ EXISTE (quase completo)**
- ✅ Protocolo, Data, Serviço, Placa, Origem, Destino, KM, Status, V. Cotado, V. Final
- ✅ Busca por protocolo, nome, placa, origem
- ✅ Filtro por status e período
- ❌ **Falta:** Nome do associado (beneficiário) na tabela — atualmente mostra `requester_name` mas não o nome do beneficiário
- ❌ **Falta:** O campo de busca não pesquisa por nome do beneficiário
- **Impacto:** Baixo

---

### 6. PORTAL DO PRESTADOR – VALORES
- **Rota:** `ProviderServices.tsx` e `ProviderFinancial.tsx`
- **Status: ⚠️ VERIFICAR REGRA CRÍTICA**
- ✅ Exibe `quoted_amount` (V. Cotado) e `final_amount` (V. Final) do dispatch
- ⚠️ **Regra do prompt:** "O valor exibido deve ser exatamente o valor parametrizado para o prestador" — os valores atuais vêm do dispatch (`quoted_amount` / `final_amount`), que são definidos durante o despacho. Isso **já está correto** se o valor do dispatch reflete o valor negociado com o prestador
- ✅ Não usa valor do plano nem valor cobrado do associado (`charged_amount` não aparece no portal do prestador)
- **Impacto:** Nenhum — já funciona corretamente

---

### 7. BUSCA INTELIGENTE – CAMPOS PESQUISÁVEIS
- **Status: ⚠️ PARCIAL em todas as rotas**
- O prompt exige que TODOS os campos visíveis sejam pesquisáveis (nome prestador, associado, placa, protocolo, tipo serviço)
- Atualmente cada página busca apenas por 1-2 campos
- **Impacto:** Médio — ampliar filtro de busca em todas as páginas financeiras

---

## RESUMO DAS ALTERAÇÕES NECESSÁRIAS

| # | Alteração | Arquivo | Risco |
|---|-----------|---------|-------|
| 1 | Adicionar campo de busca (lupa) no FechamentoPrestadores | `FechamentoPrestadores.tsx` | 🟢 Baixo |
| 2 | Ampliar busca para incluir placa/protocolo/serviço em TODAS as páginas financeiras | `FechamentoPrestadores.tsx`, `Billing.tsx`, `FinancialClosing.tsx`, `FechamentoMensal.tsx` | 🟢 Baixo |
| 3 | Adicionar filtro "Pendente de NF" no FechamentoPrestadores | `FechamentoPrestadores.tsx` | 🟢 Baixo |
| 4 | Exportação Excel geral (todos prestadores) no FechamentoPrestadores | `FechamentoPrestadores.tsx` | 🟢 Baixo |
| 5 | Ajustar layout do Excel individual conforme imagem 2 | `FechamentoPrestadores.tsx` | 🟢 Baixo |
| 6 | Adicionar coluna "Beneficiário" no ProviderServices | `ProviderServices.tsx` | 🟢 Baixo |

**Todas as alterações são aditivas (não removem funcionalidade existente) e de baixo risco.**

---

## O QUE NÃO PRECISA ALTERAR (já funciona)

- ✅ Faturamento (`Billing.tsx`) — já tem busca
- ✅ FechamentoMensal — já tem busca e filtros
- ✅ FinancialClosing — já tem abas por método de pagamento e busca
- ✅ Portal do Prestador — valores corretos (usa `quoted_amount`/`final_amount` do dispatch)
- ✅ Fluxo de dados Operação → Financeiro → Portal já integrado
- ✅ Exportação PDF por prestador individual
