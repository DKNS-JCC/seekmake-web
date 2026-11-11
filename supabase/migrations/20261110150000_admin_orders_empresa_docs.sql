-- ============================================================================
-- Fase 0 del plan «Calculadora dentro de la web»: el admin de la web (claim
-- is_admin) lee y escribe `orders` y `empresa_docs`, que hasta ahora solo
-- abría el login de la Calculadora vía empresa_users.
--
-- Solo se AÑADE: las políticas "own all" / "partner read" de 0016 y la tabla
-- empresa_users no se tocan, así que la Calculadora 7.2 sigue igual.
-- ============================================================================

drop policy if exists "orders: admin all" on public.orders;
create policy "orders: admin all" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "empresa_docs: admin all" on public.empresa_docs;
create policy "empresa_docs: admin all" on public.empresa_docs
  for all using (public.is_admin()) with check (public.is_admin());
