-- Lightweight static regression for privacy-related customer notes constraints.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);
select like(pg_get_functiondef('public.save_customer(uuid,uuid,text,text,text,text,boolean,text,boolean)'::regprocedure),'%500 caracteres%','save_customer enforces 500-char notes limit');
select like(pg_get_functiondef('public.save_customer(uuid,uuid,text,text,text,text,boolean,text,boolean)'::regprocedure),'%CPF/CNPJ%','save_customer rejects CPF/CNPJ in notes');
select * from finish();
rollback;