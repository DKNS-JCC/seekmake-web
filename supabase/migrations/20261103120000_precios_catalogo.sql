-- ============================================================================
-- Catálogo alineado con las páginas de servicios y Navidad.
--
-- Por legacy_id (el número del slug). precio = 0 se muestra como "Consultar" (catalogo/[slug]/page.tsx).
--   4  Litofanía personalizada     14 € → 10 € (servicios: "Desde 10 €")
--   20 Llavero con nombre           4 € → a consultar
--   50 Llaveros corporativos      2,50 € → a consultar
-- ============================================================================

update public.productos set precio = 10 where legacy_id = 4;
update public.productos set precio = 0  where legacy_id in (20, 50);
