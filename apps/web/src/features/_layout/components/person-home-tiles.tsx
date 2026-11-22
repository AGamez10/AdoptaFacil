import type { ComponentType, SVGProps } from 'react';
import { Link } from 'react-router-dom';
import {
  ChatIcon,
  HeartIcon,
  MegaphoneIcon,
  PawIcon,
  ShieldIcon,
  UsersIcon,
} from '../../../shell/icons';
import { featureForPath, useCapabilities } from '../../../shell/capabilities';
import styles from './person-home-tiles.module.scss';

interface Tile {
  to: string;
  title: string;
  text: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: 'mint' | 'sun' | 'sky' | 'coral';
}

const TILES: Tile[] = [
  {
    to: '/adoptar',
    title: 'Adoptar',
    text: 'Perros y gatos de refugios de toda Colombia esperando hogar.',
    icon: PawIcon,
    tone: 'mint',
  },
  {
    to: '/mis-solicitudes',
    title: 'Mis solicitudes',
    text: 'El estado de tus solicitudes de adopción y tus contratos.',
    icon: ShieldIcon,
    tone: 'sky',
  },
  {
    to: '/campanas',
    title: 'Apoyar una campaña',
    text: 'Cirugías, alimento y esterilizaciones con meta y evidencia.',
    icon: MegaphoneIcon,
    tone: 'sun',
  },
  {
    to: '/apadrinar',
    title: 'Mis apadrinamientos',
    text: 'Acompaña a un animal cada mes y mira cómo va.',
    icon: HeartIcon,
    tone: 'coral',
  },
  {
    to: '/voluntariado',
    title: 'Mi voluntariado',
    text: 'Tus inscripciones, horas y constancias.',
    icon: UsersIcon,
    tone: 'mint',
  },
  {
    to: '/comunidad',
    title: 'Comunidad',
    text: 'Historias, avisos y ayuda entre rescatistas y familias.',
    icon: ChatIcon,
    tone: 'sky',
  },
];

/** Inicio de una persona (adoptante, donante, voluntaria): accesos directos. */
export function PersonHomeTiles() {
  const { features } = useCapabilities().capabilities;
  // Un acceso a un módulo apagado no se muestra (mismo criterio que el menú).
  const tiles = TILES.filter((tile) => {
    const feature = featureForPath(tile.to);
    return feature === null || features[feature];
  });
  return (
    <ul className={styles.grid} data-testid="person-home-tiles">
      {tiles.map(({ to, title, text, icon: Icon, tone }) => (
        <li key={to}>
          <Link to={to} className={styles.tile}>
            <span className={styles.icon} data-tone={tone} aria-hidden="true">
              <Icon />
            </span>
            <span className={styles.title}>{title}</span>
            <span className={styles.text}>{text}</span>
            <span className={styles.more} aria-hidden="true">
              Entrar →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
