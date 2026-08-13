// Punto único de acceso a los dobles de prueba.
//
// El import map (scripts/deno-test.json) apunta a ./stub-supabase.ts y
// ./stub-denomailer.ts, así que importarlos aquí por la misma ruta relativa
// devuelve exactamente las mismas instancias de módulo que ve la Edge
// Function. Si el test los importara por otro camino, estaría inspeccionando
// un estado distinto del que la función escribe.

export { estado, reset } from './stub-supabase.ts';
export { enviados, resetMail } from './stub-denomailer.ts';
