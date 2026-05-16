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

export type Categoria = 'Keycaps' | 'Figuras';

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
  orden: number;
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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
