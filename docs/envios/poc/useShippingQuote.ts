// PoC — hook React para cotizar envío desde la web (static export).
// Llama a la Edge Function `envios-cotizar`. No usa el secret de Sendcloud.

import { useCallback, useState } from "react";
import type {
  CotizarRequest,
  CotizarResponse,
  OpcionEnvio,
} from "./sendcloud.types";

// Usa la misma URL base de Supabase que ya tienes en NEXT_PUBLIC_SUPABASE_URL.
const FN_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/envios-cotizar`;

type Estado = "idle" | "cargando" | "ok" | "error";

export function useShippingQuote() {
  const [estado, setEstado] = useState<Estado>("idle");
  const [opciones, setOpciones] = useState<OpcionEnvio[]>([]);
  const [aviso, setAviso] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const cotizar = useCallback(async (req: CotizarRequest) => {
    setEstado("cargando");
    setError(undefined);
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // anon key pública de Supabase (no es secreta)
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(req),
      });
      const data: CotizarResponse = await res.json();
      if (!data.ok) throw new Error("cotizacion_fallida");
      setOpciones(data.opciones);
      setAviso(data.aviso);
      setEstado("ok");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
      setEstado("error");
      return null;
    }
  }, []);

  return { estado, opciones, aviso, error, cotizar };
}

// Uso en QuoteClient / PresupuestoClient:
//
//   const { cotizar, opciones, estado } = useShippingQuote();
//   // cuando entrega === 'envio' y hay CP:
//   await cotizar({ peso_g: metricas.peso_g, cp_destino: direccion.cp });
//   // mostrar `opciones` como líneas de envío en el desglose
