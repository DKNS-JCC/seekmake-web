# PoC envíos (Sendcloud) — cómo probarlo

Prueba de concepto para validar la integración **antes** de la Fase 1.
No toca el sitio en producción: son archivos de referencia.

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `migration-envios.sql` | Tabla `envios` + RLS (patrón `is_admin()` del proyecto). |
| `envios-cotizar.ts` | Edge Function (Deno) proxy a Sendcloud `shipping_methods`. |
| `sendcloud.types.ts` | Tipos TS compartidos. |
| `useShippingQuote.ts` | Hook React para llamar a la function desde la web. |

## Requisitos

1. Cuenta Sendcloud (vale el nivel gratis para cotizar) y **par de claves API**
   en *Settings → Integrations → API*.
2. Carriers activados en el panel Sendcloud (Correos, SEUR, GLS…), si no, la
   lista de métodos viene vacía.
3. Supabase CLI instalado y logueado en tu proyecto.

## Pasos

### 1. Crear la tabla
Pega `migration-envios.sql` en *Supabase → SQL Editor* y ejecútalo.

### 2. Desplegar la función
```bash
# coloca envios-cotizar.ts en supabase/functions/envios-cotizar/index.ts
# y sendcloud.types.ts en supabase/functions/sendcloud.types.ts
supabase functions deploy envios-cotizar --no-verify-jwt
supabase secrets set SENDCLOUD_PUBLIC_KEY=xxxx SENDCLOUD_SECRET_KEY=yyyy
```

### 3. Probar con curl
```bash
curl -X POST \
  "https://<project-ref>.supabase.co/functions/v1/envios-cotizar" \
  -H "Authorization: Bearer <NEXT_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "content-type: application/json" \
  -d '{ "peso_g": 250, "cp_destino": "37001", "pais": "ES" }'
```

Respuesta esperada: lista de `opciones` con `precio` (o `aviso` si algún
carrier tarifa por zona de CP — ver PLAN, sección 5).

### 4. (Opcional) Desde la web
Copia `useShippingQuote.ts` + `sendcloud.types.ts` a `lib/envios/` y úsalo en
`QuoteClient`/`PresupuestoClient` cuando `entrega === 'envio'`.

## Qué valida este PoC

- Que las credenciales y el Basic auth funcionan.
- El formato real de la respuesta de Sendcloud.
- **Si aplica el caveat de zonas** para tus carriers → decide tabla propia vs
  contrato (PLAN, secciones 5 y 10) antes de la Fase 1.

## Lo que el PoC NO hace todavía

- Crear etiquetas (`POST /parcels`) → Fase 2.
- Webhook de tracking → Fase 3.
- Tarifa con tabla de zonas propia → Fase 1.
