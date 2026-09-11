-- Remove only the legacy product RPC overload superseded by the portfolio-aware version.
begin;

-- The active save_supply signature remains in use by the frontend and is intentionally kept.
-- Remove only the old product mutation without portfolio_key.
drop function if exists public.save_product(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,jsonb);

commit;
