export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export const notFound = (what: 'partido' | 'jugador' | 'equipo' | 'torneo' | 'temporada' | 'fase'): NotFoundError => {
  const label: Record<typeof what, string> = {
    partido: 'Partido no encontrado',
    jugador: 'Jugador no encontrado',
    equipo: 'Equipo no encontrado',
    torneo: 'Torneo no encontrado',
    temporada: 'Temporada no encontrada',
    fase: 'Fase no encontrada',
  };
  return new NotFoundError(label[what]);
};
