#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────
# 3DCC Supabase Keep-Alive
# ─────────────────────────────────────────────────────────────────────────
# Hace un SELECT trivial contra Supabase para que el proyecto free no se
# pause por inactividad (la free tier los pausa tras ~7 días sin uso).
#
# Pensado para correr en una Raspberry Pi 3B+ encendida 24/7 vía cron.
#
# ─── Instalación ─────────────────────────────────────────────────────────
#
# 1. Copia este archivo a la Raspi:
#      scp keepalive.sh pi@<ip>:/home/pi/3dcc-keepalive.sh
#
# 2. Dale permisos de ejecución:
#      chmod +x /home/pi/3dcc-keepalive.sh
#
# 3. Edita las dos variables de abajo (SUPABASE_URL y SUPABASE_ANON_KEY).
#    La anon key es PÚBLICA — la usa el navegador, no es un secreto. Está
#    en https://supabase.com/dashboard → Project Settings → API.
#
# 4. Probar a mano:
#      /home/pi/3dcc-keepalive.sh
#    Debe mostrar "OK" y registrar en /home/pi/3dcc-keepalive.log
#
# 5. Añadir al crontab del usuario pi:
#      crontab -e
#
#    Y pegar (cada 3 días a las 04:17 — hora baja, evita el cambio horario):
#
#      17 4 */3 * * /home/pi/3dcc-keepalive.sh >> /home/pi/3dcc-keepalive.log 2>&1
#
#    Verificación: crontab -l
#
# ─── Variables a editar ──────────────────────────────────────────────────

SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_ANON_KEY="REEMPLAZA_CON_TU_ANON_KEY"

# Tabla pequeña y siempre presente que vamos a sondear.
# 'productos' funciona; si la renombras alguna vez, cambia esto.
TABLE="productos"

# ─── Lógica ──────────────────────────────────────────────────────────────

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %Z')

if [ -z "$SUPABASE_ANON_KEY" ] || [ "$SUPABASE_ANON_KEY" = "REEMPLAZA_CON_TU_ANON_KEY" ]; then
  echo "[$TIMESTAMP] ERROR: edita SUPABASE_URL y SUPABASE_ANON_KEY en el script."
  exit 1
fi

HTTP_CODE=$(curl -s -o /tmp/3dcc-keepalive-resp -w "%{http_code}" \
  --max-time 30 \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/$TABLE?select=id&limit=1")

if [ "$HTTP_CODE" = "200" ]; then
  echo "[$TIMESTAMP] OK ($HTTP_CODE) — Supabase awake."
  exit 0
else
  RESP=$(cat /tmp/3dcc-keepalive-resp 2>/dev/null | head -c 300)
  echo "[$TIMESTAMP] FAIL ($HTTP_CODE) — $RESP"
  exit 2
fi
