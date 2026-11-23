// Categorías de trabajo. Se guardan como la primera etiqueta del trabajo y deciden
// en qué página de servicio sale. Archivo aparte para que el panel lo importe sin
// arrastrar la carga de datos de lib/trabajos.ts.
export const CATEGORIAS = [
  { id: 'figuras', nombre: 'Figuras y mascotas' },
  { id: 'regalos', nombre: 'Regalos y decoración' },
  { id: 'grupos', nombre: 'Clubes y grupos' },
  { id: 'rol', nombre: 'Rol y maquetas' },
  { id: 'repuestos', nombre: 'Repuestos' }
] as const;

export type CategoriaId = (typeof CATEGORIAS)[number]['id'];
