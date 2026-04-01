

# Plano: Sincronismo GIA

## O que será feito

Adicionar integração com o sistema GIA (banco Supabase externo) para sincronizar associados e veículos, em paralelo ao SGA existente. Nenhum código existente será removido ou alterado.

---

## Etapas

### 1. Armazenar credenciais GIA como secrets

Dois secrets novos:
- `GIA_SUPABASE_URL` → `https://dxuoppekxgvdqnytftho.supabase.co`
- `GIA_SERVICE_ROLE_KEY` → a service role key fornecida

### 2. Criar edge function `gia-sync/index.ts` (arquivo novo)

- Recebe `{ client_id, tenant_id }` no body
- Conecta no Supabase do GIA usando os secrets acima
- Lê tabela `associados` (id, nome, cpf, telefone, status, plano_id) com paginação via `.range()`
- Lê tabela `veiculos` (associado_id, marca, modelo, placa, ano_modelo, chassi, cor)
- Faz JOIN local por `associado_id`
- Mapeia para `beneficiaries`:
  - `name` ← `nome`, `cpf` ← `cpf`, `phone` ← `telefone`
  - `active` ← `status === 'ativo'`
  - `vehicle_plate` ← `placa`, `vehicle_model` ← `marca + ' ' + modelo`
  - `vehicle_year` ← `ano_modelo`, `vehicle_chassis` ← `chassi`, `vehicle_color` ← `cor`
- Upsert em dois batches:
  - Registros com placa: `ON CONFLICT (client_id, vehicle_plate)` (usa índice `idx_beneficiaries_client_plate_unique`)
  - Registros sem placa (só CPF): `ON CONFLICT (cpf, client_id)` (usa índice `idx_beneficiaries_cpf_client`)
- Grava log em `erp_sync_logs` usando service_role (padrão existente)
- CORS headers padrão, `verify_jwt = false` (igual às demais)

### 3. Adicionar bloco condicional na `erp-integration/index.ts` (aditivo)

**No bloco `auto_sync` (linha ~228-241)**: Dentro do `for (const client of clients)`, após o `else` do standard (linha 236), adicionar:

```
} else if (client.api_type === 'gia') {
  // GIA não precisa de api_endpoint/api_key — credenciais nos secrets
  const giaRes = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/gia-sync`,
    { method: "POST", headers: {...}, body: JSON.stringify({ client_id: client.id, tenant_id: client.tenant_id }) }
  );
  const giaResult = await giaRes.json();
  results.push({ client: client.name, mode: "gia", ...giaResult });
}
```

**No bloco de sync manual (linha ~283)**: Antes da validação de `api_endpoint/api_key`, adicionar early return para GIA que redireciona para `gia-sync` sem exigir endpoint/api_key.

**Na linha 229**: Ajustar o `continue` para não pular clientes GIA (que não têm api_endpoint/api_key).

### 4. Adicionar "GIA" no frontend (`ClientForm.tsx`)

No RadioGroup de "Tipo de API" (linha ~316-329), adicionar terceira opção:

```
<RadioGroupItem value="gia" id="api_gia" />
<Label>GIA (Supabase)</Label>
```

Quando `api_type === 'gia'`, esconder os campos de endpoint/api_key e mostrar texto: "Sincroniza diretamente com o banco GIA. Credenciais configuradas no servidor."

### 5. Configurar `supabase/config.toml`

Adicionar:
```toml
[functions.gia-sync]
verify_jwt = false
```

---

## Arquivos

| Arquivo | Ação |
|---|---|
| `supabase/functions/gia-sync/index.ts` | **Novo** |
| `supabase/functions/erp-integration/index.ts` | Adição de blocos condicionais (sem remover nada) |
| `src/pages/business/ClientForm.tsx` | Adicionar opção "GIA" no RadioGroup |
| `supabase/config.toml` | Adicionar `[functions.gia-sync]` |

