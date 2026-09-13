begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select ok(
  position('FOR UPDATE' in upper(pg_get_functiondef('private.assert_nat_version(text,uuid,uuid,text)'::regprocedure)))>0,
  'version assertion locks existing mutable rows before comparing updated_at'
);

select ok(
  not has_function_privilege('authenticated','private.assert_nat_version(text,uuid,uuid,text)','execute'),
  'version-lock helper remains private'
);

select * from finish();
rollback;
