import { loadResenas } from '@/lib/resenas';
import { hoyMadrid, loadPlazas } from '@/lib/campana-navidad';
import { loadTrabajos } from '@/lib/trabajos';
import { HomeClient } from './HomeClient';

export default async function HomePage() {
  const [trabajos, resenas, plazas] = await Promise.all([loadTrabajos(), loadResenas(), loadPlazas()]);
  return <HomeClient trabajos={trabajos} resenas={resenas} plazas={plazas} hoy={hoyMadrid()} />;
}
