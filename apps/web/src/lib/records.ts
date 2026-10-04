import type { MatchRecordType, PlayerMetric, TeamMetric } from '@ligapedia/contracts';

export const PLAYER_METRIC_LABELS: Record<PlayerMetric, { title: string; unit: string; coverage?: 'goals' | 'yellow' }> = {
  goles: { title: 'Más goles', unit: 'goles', coverage: 'goals' },
  'goles-por-partido': { title: 'Goles por partido', unit: 'por partido', coverage: 'goals' },
  partidos: { title: 'Más partidos jugados', unit: 'partidos' },
  amarillas: { title: 'Más amarillas', unit: 'amarillas', coverage: 'yellow' },
  rojas: { title: 'Más rojas', unit: 'rojas' },
  tarjetas: { title: 'Más tarjetas', unit: 'tarjetas', coverage: 'yellow' },
  'tarjetas-por-partido': { title: 'Tarjetas por partido', unit: 'por partido', coverage: 'yellow' },
  'goles-en-contra': { title: 'Más goles en contra', unit: 'goles en contra' },
  capitan: { title: 'Más veces capitán', unit: 'partidos' },
  tripletes: { title: 'Más partidos con 3+ goles', unit: 'partidos', coverage: 'goals' },
  temporadas: { title: 'Más temporadas jugadas', unit: 'temporadas' },
  titulos: { title: 'Más campeonatos ganados', unit: 'títulos' },
};

export const TEAM_METRIC_LABELS: Record<TeamMetric, { title: string; unit: string }> = {
  titulos: { title: 'Más campeonatos', unit: 'títulos' },
  victorias: { title: 'Más victorias', unit: 'victorias' },
  partidos: { title: 'Más partidos', unit: 'partidos' },
  'porcentaje-victorias': { title: 'Mejor % de victorias', unit: '%' },
  'porcentaje-puntos': { title: 'Mejor % de puntos', unit: '%' },
  goles: { title: 'Más goles a favor', unit: 'goles' },
  'goles-recibidos-por-partido': { title: 'Menos goles recibidos por partido', unit: 'por partido' },
  'vallas-invictas': { title: 'Más vallas invictas', unit: 'partidos' },
  'racha-victorias': { title: 'Racha de victorias más larga', unit: 'partidos' },
  'racha-invicto': { title: 'Racha invicta más larga', unit: 'partidos' },
};

export const MATCH_RECORD_LABELS: Record<MatchRecordType, { title: string; unit: string }> = {
  goleadas: { title: 'Mayores goleadas', unit: 'goles de diferencia' },
  'mas-goles': { title: 'Partidos con más goles', unit: 'goles' },
  'empates-con-mas-goles': { title: 'Empates con más goles', unit: 'goles' },
};
