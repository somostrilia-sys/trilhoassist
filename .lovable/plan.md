
## Análise: O que JÁ EXISTE vs. O que FALTA

### Situação Atual
O `FinancialClosing.tsx` (Fechamento Financeiro) já possui:
- ✅ 6 abas: À Vista (Pendente NF), Faturado Mensal, Faturado Quinzenal, Faturado Semanal, Prestadores, Fechamentos
- ✅ Filtro por prestador (dropdown "Todos os prestadores") + filtro por período
- ✅ Busca (lupa) na aba "Fechamentos" (busca por nome do prestador)
- ✅ Exportação PDF por prestador individual (abas Prestadores e Fechamentos)
- ❌ Menu duplicado "Fechamento Prestadores" no sidebar + rota `/finance/prestadores`

---

## PLANO DE ALTERAÇÕES

### 1. Remover menu duplicado e rota
- **Arquivo:** `AppSidebar.tsx` — remover item "Fechamento Prestadores" (`/finance/prestadores`)
- **Arquivo:** `App.tsx` — remover rota `/finance/prestadores` e import do `FechamentoPrestadores`
- **Risco:** 🟢 Baixo

### 2. Adicionar campo de busca (lupa) global para TODAS as abas
- **Arquivo:** `FinancialClosing.tsx`
- **O que faz:** Adicionar um campo de busca ao lado dos filtros existentes (prestador + datas). A busca filtra por: **nome do prestador, placa, protocolo, beneficiário, tipo de serviço**
- **Abas afetadas:** À Vista, Faturado Mensal, Faturado Quinzenal, Faturado Semanal, Prestadores
- **Obs:** A aba "Fechamentos" já tem busca própria, será mantida
- **Risco:** 🟢 Baixo

### 3. Exportação Excel na aba "À Vista (Pendente NF)"
- **Arquivo:** `FinancialClosing.tsx`
- **O que faz:** Botão "Exportar Excel" que gera planilha .xlsx com TODOS os prestadores com NF pendente, contendo: **Protocolo, Placa, Tipo de Serviço, Prestador, Data, Valor**
- **Layout:** Conforme imagem de referência (image-27.png) — colunas: Data, Protocolo, Placa, Valor + VALOR TOTAL no final
- **Risco:** 🟢 Baixo

### 4. Exportação Excel na aba "Prestadores"
- **Arquivo:** `FinancialClosing.tsx`
- **O que faz:** Botão "Excel" ao lado do botão "PDF" existente em cada prestador, gerando planilha individual com: **Data, Protocolo, Placa, Valor** + linha de VALOR TOTAL
- **Layout:** Conforme imagem de referência (image-27.png)
- **Risco:** 🟢 Baixo

---

## RESUMO

| # | Alteração | Risco |
|---|-----------|-------|
| 1 | Remover menu/rota duplicados | 🟢 Baixo |
| 2 | Busca (lupa) global nas abas de pagamento e prestadores | 🟢 Baixo |
| 3 | Excel na aba "À Vista (Pendente NF)" | 🟢 Baixo |
| 4 | Excel por prestador na aba "Prestadores" | 🟢 Baixo |

**Todas as alterações são aditivas e dentro do Fechamento Financeiro existente.**
