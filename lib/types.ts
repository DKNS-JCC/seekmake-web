// Shared application types and the Supabase Database type.

export type Acabado =
  | 'Metálico'
  | 'Fluorescente'
  | 'Translucido'
  | 'Textura'
  | 'Brillante'
  | 'Purpurina'
  | 'Mate'
  | 'Flexible';

export type Categoria = string;

export type { MuestraTipo } from './color-preview';
import type { MuestraTipo } from './color-preview';

// `type` (not `interface`) — supabase-js v2 generics require entities to be
// assignable to Record<string, unknown>, which interfaces are not.
export type Filamento = {
  id: string;
  material: string;
  nombre: string;
  descripcion: string;
  orden: number;
};

export type Color = {
  id: string;
  filamento_id: string;
  nombre: string;
  hex: string;
  /** Extra tones for bicolor / rainbow filaments; empty when `muestra_tipo` is 'solido'. */
  muestra_colores: string[];
  muestra_tipo: MuestraTipo;
  texto: 'black' | 'white';
  acabado: Acabado | null;
  combina_con: string[];
  oferta: boolean;
  /** Temporarily out of stock: shown in the muestrario, not pickable in the tasador. */
  agotado: boolean;
  orden: number;
};

export type Trabajo = {
  id: string;
  titulo: string;
  descripcion: string;
  imagen: string;
  material: string;
  etiquetas: string[];
  destacado: boolean;
  orden: number;
  likes: number;
  dislikes: number;
  fecha_realizacion: string | null;  // YYYY-MM-DD; null = use created_at
  fecha_efectiva: string;             // computed: fecha_realizacion ?? created_at
  created_at: string;
  updated_at: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image: string;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Producto = {
  id: string;
  legacy_id: number | null;
  nombre: string;
  descripcion: string;
  precio: number;
  categoria: Categoria;
  material: string;
  colores: string[];
  dimensiones: string;
  peso: string;
  imagen: string;
  destacado: boolean;
  etiquetas: string[];
  created_at: string;
  updated_at: string;
};

// Tasador (instant quote)

export type QuoteEstado =
  | 'nuevo'
  | 'revisado'
  | 'aceptado'
  | 'imprimiendo'
  | 'listo'
  | 'entregado'
  | 'rechazado';

export type QuotePago = 'pendiente' | 'adelanto' | 'pagado';

export type QuoteEntrega = 'recogida' | 'envio';

export type QuoteArchivo = {
  nombre: string;
  url: string;
  /** Storage path inside the quote-uploads bucket (used by the cleanup job). */
  path: string;
  /** Bytes actually stored (compressed when `comprimido`). */
  tamano: number;
  tamano_original: number;
  comprimido: boolean;
  cantidad: number;
  /** Per-piece configuration (quotes created before v3 may lack these). */
  material?: string;
  colores?: QuoteColorSnapshot[];
  resistencia?: string;
  detalle?: string;
  metricas: Record<string, unknown>;
};

export type QuoteDireccion = {
  calle?: string;
  ciudad?: string;
  cp?: string;
  provincia?: string;
};

export type QuoteColorSnapshot = {
  nombre: string;
  hex: string;
  muestra_colores?: string[];
  muestra_tipo?: MuestraTipo;
  acabado: string | null;
  /** Part name the color applies to (multicolor 3MF), '' for the whole piece. */
  parte: string;
};

export type Quote = {
  id: string;
  codigo: string;
  estado: QuoteEstado;
  nombre: string;
  email: string;
  telefono: string;
  mensaje: string;
  archivos: QuoteArchivo[];
  material: string;
  colores: QuoteColorSnapshot[];
  resistencia: string;
  detalle: string;
  cantidad: number;
  entrega: QuoteEntrega;
  direccion: QuoteDireccion;
  metricas: Record<string, unknown>;
  desglose: Record<string, unknown>;
  precio_total: number;
  precio_final: number | null;
  pago: QuotePago;
  importe_pagado: number;
  archivado: boolean;
  notas_admin: string;
  /** Secret accept-link token (emailed to the customer). */
  acepta_token?: string;
  aceptado_at: string | null;
  valido_hasta: string;
  /** SHA-256 of the requester IP — rate limiting only. */
  ip_hash?: string;
  created_at: string;
  updated_at: string;
};

export type QuoteEventoTipo =
  | 'pieza_anadida'
  | 'solicitud_enviada'
  | 'pdf_descargado'
  | 'aceptado';

export type QuoteEvento = {
  id: number;
  session_id: string;
  evento: QuoteEventoTipo;
  payload: Record<string, unknown>;
  created_at: string;
};

export type QuoteSettingsRow = {
  id: number;
  config: Record<string, unknown>;
  updated_at: string;
};

export type EnvioEstado =
  | 'pendiente'
  | 'etiqueta'
  | 'en_transito'
  /** Ya está en el punto de recogida (locker InPost, tienda), esperando al cliente. */
  | 'disponible'
  | 'entregado'
  | 'incidencia'
  | 'cancelado';

/** Punto de recogida. jsonb libre: un locker, una oficina y un domicilio no
 *  tienen la misma forma y esto solo se muestra, nunca se consulta por campos. */
export type PuntoRecogida = {
  nombre?: string;
  direccion?: string;
  ciudad?: string;
  cp?: string;
  horario?: string;
  codigo_apertura?: string;
  /** Fecha límite para recogerlo, texto libre ("hasta el viernes 22"). */
  hasta?: string;
};

export type Envio = {
  id: string;
  quote_id: string | null;
  proveedor: string;
  sendcloud_id: number | null;
  metodo: string | null;
  carrier: string | null;
  /** Nombre presentable ("InPost"); `carrier` guarda el código de Sendcloud. */
  carrier_nombre: string | null;
  cp_destino: string | null;
  pais: string;
  peso_g: number | null;
  coste: number | null;
  coste_carrier: number | null;
  tracking_number: string | null;
  tracking_url: string | null;
  estado: EnvioEstado;
  estado_carrier: string | null;
  punto_recogida: PuntoRecogida;
  /** Marcas de tiempo por estado alcanzado: la línea de tiempo del cliente. */
  etiqueta_at: string | null;
  transito_at: string | null;
  disponible_at: string | null;
  entregado_at: string | null;
  /** YYYY-MM-DD */
  fecha_estimada: string | null;
  nota_cliente: string;
  origen: 'sendcloud' | 'manual';
  created_at: string;
  updated_at: string;
};

/** Lo que devuelve get_envio_status: solo campos logísticos, cero datos
 *  personales (ni dirección, ni CP, ni coste, ni margen). */
export type EnvioPublico = {
  carrier: string | null;
  carrier_nombre: string | null;
  metodo: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  estado: EnvioEstado;
  punto_recogida: PuntoRecogida;
  fecha_estimada: string | null;
  nota_cliente: string;
  etiqueta_at: string | null;
  transito_at: string | null;
  disponible_at: string | null;
  entregado_at: string | null;
  updated_at: string;
};

export type { Recibo, ReciboCliente, ReciboMetodo, ReciboVerificado } from './recibo/types';
import type { Recibo, ReciboCliente, ReciboVerificado } from './recibo/types';

export type Database = {
  public: {
    Tables: {
      filamentos: {
        Row: Filamento;
        Insert: Omit<Filamento, 'id'> & { id?: string };
        Update: Partial<Filamento>;
        Relationships: [];
      };
      colores: {
        Row: Color;
        Insert: Omit<Color, 'id'> & { id?: string };
        Update: Partial<Color>;
        Relationships: [
          {
            foreignKeyName: 'colores_filamento_id_fkey';
            columns: ['filamento_id'];
            referencedRelation: 'filamentos';
            referencedColumns: ['id'];
          }
        ];
      };
      productos: {
        Row: Producto;
        Insert: Omit<Producto, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Producto>;
        Relationships: [];
      };
      blog_posts: {
        Row: BlogPost;
        Insert: Omit<BlogPost, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<BlogPost>;
        Relationships: [];
      };
      quotes: {
        Row: Quote;
        Insert: Omit<
          Quote,
          | 'id' | 'codigo' | 'created_at' | 'updated_at'
          | 'pago' | 'importe_pagado' | 'precio_final' | 'archivado'
          | 'aceptado_at' | 'valido_hasta'
        > & {
          id?: string;
          codigo?: string;
          pago?: QuotePago;
          importe_pagado?: number;
          precio_final?: number | null;
          archivado?: boolean;
          aceptado_at?: string | null;
          valido_hasta?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Quote>;
        Relationships: [];
      };
      quote_events: {
        Row: QuoteEvento;
        Insert: Omit<QuoteEvento, 'id' | 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<QuoteEvento>;
        Relationships: [];
      };
      quote_settings: {
        Row: QuoteSettingsRow;
        Insert: Omit<QuoteSettingsRow, 'updated_at'> & { updated_at?: string };
        Update: Partial<QuoteSettingsRow>;
        Relationships: [];
      };
      envios: {
        Row: Envio;
        // Casi todo tiene default o es nullable en la tabla: solo quote_id es
        // obligatorio de verdad. Exigir el resto obligaría a escribir a mano
        // una docena de nulls en cada alta manual.
        Insert: Partial<Omit<Envio, 'quote_id'>> & { quote_id: string | null };
        Update: Partial<Envio>;
        Relationships: [
          {
            foreignKeyName: 'envios_quote_id_fkey';
            columns: ['quote_id'];
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          }
        ];
      };
      recibos: {
        Row: Recibo;
        // codigo y verif_token los pone la base de datos; datos/pdf_path los
        // rellena la Edge Function tras generar el PDF.
        Insert: Omit<Recibo, 'id' | 'codigo' | 'created_at' | 'updated_at'> & {
          id?: string;
          codigo?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Recibo>;
        Relationships: [
          {
            foreignKeyName: 'recibos_quote_id_fkey';
            columns: ['quote_id'];
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          }
        ];
      };
      trabajos: {
        Row: Trabajo;
        // fecha_efectiva is a STORED generated column — cannot be written.
        Insert: Omit<Trabajo, 'id' | 'created_at' | 'updated_at' | 'fecha_efectiva'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Trabajo, 'fecha_efectiva'>>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      get_quote_status: {
        Args: { p_codigo: string };
        Returns: {
          codigo: string;
          estado: QuoteEstado;
          pago: QuotePago;
          entrega: QuoteEntrega;
          material: string;
          cantidad: number;
          precio_total: number;
          precio_final: number | null;
          valido_hasta: string;
          aceptado_at: string | null;
          created_at: string;
          updated_at: string;
        }[];
      };
      accept_quote: {
        Args: { p_codigo: string; p_token: string };
        Returns: { ok: boolean; estado: string | null }[];
      };
      get_envio_status: {
        Args: { p_codigo: string };
        Returns: EnvioPublico[];
      };
      get_recibos_cliente: {
        Args: { p_codigo: string; p_token: string };
        Returns: ReciboCliente[];
      };
      verificar_recibo: {
        Args: { p_codigo: string; p_token: string };
        Returns: ReciboVerificado[];
      };
      vote_trabajo: {
        Args: { p_id: string; p_voter_id: string; p_target: string };
        Returns: { likes: number; dislikes: number; my_vote: string | null }[];
      };
      get_my_trabajo_votes: {
        Args: { p_voter_id: string; p_trabajo_ids: string[] };
        Returns: { trabajo_id: string; vote: string }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
