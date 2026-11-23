-- Un solo pedido mínimo para el tasador y la Calculadora (y «Nuevo encargo»).
-- Antes había dos cifras (quote_settings.precio_minimo = 7 € y
-- global_config.precio_minimo de la Calculadora = 3 €) y el mismo pedido salía
-- distinto según dónde se calculase.
--
-- Manda la de la Calculadora (empresa_docs 3dcc/config, «Costes del taller»):
-- cualquier escritura en quote_settings se lleva esa cifra, así que guardar
-- las tarifas con una copia vieja tampoco la pisa. Al guardar la config de la
-- Calculadora, aplicar_costes_calculadora() (0024) reescribe quote_settings y
-- este trigger copia el mínimo.

create or replace function public.minimo_de_calculadora()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v numeric;
begin
  select public.jsonb_num(data -> 'global_config' -> 'precio_minimo') into v
    from public.empresa_docs
   where empresa = '3dcc' and doc = 'config';
  if v is not null and v > 0 then
    new.config := jsonb_set(coalesce(new.config, '{}'::jsonb), '{precio_minimo}', to_jsonb(v));
  end if;
  return new;
end;
$$;

drop trigger if exists minimo_de_calculadora on public.quote_settings;
create trigger minimo_de_calculadora
  before insert or update of config on public.quote_settings
  for each row execute function public.minimo_de_calculadora();

-- 5,80 € en todo. Si aún no hay config de la Calculadora, al menos el tasador.
update public.empresa_docs
   set data = jsonb_set(data, '{global_config}',
                        coalesce(data -> 'global_config', '{}'::jsonb) || '{"precio_minimo": 5.8}'::jsonb)
 where empresa = '3dcc' and doc = 'config';

update public.quote_settings
   set config = jsonb_set(config, '{precio_minimo}', '5.8'::jsonb)
 where id = 1
   and not exists (select 1 from public.empresa_docs where empresa = '3dcc' and doc = 'config');
