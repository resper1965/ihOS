# `docs/sql/` — os scripts que alguém aplica à mão

Aqui ficam scripts rodados manualmente no editor SQL do Supabase. Não são
migrações: `supabase/migrations/` tem controle próprio e roda sozinho. Estes não.

## A regra

**Aplicou um script daqui? Registre.** Uma linha em
`public.schema_manual_applications`, criada por
[`2026-09-10_APPLY_ME_manual_application_ledger.sql`](2026-09-10_APPLY_ME_manual_application_ledger.sql):

```sql
INSERT INTO public.schema_manual_applications
  (script_name, status, applied_at, recorded_by, evidence, notes)
VALUES
  ('2026-09-10_APPLY_ME_exemplo.sql', 'applied', now(), 'voce@ionic.health',
   'a consulta que você rodou e o número que ela devolveu',
   NULL);
```

A coluna `evidence` não é burocracia. Um script pode falhar no meio, ser
aplicado a um banco errado, ou já ter sido aplicado antes — e em todos esses
casos a lembrança de alguém diz "apliquei". A consulta que confirma o efeito é a
única coisa que não mente.

## Os três estados

| status | significa |
|---|---|
| `applied` | o efeito foi observado no banco, e `evidence` diz como |
| `superseded` | rodou, e um script posterior reescreveu o que ele fez |
| `unknown` | ninguém verificou — **não** quer dizer "não aplicado" |

**Ausência de linha também é `unknown`.** Um script sem registro é um script
sobre o qual não se sabe nada. Essa distinção é o motivo de a tabela existir.

## Por que isto foi criado

Em 2026-09-10, para saber se a reconciliação de `total_chunks` tinha sido
aplicada, foi preciso consultar o banco e comparar contagem a contagem. Não
havia outro jeito — nada registrava. Onze scripts `APPLY_ME` estavam nessa
situação, e o registro inicial nasceu com nove verificados e seis desconhecidos,
que é o estado honesto.

## Convenção de nome

`YYYY-MM-DD[letra]_APPLY_ME_assunto.sql` — a letra desempata dois scripts do
mesmo dia. `APPLY_ME` no nome sinaliza que exige ação humana; sem ele, o arquivo
é referência ou análise (como `analysis_flow_validation.sql`).

## O que todo script daqui deve ter

- **Cabeçalho dizendo o que estava errado**, não só o que o script faz. Quem lê
  daqui a seis meses precisa saber por quê.
- **Ser seguro de repetir** — `IF NOT EXISTS`, `ON CONFLICT`, ou um `WHERE` que
  não faz nada na segunda passada. Ninguém sabe se já rodou; é essa a premissa.
- **Uma consulta de verificação no fim**, cujo resultado vira a `evidence` do
  registro.
