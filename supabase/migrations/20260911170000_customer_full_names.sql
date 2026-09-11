begin;

-- Corrige os nomes completos dos clientes reais do primeiro dia sem alterar seus UUIDs.
update public.customers set name='Maria Carolina', updated_at=now() where name='Maria';
update public.customers set name='Emanuele Anchieta', updated_at=now() where name='Manu';
update public.customers set name='Guilherme Pedrosa', updated_at=now() where name='Pedrosa';

commit;
