import type { TeamSeasonRow } from '@ligapedia/contracts';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const resultsConfig = {
  wins: { label: 'Ganados', color: 'var(--chart-2)' },
  draws: { label: 'Empatados', color: 'var(--chart-4)' },
  losses: { label: 'Perdidos', color: 'var(--chart-5)' },
} satisfies ChartConfig;

const goalsConfig = {
  gf: { label: 'Goles a favor', color: 'var(--chart-1)' },
  ga: { label: 'Goles en contra', color: 'var(--chart-3)' },
} satisfies ChartConfig;

/** Results and goals per season, with a data table equivalent for accessibility. */
export default function TeamSeasonCharts({ rows }: { rows: TeamSeasonRow[] }) {
  const data = [...rows].sort((a, b) => a.seasonYear - b.seasonYear).map((r) => ({ season: String(r.seasonYear), ...r }));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <figure>
        <figcaption className="mb-2 text-sm font-medium">Resultados por temporada</figcaption>
        <ChartContainer config={resultsConfig} className="aspect-auto h-64 w-full" aria-hidden>
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="season" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="wins" stackId="r" fill="var(--color-wins)" />
            <Bar dataKey="draws" stackId="r" fill="var(--color-draws)" />
            <Bar dataKey="losses" stackId="r" fill="var(--color-losses)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </figure>
      <figure>
        <figcaption className="mb-2 text-sm font-medium">Goles por temporada</figcaption>
        <ChartContainer config={goalsConfig} className="aspect-auto h-64 w-full" aria-hidden>
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="season" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} width={28} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="gf" fill="var(--color-gf)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="ga" fill="var(--color-ga)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </figure>
      <table className="sr-only">
        <caption>Resultados y goles por temporada</caption>
        <thead>
          <tr>
            <th>Temporada</th>
            <th>Ganados</th>
            <th>Empatados</th>
            <th>Perdidos</th>
            <th>Goles a favor</th>
            <th>Goles en contra</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.season}>
              <td>{r.season}</td>
              <td>{r.wins}</td>
              <td>{r.draws}</td>
              <td>{r.losses}</td>
              <td>{r.gf}</td>
              <td>{r.ga}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
