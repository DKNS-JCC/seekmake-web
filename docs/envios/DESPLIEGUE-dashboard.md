# Envíos desde el panel admin — despliegue

Botón **"Generar envío"** dentro de cada presupuesto con entrega = envío
(`/admin/presupuestos`). Cotiza, deja elegir método y genera la etiqueta (PDF)
sin exponer el secreto: todo pasa por la Edge Function `envios-etiqueta`.

## Piezas

| Pieza | Archivo |
|---|---|
| Tabla `envios` | `supabase/migrations/0015_envios.sql` |
| Edge Function | `supabase/functions/envios-etiqueta/index.ts` |
| Panel UI | `app/admin/_components/EnvioPanel.tsx` (integrado en presupuestos) |
| Tipo `Envio` | `lib/types.ts` |

## Pasos (una vez)

### 1. Aplicar la migración
En *Supabase → SQL Editor*, ejecuta `supabase/migrations/0015_envios.sql`
(o `supabase db push` si usas migraciones).

### 2. Secrets de Sendcloud
```bash
supabase secrets set \
  SENDCLOUD_PUBLIC_KEY=ba1228ea-81ad-45be-be71-a1990fae5f6a \
  SENDCLOUD_SECRET_KEY=<TU_SECRETO_REGENERADO>
```
`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya existen
(los usa notify-quote).

> ⚠ Regenera el secreto en Sendcloud antes de esto: el anterior se compartió en
> texto plano.

### 3. Desplegar la función
```bash
supabase functions deploy envios-etiqueta
```

### 4. En Sendcloud (panel web)
- **Settings → Carriers & contracts**: activa Correos/SEUR/GLS… (sin esto no
  hay métodos ni tarifas).
- **Settings → Addresses**: configura tu dirección de remitente (origen).

## Uso

1. Entra en **/admin/presupuestos** y abre un presupuesto con **envío**.
2. En el bloque **📦 Generar envío**: revisa/corrige los datos del destinatario
   (vienen pre-rellenos) y el **peso en gramos**.
3. **Ver tarifas** → elige método en el desplegable (muestra el precio).
4. **Crear etiqueta** → se crea el envío, se descarga el **PDF** y se guarda el
   **tracking** en la tabla `envios` (visible la próxima vez que abras el quote).

## Notas

- Solo funciona para usuarios admin (`app_metadata.is_admin = true`), igual que
  el resto del panel.
- Crear la etiqueta **anuncia el envío y se factura** en tu cuenta Sendcloud.
  No hay paso de confirmación extra en el panel (sí lo hay en el CLI), así que
  pulsa "Crear etiqueta" solo cuando vayas a enviar de verdad.
- CORS: la función acepta `localhost` y `https://www.impresion3dcc.com`. Si tu
  dominio cambia, añade el secret `ALLOWED_ORIGIN` (lista separada por comas).
- El `.env.local` con las claves es solo para el CLI local
  (`scripts/sendcloud.ts`); la función NO lo usa, lee los secrets de Supabase.

---

## Nota sobre precios (API v3)

Las tarifas de Correos dependen de la **zona del CP de destino**, por eso el
panel cotiza con la API **v3** (`fetch-shipping-options`) usando el CP del
presupuesto. Por eso el campo **CP** debe estar relleno antes de pulsar
"Ver tarifas". Métodos marcados "(sin etiqueta)" se pueden cotizar pero no
generar etiqueta desde aquí (Sendcloud no expone un id v2 para ellos); elige
uno con precio e id, p. ej. *Correos Paq Ligero* o *Correos Estándar*.
