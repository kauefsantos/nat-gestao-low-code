begin;

-- save_product_v2 is only a composition primitive used by apply_nat_transition.
-- It does not need to be part of the browser-callable API surface.
revoke execute on function public.save_product_v2(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text)
from public,anon,authenticated;

grant execute on function public.save_product_v2(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text)
to service_role;

commit;
