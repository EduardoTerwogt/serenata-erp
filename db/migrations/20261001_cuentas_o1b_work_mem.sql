-- Rediseño de Cuentas, O1b (docs/PLAN.md): la lectura por año de
-- cuentas_por_proyecto(p_year) ordena y agrega ~11,000 grupos y ~13,000
-- conceptos. Con el work_mem por defecto de Supabase (~2 MB) el sort final
-- de grupos y los CTE materializados se iban a disco ("external merge",
-- temp written) y la función tardaba ~330 ms en la BD. 8 MB basta para que
-- todo quede en memoria (medido en serenata-erp-test con el dataset de
-- carga). Es por función: no cambia el work_mem de ninguna otra consulta.

ALTER FUNCTION public.cuentas_por_proyecto(integer) SET work_mem = '8MB';
