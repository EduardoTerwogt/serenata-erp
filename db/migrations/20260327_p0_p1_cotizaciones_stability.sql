alter table public.cuentas_pagar
  add column if not exists item_id text;

update public.cuentas_pagar cp
set item_id = i.id
from public.items_cotizacion i
where cp.item_id is null
  and cp.cotizacion_id = i.cotizacion_id
  and cp.item_descripcion = i.descripcion;

with ranked_cuentas_pagar as (
  select ctid,
         row_number() over (
           partition by cotizacion_id, item_id
           order by created_at desc nulls last, id desc
         ) as rn
  from public.cuentas_pagar
  where item_id is not null
)
delete from public.cuentas_pagar cp
using ranked_cuentas_pagar r
where cp.ctid = r.ctid
  and r.rn > 1;

with ranked_cuentas_cobrar as (
  select ctid,
         row_number() over (
           partition by cotizacion_id
           order by created_at desc nulls last, id desc
         ) as rn
  from public.cuentas_cobrar
)
delete from public.cuentas_cobrar cc
using ranked_cuentas_cobrar r
where cc.ctid = r.ctid
  and r.rn > 1;

create index if not exists idx_cuentas_pagar_item_id
  on public.cuentas_pagar (item_id);

create unique index if not exists cuentas_pagar_cotizacion_item_unique
  on public.cuentas_pagar (cotizacion_id, item_id)
  where item_id is not null;

create unique index if not exists cuentas_cobrar_cotizacion_unique
  on public.cuentas_cobrar (cotizacion_id);
