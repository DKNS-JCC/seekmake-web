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
