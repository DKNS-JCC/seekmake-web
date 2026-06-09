# send-contact-email

Edge Function que recibe el formulario de `/contacto` y lo reenvía a tu Gmail
vía SMTP con una contraseña de aplicación. **No persiste nada** — los datos
viven únicamente en el buzón destinatario.

## Setup (5 minutos)

### 1. Generar contraseña de aplicación de Gmail

Requisito: tener **2FA activado** en la cuenta de Google.

1. Ve a https://myaccount.google.com/apppasswords
2. Si no te aparece, activa 2FA primero en https://myaccount.google.com/security
3. Nombre de la app: `3DCC Contact Form`
4. Genera. Te da una cadena de 16 caracteres tipo `abcd efgh ijkl mnop`.
5. **Cópiala ya** — no la vuelves a ver. Se usa quitando los espacios.

### 2. Desplegar la función

Desde la raíz del repo (`D:\3DCC\Web`):

```bash
supabase login                  # si no lo hiciste antes
supabase link --project-ref <tu-project-ref>
supabase functions deploy send-contact-email
```

### 3. Configurar los secrets

```bash
supabase secrets set \
  GMAIL_USER=impresion3dslmc@gmail.com \
  GMAIL_APP_PASSWORD=abcdefghijklmnop \
  CONTACT_RECIPIENT=impresion3dslmc@gmail.com \
  ALLOWED_ORIGIN=https://www.impresion3dcc.com
```

- `GMAIL_USER` — la cuenta que envía (autenticación SMTP)
- `GMAIL_APP_PASSWORD` — la contraseña de aplicación generada en el paso 1 (sin espacios)
- `CONTACT_RECIPIENT` — adonde llegan los emails (puede ser la misma que `GMAIL_USER`)
- `ALLOWED_ORIGIN` — el dominio público desde el que se llamará a la función. Si tu CNAME es `www.impresion3dcc.com`, pon `https://www.impresion3dcc.com`. Si sirves desde el apex (`impresion3dcc.com` sin www) pon ese.

### 4. Probar

Desde la consola del navegador en tu web:

```js
const { data, error } = await window.supabase.functions.invoke('send-contact-email', {
  body: {
    nombre: 'Prueba',
    email: 'test@example.com',
    tipo: 'Otro',
    mensaje: 'Mensaje de prueba'
  }
});
console.log({ data, error });
```

O simplemente envía el formulario desde `/contacto`. En 5-10 segundos
debería llegarte el email.

## Anti-spam

La función incluye tres capas:

1. **Honeypot** — campo `website` invisible en el form. Si un bot lo rellena, devolvemos OK silenciosamente sin enviar nada.
2. **Validación** — email correcto, mensaje entre 10 y 5000 caracteres.
3. **Rate limit** — máximo 5 envíos por IP por hora (en memoria, suficiente para tráfico normal).

Si recibes spam aun así, opciones:
- Añade hCaptcha (form recibe token, función lo valida con su API)
- Sube el rate limit a 2/hora

## Operativa

- **Logs**: Dashboard Supabase → Edge Functions → send-contact-email → Logs
- **Cambiar destinatario**: `supabase secrets set CONTACT_RECIPIENT=otro@gmail.com` (no requiere redeploy)
- **Cambiar la cuenta emisora**: nueva app password + `supabase secrets set GMAIL_USER=... GMAIL_APP_PASSWORD=...`

## Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| Form muestra "Server not configured" | Faltan secrets | `supabase secrets list` → asegúrate de que los 3 están |
| CORS error en consola | `ALLOWED_ORIGIN` no coincide | Pon exactamente el dominio público (con `https://`, con o sin `www`) |
| "Username and Password not accepted" en logs | App password caducada o no es de 2FA | Regenera en https://myaccount.google.com/apppasswords |
| Email no llega | Mira spam de Gmail destino | Marca como "no es spam" la primera vez |
| 429 Demasiadas solicitudes | Has agotado el rate limit | Espera 1 hora o ajusta el límite en `index.ts` |
