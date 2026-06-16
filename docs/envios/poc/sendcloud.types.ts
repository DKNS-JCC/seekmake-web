// Tipos del PoC de envíos (Sendcloud).
// Compartidos entre la Edge Function y el cliente web.

/** Lo que la web envía a la function `envios-cotizar`. */
export type CotizarRequest = {
  /** Peso en gramos (viene de quotes.metricas.peso_g). */
  peso_g: number;
  /** Código postal de destino. */
  cp_destino: string;
  /** ISO 3166-1 alpha-2. Por defecto 'ES'. */
  pais?: string;
};

/** Una opción de envío normalizada que devuelve la function. */
export type OpcionEnvio = {
  /** id interno del shipping method en Sendcloud. */
  metodo_id: number;
  /** Nombre legible: "Correos 48h", "SEUR 24h"... */
  nombre: string;
  carrier: string;
  /** Precio en EUR. `null` si Sendcloud no puede tarifar (carrier por zonas). */
  precio: number | null;
  /** Si precio es null, de dónde sacar la tarifa: 'tabla_propia' | 'contrato'. */
  fuente_precio: 'sendcloud' | 'tabla_propia' | 'contrato' | 'desconocida';
  min_peso_g: number;
  max_peso_g: number;
};

export type CotizarResponse = {
  ok: boolean;
  opciones: OpcionEnvio[];
  /** Aviso si aplica el caveat de carriers por zona de CP. */
  aviso?: string;
};

// --- Subconjunto de la respuesta cruda de Sendcloud /shipping_methods ---
// https://panel.sendcloud.sc/api/v2/shipping_methods
export type SendcloudCountryPrice = {
  id: number;
  iso_2: string;       // país destino
  iso_3: string;
  price: string;       // EUR como string, p.ej. "4.50"
};

export type SendcloudShippingMethod = {
  id: number;
  name: string;
  carrier: string;
  min_weight: string;  // kg como string
  max_weight: string;  // kg como string
  countries: SendcloudCountryPrice[];
};

export type SendcloudMethodsResponse = {
  shipping_methods: SendcloudShippingMethod[];
};
