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
  texto: 'black' | 'white';
  acabado: Acabado | null;
  combina_con: string[];
  oferta: boolean;
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
  created_at: string;
  updated_at: string;
};

export type QuoteSettingsRow = {
  id: number;
  config: Record<string, unknown>;
  updated_at: string;
};

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
        > & {
          id?: string;
          codigo?: string;
          pago?: QuotePago;
          importe_pagado?: number;
          precio_final?: number | null;
          archivado?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Quote>;
        Relationships: [];
      };
      quote_settings: {
        Row: QuoteSettingsRow;
        Insert: Omit<QuoteSettingsRow, 'updated_at'> & { updated_at?: string };
        Update: Partial<QuoteSettingsRow>;
        Relationships: [];
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
          created_at: string;
          updated_at: string;
        }[];
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
