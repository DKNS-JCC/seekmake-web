-- ============================================================================
-- quote_events: nuevo evento 'precio_visto'.
--
-- 'pieza_anadida' salta al subir el archivo, antes de laminar. Quien se iba
-- durante el cálculo contaba como "vio el precio y se asustó". El tasador
-- manda 'precio_visto' (una vez por sesión) cuando el precio aparece, y
-- /admin/estadisticas mide el abandono desde ahí.
-- ============================================================================

alter table public.quote_events drop constraint if exists quote_events_evento_check;
alter table public.quote_events add constraint quote_events_evento_check
  check (evento in (
    'pieza_anadida', 'precio_visto', 'solicitud_enviada', 'pdf_descargado',
    'aceptado'
  ));
