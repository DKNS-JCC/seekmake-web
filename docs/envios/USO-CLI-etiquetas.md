# CLI de etiquetas (Sendcloud) — uso admin

Integración mínima, **solo local**, para generar etiquetas cuando haga falta.
La clave secreta vive en `.env.local` (ignorado por git). Nada se publica ni
se expone en el navegador.

## ⚠ Seguridad (hazlo ya)

La clave secreta se compartió en texto plano. Entra en **Sendcloud → Settings →
Integrations → API**, **regenera** el secreto y pégalo en `.env.local`
(`SENDCLOUD_SECRET_KEY`). El público puede quedarse.

## Requisito previo: activar carriers

Verificado: las claves funcionan, pero tu cuenta **solo tiene el método de
prueba** (precio 0). Para tarifas reales de Correos/SEUR/GLS/etc.:
**Sendcloud → Settings → Carriers & contracts → activar** los que quieras.
También configura tu **dirección de remitente** (Settings → Addresses); el CLI
usa la dirección por defecto de la cuenta como origen.

## Comandos

```bash
# 1) Ver métodos disponibles y tarifas (España → España)
npm run envio -- methods

#    a otro país:
npm run envio -- methods --to FR

# 2) Cotizar un peso concreto (kg)
npm run envio -- quote --weight 0.25
npm run envio -- quote --weight 0.5 --to FR

# 3) Generar etiqueta
#    a) copia la plantilla y rellena los datos del cliente
cp scripts/envio.ejemplo.json pedido.json
#    b) DRY-RUN: muestra lo que se enviaría, NO crea nada ni gasta
npm run envio -- label --order pedido.json --method <ID>
#    c) crear de verdad: añade --confirm
npm run envio -- label --order pedido.json --method <ID> --confirm
```

El `<ID>` del método sale de `npm run envio -- methods`.
Con `--confirm`, el script crea el envío, imprime el **tracking** y descarga el
**PDF de la etiqueta** a `./etiquetas/<tracking>.pdf`.

## Notas

- **Sin `--confirm` no se gasta nada** — es dry-run por defecto. Crear la
  etiqueta (`--confirm`) sí anuncia el envío y se factura en tu cuenta Sendcloud.
- `weight` en kg (p.ej. `0.25`). Lo tienes en `quotes.metricas.peso_g` (÷1000).
- `etiquetas/` conviene añadirlo a `.gitignore` si no quieres versionar PDFs.
- Esto es deliberadamente un script local: para 0–5 envíos/mes no compensa
  desplegar Edge Functions ni exponer nada en la web.

## Encaje fiscal (recordatorio)

Generar la etiqueta es solo logística. La parte fiscal (declarar ingresos,
alta censal si emites facturas, IVA) sigue siendo tuya y de tu gestor; este
script no cambia nada de eso.

---

## Actualización: tarifas reales (API v3)

Las tarifas de Correos son **por zona de código postal**, así que el comando
`quote` usa la API v3 y necesita el **CP de destino**:

```bash
npm run envio -- quote --weight 0.25 --cp 28001
```

Devuelve el precio real por método y el **id** que se pasa a `label --method`.
`methods` solo lista el catálogo (sin precio). La "Unstamped letter" (0 €) se
oculta del cotizador.
