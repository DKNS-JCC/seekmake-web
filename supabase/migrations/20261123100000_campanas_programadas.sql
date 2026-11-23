-- Campañas programadas: el admin elige día y hora, y el workflow
-- campanas-programadas.yml llama cada 10 min a campana-enviar, que manda las
-- que ya tocan. Programada = programada_at no nulo y estado distinto de
-- 'enviada'; sin columna de estado nueva.
alter table public.campanas add column if not exists programada_at timestamptz;
