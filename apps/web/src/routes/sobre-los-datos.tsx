import { createFileRoute, Link } from '@tanstack/react-router';
import { PageHeader } from '@/components/stats';
import { useTitle } from '@/lib/use-title';

export const Route = createFileRoute('/sobre-los-datos')({ component: AboutPage });

function H({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-8 scroll-mt-20 text-lg font-semibold">
      {children}
    </h2>
  );
}

function AboutPage() {
  useTitle('Sobre los datos');
  return (
    <article className="max-w-3xl text-[15px] leading-relaxed [&_p]:mt-3 [&_li]:mt-1 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
      <PageHeader title="Sobre los datos" subtitle="De dónde salen los números y qué limitaciones tienen" />
      <p>
        Ligapedia es un sitio <strong>no oficial</strong>. Todos los datos provienen de las páginas públicas de la{' '}
        <a className="underline underline-offset-4" href="https://ligauniversitaria.org.uy/" target="_blank" rel="noreferrer">
          Liga Universitaria de Deportes
        </a>{' '}
        («Detalle histórico de las fechas» y «Tablas de posiciones»). Se actualizan una vez por día, a las 3:00 (hora de Montevideo). La fecha de la última actualización figura al pie de cada página.
      </p>

      <H>Goles sin autor registrado</H>
      <p>
        El resultado oficial de cada partido manda. En muchos partidos, sobre todo antes de 2020, la fuente no registra a todos los goleadores. Cuando el marcador tiene más goles que los registrados,
        los que faltan se muestran como <em>«Gol sin autor registrado»</em>. Esos goles cuentan para el resultado, las tablas y los totales de los equipos, pero no para ningún jugador. Los rankings de goles
        indican qué porcentaje de los goles del filtro elegido tiene autor registrado.
      </p>

      <H>Minutos</H>
      <p>Los minutos de los goles se muestran tal como los publica la fuente. Muchos aparecen en el minuto 1 o 0: es un valor de relleno de la fuente, no un dato real.</p>

      <H>Tarjetas</H>
      <p>
        Las expulsiones (rojas) están bien registradas. Las amonestaciones (amarillas) casi no se registran: sólo aparecen en temporadas recientes. Los rankings de amarillas indican en qué temporadas hay
        registros. Las tarjetas se vinculan al jugador por su nombre dentro de la formación del partido; si no se puede identificar, se muestra el nombre publicado.
      </p>

      <H>Partidos ganados por W.O.</H>
      <p>
        Los partidos ganados por W.O. cuentan para el resultado, los puntos y las tablas, con el marcador que publica la Liga (habitualmente 3–0). No cuentan como partidos jugados para los jugadores ni
        para records como «mayor goleada».
      </p>

      <H>Fechas dudosas</H>
      <p>Algunos partidos tienen en la fuente una fecha imposible (por ejemplo, un partido de 2009 fechado en 2021). Se mantienen en su temporada original y se marcan con un aviso.</p>

      <H id="campeones">Cómo se determina el campeón</H>
      <ul>
        <li>Si el torneo tiene una final (partido único, ida y vuelta o serie), es campeón quien gana más partidos de la final; si empatan en partidos ganados, decide la diferencia de goles en esos partidos.</li>
        <li>Si el torneo no tiene final, es campeón el primero de la tabla de su última fase de liga (tabla oficial cuando existe).</li>
        <li>Los partidos por el tercer puesto nunca definen un campeón. Si no se puede determinar, se muestra «Campeón no determinado».</li>
        <li>Algunos casos se corrigen manualmente cuando el formato del torneo es inusual.</li>
      </ul>

      <H>Jugadores y equipos</H>
      <p>
        Cada jugador se identifica por su número de carné de la Liga (que no se publica en este sitio), así que los cambios de nombre no generan jugadores duplicados. Los equipos se identifican por su nombre
        publicado; los equipos masculino y femenino de una misma institución son equipos distintos.
      </p>

      <H>Correcciones</H>
      <p>
        ¿Encontraste un error o querés que se corrija o retire un dato? Escribí a los responsables del sitio. Los datos de origen sólo pueden corregirse en la Liga Universitaria; las correcciones de
        presentación (nombres de equipos, campeones, agrupación de torneos) se aplican en la siguiente actualización.
      </p>
      <p className="mt-8">
        <Link to="/" className="underline underline-offset-4">
          Volver al inicio
        </Link>
      </p>
    </article>
  );
}
