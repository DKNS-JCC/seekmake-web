# Despliegue — Justificantes de pago + Seguimiento de envíos

Implementación del plan en `docs/PLAN-justificantes-y-tracking.md`.
Todo el código está escrito y probado en local; queda aplicarlo en producción.

---

## 1. Antes de nada

```bash
npm install          # añade pdf-lib, qrcode-generator y pg (devDependencies)
npm run test:todo    # 5 suites, ~100 comprobaciones — deben pasar todas
```

`test:db` y `test:recibo`/`test:funcion` necesitan herramientas extra:

```bash
pip install pgserver        # PostgreSQL efímero para las pruebas de migraciones
curl -fsSL https://deno.land/install.sh | sh   # Deno, para las pruebas de la Edge Function
```

Si no las tienes, `npm run test`, `npm run test:db` y `npm run test:ui` funcionan
igual y ya cubren la base de datos y la interfaz.

---

## 2. Migraciones

```bash
node scripts/apply-migration.mjs supabase/migrations/0022_recibos.sql
node scripts/apply-migration.mjs supabase/migrations/0023_envios_publico.sql
```

**0022** crea `recibos`, la secuencia `R-AAAA-NNNN`, el bucket **privado**
`recibos` y las RPC `verificar_recibo` / `get_recibos_cliente`.
**0023** amplía `envios` (punto de recogida, fechas por estado, alta manual,
estado `disponible`) y publica `get_envio_status`.

Ambas son aditivas: no borran nada ni cambian el comportamiento de lo que ya
funciona. `0023` sí reemplaza el `check` de `envios.estado` para añadir
`disponible` — los estados anteriores siguen siendo válidos.

Comprobación rápida tras aplicarlas:

```sql
select id, public from storage.buckets where id = 'recibos';   -- public debe ser FALSE
select public.next_recibo_codigo();                            -- R-2026-0001
```

> Si `public` sale `true`, **para y arréglalo**: los justificantes llevan nombre
> del cliente e importe, y un bucket público los deja al alcance de cualquiera.

---

## 3. Edge Function

```bash
supabase functions deploy recibo-emitir
```

No hace falta ningún secret nuevo: reutiliza `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, `CONTACT_RECIPIENT` y `ALLOWED_ORIGIN`, que ya están
configurados para `notify-quote` y `send-contact-email`.

La función importa `../_shared/recibo/*`, así que el despliegue tiene que
hacerse desde la raíz del repo para que el CLI empaquete esa carpeta.

---

## 4. Front

```bash
npm run build        # export estático
```

y sube `out/` como siempre. Páginas nuevas: `/recibo/` (verificación por QR).

---

## 5. Prueba de humo en producción

1. `/admin/presupuestos` → abre un pedido → **Emitir justificante** con 0,01 €
   y "enviar por email" desmarcado.
2. Comprueba que el PDF se descarga y que el QR lleva a `/recibo/` con el
   sello verde.
3. **Anula** ese justificante y vuelve a escanear el QR: debe decir "anulado".
4. Repite con el email marcado, a tu propia dirección, y comprueba el adjunto.
5. En un pedido con `entrega = 'envio'`: pestaña **Manual**, pega un tracking
   y abre `/presupuesto?codigo=Q-…` en una ventana de incógnito.

---

## 6. Cómo se usa

### Emitir un justificante

Panel de un pedido → **Justificantes de pago** → *Emitir justificante*. El
formulario viene precargado con lo que falta por cobrar; solo se suele tocar la
forma de pago.

Tres cosas que conviene tener claras:

- **Un justificante = un cobro.** Si hay adelanto y resto, son dos.
- **No se edita.** Se anula y se emite otro. El PDF anulado se conserva y su QR
  pasa a avisar de la anulación.
- **La emisión no es automática al marcar "pagado"**, y es a propósito: un
  documento erróneo ya enviado al cliente no se puede deshacer.

Si aparece el aviso naranja de **descuadre**, la suma de los justificantes no
coincide con el importe cobrado del pedido. Suele ser un cobro registrado desde
la Calculadora sin justificante, o al revés. No se corrige solo: los recibos
nunca escriben en `quotes`, porque ese campo lo sobrescribe el trigger de la
Calculadora (`project_order_to_quote`).

### Registrar un envío a mano

Panel de un pedido con envío → pestaña **Manual** → transportista, número de
seguimiento y, si va a un locker, el punto de recogida. En cuanto guardas, el
cliente lo ve en `/presupuesto` con su código.

Después, los botones **Etiqueta creada → En tránsito → En el punto →
Entregado** avanzan el estado *y* sellan la fecha que aparece en la línea de
tiempo del cliente. Una fecha ya sellada no se reescribe si vuelves atrás.

Sobre el enlace de seguimiento: si el envío se creó con etiqueta de Sendcloud,
la `tracking_url` abre directamente en el estado del paquete. En un alta manual
se enlaza a la página del transportista, y con InPost la interfaz avisa de que
además pedirá el código postal — su buscador no funciona solo con el número.

---

## 7. Qué NO está hecho

Decisiones conscientes, no olvidos:

- **Aviso automático al cliente cuando el envío sale.** `notify-quote` no tiene
  todavía plantilla de "tu pedido va en camino" con el tracking. Es la mejora
  más rentable que queda: una plantilla más y un botón en el panel.
- **Webhook de Sendcloud.** El estado se pone a mano, como pediste. El modelo de
  datos de `0023` es exactamente el que rellenaría un webhook, así que
  automatizarlo más adelante son ~150 líneas y ninguna migración.
- **Facturas.** Esto emite recibos, no facturas. El esquema admite añadir un
  `tipo` y una serie aparte cuando haga falta.

---

## 8. Ficheros

**Nuevos**

```
supabase/migrations/0022_recibos.sql
supabase/migrations/0023_envios_publico.sql
supabase/functions/recibo-emitir/index.ts
supabase/functions/_shared/recibo/{template,types,assets,qr}.ts
lib/recibo/{types,descargar}.ts
lib/envio/carriers.ts
app/admin/_components/ReciboPanel.tsx
app/(site)/presupuesto/{EnvioCard,RecibosCard}.tsx
app/(site)/recibo/{page.tsx,ReciboVerify.tsx,recibo.css}
scripts/test-{recibo,recibo-emitir}.ts
scripts/test-{migraciones,ui}.mjs
scripts/{stub-supabase,stub-supabase-bridge,stub-denomailer}.ts
scripts/deno-test.json
```

**Modificados**

```
lib/types.ts                                   Recibo, Envio ampliado, EnvioPublico, RPC nuevas
app/admin/_components/EnvioPanel.tsx           pestaña Manual + control de estado
app/admin/presupuestos/page.tsx                monta ReciboPanel
app/(site)/presupuesto/PresupuestoClient.tsx   tarjeta de envío + justificantes
app/(site)/presupuesto/presupuesto.css         estilos de ambos bloques
package.json                                   dependencias y scripts de prueba
```

---

## 9. Las pruebas

| Comando | Qué cubre |
|---|---|
| `npm run test:db` | Levanta un Postgres efímero, aplica **las 23 migraciones** y ejercita las RPC nuevas: tokens, RLS, fugas de datos personales, cascadas, constraints. 24 comprobaciones. |
| `npm run test:ui` | Empaqueta los componentes con esbuild y los renderiza: envío sin punto de recogida, fechas inválidas, carrier desconocido, enlaces `javascript:`. 14 comprobaciones. |
| `npm run test:recibo` | Genera 5 PDFs reales y verifica que son **deterministas** (dos emisiones = bytes idénticos), que aguantan emojis y acentos, y que los desbordes no rompen la maqueta. Deja los PDFs en `/tmp/recibos` para mirarlos. |
| `npm run test:funcion` | Ejecuta la Edge Function entera contra un Supabase y un SMTP falsos: autorización, validación, antiduplicado, rollback si falla el archivado, adjuntos, CORS. 26 comprobaciones. |
| `npm run test:todo` | Todas las anteriores más las que ya había. |

El determinismo del PDF es la comprobación menos obvia y la más importante: si
se rompe, el fichero archivado deja de coincidir con el que descarga el cliente,
y entonces el archivo no prueba nada.
