-- Função auxiliar de normalização inline via CTE não dá; vamos materializar em temp table
CREATE TEMP TABLE _norm AS
SELECT id, tenant_id, user_id, created_at, name,
  TRIM(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(translate(COALESCE(name,''),'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),'\(.*?\)','','g'),'(parceiro|prestador|sr\.|sra\.|ltda|me|eireli)','','gi')) as norm_name
FROM public.providers;

-- Eleger principal: o que tem user_id vence; em empate, o mais antigo
CREATE TEMP TABLE _winners AS
SELECT DISTINCT ON (tenant_id, norm_name)
  id as winner_id, tenant_id, norm_name
FROM _norm
WHERE LENGTH(TRIM(norm_name)) >= 4
ORDER BY tenant_id, norm_name, (user_id IS NOT NULL) DESC, created_at ASC;

-- Mapeamento perdedor -> vencedor
CREATE TEMP TABLE _remap AS
SELECT n.id as loser_id, w.winner_id
FROM _norm n
JOIN _winners w ON w.tenant_id IS NOT DISTINCT FROM n.tenant_id AND w.norm_name = n.norm_name
WHERE n.id <> w.winner_id;

-- Migrar dependências
UPDATE public.dispatches d SET provider_id = r.winner_id
FROM _remap r WHERE d.provider_id = r.loser_id;

UPDATE public.provider_invoices pi SET provider_id = r.winner_id
FROM _remap r WHERE pi.provider_id = r.loser_id;

UPDATE public.financial_closings fc SET provider_id = r.winner_id
FROM _remap r WHERE fc.provider_id = r.loser_id;

UPDATE public.provider_blacklist pb SET provider_id = r.winner_id
FROM _remap r WHERE pb.provider_id = r.loser_id;

-- Se o vencedor não tem user_id mas o perdedor tem, herdar
UPDATE public.providers p
SET user_id = (SELECT pl.user_id FROM public.providers pl 
               JOIN _remap r ON r.loser_id = pl.id 
               WHERE r.winner_id = p.id AND pl.user_id IS NOT NULL LIMIT 1),
    updated_at = now()
WHERE p.id IN (SELECT winner_id FROM _remap) AND p.user_id IS NULL
  AND EXISTS (SELECT 1 FROM public.providers pl JOIN _remap r ON r.loser_id=pl.id WHERE r.winner_id=p.id AND pl.user_id IS NOT NULL);

-- Deletar duplicatas
DELETE FROM public.providers WHERE id IN (SELECT loser_id FROM _remap);

-- Após consolidação, tentar vincular usuários ainda sem provider (1↔1 por nome)
WITH norm2 AS (
  SELECT id,
    TRIM(REGEXP_REPLACE(REGEXP_REPLACE(LOWER(translate(COALESCE(name,''),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')),'\(.*?\)','','g'),'(parceiro|prestador)','','gi')) as nn
  FROM public.providers WHERE user_id IS NULL
),
uu AS (
  SELECT u.id as uid,
    SPLIT_PART(LOWER(translate(COALESCE(u.raw_user_meta_data->>'full_name',''),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')),' ',1) as fw,
    LOWER(translate(COALESCE(u.raw_user_meta_data->>'full_name',''),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')) as full_norm
  FROM auth.users u
  JOIN public.user_roles ur ON ur.user_id=u.id AND ur.role='provider'
  WHERE NOT EXISTS (SELECT 1 FROM public.providers p WHERE p.user_id=u.id)
),
m AS (
  SELECT uu.uid, n.id as pid
  FROM uu JOIN norm2 n ON LENGTH(uu.fw)>=4 AND (
    n.nn ILIKE uu.fw || ' %' OR n.nn ILIKE '% '||uu.fw OR n.nn ILIKE '% '||uu.fw||' %' OR n.nn = uu.fw
    OR n.nn ILIKE '%'||TRIM(uu.full_norm)||'%' OR uu.full_norm ILIKE '%'||TRIM(n.nn)||'%'
  )
),
c1 AS (SELECT uid, COUNT(*) c FROM m GROUP BY uid),
c2 AS (SELECT pid, COUNT(*) c FROM m GROUP BY pid),
safe AS (
  SELECT m.uid, m.pid FROM m JOIN c1 ON c1.uid=m.uid AND c1.c=1 JOIN c2 ON c2.pid=m.pid AND c2.c=1
)
UPDATE public.providers p SET user_id = s.uid, updated_at = now()
FROM safe s WHERE p.id = s.pid AND p.user_id IS NULL;

DROP TABLE _norm;
DROP TABLE _winners;
DROP TABLE _remap;