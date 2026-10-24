import { cn } from '@adoptafacil/ui';
import { citySlug } from '../model/adopt-filters';
import styles from './colombia-map.module.scss';

/**
 * Mapa estilizado de Colombia con un punto por ciudad que tiene animales
 * publicados. Es una silueta aproximada (no cartografía oficial) pensada para
 * orientar de un vistazo; la lista de ciudades debajo es la vía accesible y
 * completa (incluye ciudades sin coordenadas conocidas aquí).
 */

const MIN_LON = -79.4;
const MAX_LAT = 12.7;
const SCALE = 20;

function project(lon: number, lat: number): [number, number] {
  return [
    Math.round((lon - MIN_LON) * SCALE * 10) / 10,
    Math.round((MAX_LAT - lat) * SCALE * 10) / 10,
  ];
}

/** Silueta simplificada (lon, lat), en sentido horario desde La Guajira. */
const OUTLINE: [number, number][] = [
  [-71.7, 12.4],
  [-71.1, 11.8],
  [-72.2, 11.1],
  [-72.9, 10.4],
  [-73.1, 9.3],
  [-72.7, 8.6],
  [-72.4, 7.4],
  [-71.0, 7.0],
  [-70.1, 6.9],
  [-69.4, 6.1],
  [-67.8, 6.2],
  [-67.5, 5.5],
  [-67.8, 4.5],
  [-67.4, 3.5],
  [-67.8, 2.8],
  [-67.1, 1.1],
  [-69.4, 1.1],
  [-69.8, 0.6],
  [-70.0, -0.2],
  [-69.4, -1.1],
  [-69.9, -4.2],
  [-70.6, -3.8],
  [-72.0, -2.4],
  [-73.5, -1.2],
  [-74.8, -0.2],
  [-75.6, 0.0],
  [-77.4, 0.4],
  [-78.8, 1.4],
  [-78.6, 2.6],
  [-77.6, 3.6],
  [-77.4, 5.5],
  [-77.9, 7.2],
  [-77.3, 8.3],
  [-76.8, 8.6],
  [-76.3, 9.4],
  [-75.6, 10.4],
  [-74.9, 11.0],
  [-74.2, 11.3],
  [-73.3, 11.3],
  [-72.2, 11.9],
];

const OUTLINE_PATH = `M${OUTLINE.map(([lon, lat]) => project(lon, lat).join(' ')).join('L')}Z`;

/** Coordenadas aproximadas de las ciudades más pobladas, por slug. */
const CITY_COORDS: Record<string, [number, number]> = {
  bogota: [-74.08, 4.71],
  'bogota-dc': [-74.08, 4.71],
  soacha: [-74.22, 4.58],
  chia: [-74.06, 4.86],
  zipaquira: [-74.0, 5.02],
  medellin: [-75.57, 6.25],
  bello: [-75.56, 6.34],
  envigado: [-75.59, 6.17],
  itagui: [-75.61, 6.18],
  rionegro: [-75.37, 6.15],
  cali: [-76.53, 3.45],
  palmira: [-76.3, 3.53],
  barranquilla: [-74.8, 10.97],
  soledad: [-74.76, 10.92],
  cartagena: [-75.51, 10.39],
  bucaramanga: [-73.12, 7.12],
  floridablanca: [-73.09, 7.06],
  pereira: [-75.69, 4.81],
  dosquebradas: [-75.67, 4.84],
  manizales: [-75.52, 5.07],
  armenia: [-75.68, 4.53],
  'santa-marta': [-74.2, 11.24],
  cucuta: [-72.51, 7.89],
  ibague: [-75.23, 4.44],
  villavicencio: [-73.63, 4.14],
  pasto: [-77.28, 1.21],
  neiva: [-75.28, 2.93],
  monteria: [-75.88, 8.75],
  popayan: [-76.61, 2.44],
  valledupar: [-73.25, 10.46],
  tunja: [-73.36, 5.53],
  sincelejo: [-75.4, 9.3],
  riohacha: [-72.91, 11.54],
  quibdo: [-76.66, 5.69],
  florencia: [-75.61, 1.61],
  yopal: [-72.4, 5.34],
  leticia: [-69.94, -4.21],
  buenaventura: [-77.02, 3.88],
  tulua: [-76.2, 4.08],
  girardot: [-74.8, 4.3],
};

export interface CityCount {
  city: string;
  count: number;
}

export interface ColombiaMapProps {
  cities: CityCount[];
  selectedCity: string | null;
  onSelectCity: (city: string | null) => void;
  className?: string;
}

function pluralAnimals(count: number): string {
  return count === 1 ? '1 animal' : `${count} animales`;
}

export function ColombiaMap({ cities, selectedCity, onSelectCity, className }: ColombiaMapProps) {
  const selectedKey = selectedCity ? citySlug(selectedCity) : null;
  const max = Math.max(1, ...cities.map((entry) => entry.count));
  const [width, height] = project(-66.8, -4.4);
  const pins = cities
    .map((entry) => {
      const coords = CITY_COORDS[citySlug(entry.city)];
      return coords ? { ...entry, point: project(coords[0], coords[1]) } : null;
    })
    .filter((pin): pin is CityCount & { point: [number, number] } => pin !== null)
    // Los más grandes primero para que los pequeños queden encima y se puedan tocar.
    .sort((a, b) => b.count - a.count);

  return (
    <div className={cn(styles.map, className)} data-testid="colombia-map">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.map__svg}
        role="group"
        aria-label="Mapa de Colombia con las ciudades donde hay animales en adopción"
      >
        <path d={OUTLINE_PATH} className={styles.map__land} />
        {pins.map(({ city, count, point: [x, y] }) => {
          const active = selectedKey === citySlug(city);
          const radius = 5 + Math.round((count / max) * 9);
          return (
            <g
              key={city}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`${city}: ${pluralAnimals(count)}`}
              className={cn(styles.pin, active && styles['pin--active'])}
              onClick={() => onSelectCity(active ? null : city)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectCity(active ? null : city);
                }
              }}
            >
              <circle cx={x} cy={y} r={radius + 6} className={styles.pin__halo} />
              <circle cx={x} cy={y} r={radius} className={styles.pin__dot} />
              <text x={x} y={y + 3.5} textAnchor="middle" className={styles.pin__count}>
                {count}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className={styles.map__list} aria-label="Ciudades con animales en adopción">
        {cities.map(({ city, count }) => {
          const active = selectedKey === citySlug(city);
          return (
            <li key={city}>
              <button
                type="button"
                className={cn(styles.city, active && styles['city--active'])}
                aria-pressed={active}
                onClick={() => onSelectCity(active ? null : city)}
              >
                <span>{city}</span>
                <span className={styles.city__count}>{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
