import type { ComponentType } from 'react';
import type { FeatureKey } from '@adoptafacil/contracts';
import { useCapabilities } from '../capabilities';
import {
  BoxIcon,
  ChatIcon,
  HeartIcon,
  type IconProps,
  MegaphoneIcon,
  PawIcon,
  ShieldIcon,
  ShoppingBagIcon,
} from '../icons';

/** Libro abierto (guías). Local: solo lo usan el menú público y la landing. */
export function BookIcon(props: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable={false}
      {...props}
    >
      <path d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5Z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

export interface PublicModule {
  key: string;
  label: string;
  /** Una línea: qué encuentra la persona ahí. */
  description: string;
  to: string;
  Icon: ComponentType<IconProps>;
  /** Módulo que se puede apagar (Ola 1, R1-1). Sin él, siempre está. */
  feature?: FeatureKey;
  /** Ancla dentro de la landing (`/#…`). */
  anchor?: boolean;
}

export interface PublicNavGroup {
  key: 'adoptar' | 'ayudar' | 'comunidad' | 'organizaciones';
  label: string;
  /** Una sola entrada: se pinta como enlace directo; varias: como menú. */
  modules: PublicModule[];
}

/**
 * Todos los módulos públicos de AdoptaFácil en cuatro grupos, en el orden de
 * los tres caminos del hero (adoptar, ayudar, organizaciones) más la
 * comunidad. Es la única lista: la usan el menú público y la sección "Todo
 * AdoptaFácil" de la landing, así nunca se contradicen.
 */
export const PUBLIC_NAV_GROUPS: PublicNavGroup[] = [
  {
    key: 'adoptar',
    label: 'Adoptar',
    modules: [
      {
        key: 'adoptar',
        label: 'Adoptar',
        description: 'Perros y gatos de refugios de todo el país.',
        to: '/adoptar',
        Icon: PawIcon,
      },
    ],
  },
  {
    key: 'ayudar',
    label: 'Ayudar',
    modules: [
      {
        key: 'donar',
        label: 'Donar',
        description: 'Elige la organización y ve el desglose antes de pagar.',
        to: '/donaciones',
        Icon: HeartIcon,
        feature: 'payments',
      },
      {
        key: 'campanas',
        label: 'Campañas',
        description: 'Metas concretas con evidencia de en qué se usó la ayuda.',
        to: '/campanas',
        Icon: MegaphoneIcon,
      },
      {
        key: 'recursos',
        label: 'Banco de recursos',
        description: 'Comparte cobijas, guacales o alimento con quien lo necesita.',
        to: '/recursos',
        Icon: BoxIcon,
        feature: 'resources',
      },
    ],
  },
  {
    key: 'comunidad',
    label: 'Comunidad',
    modules: [
      {
        key: 'servicios',
        label: 'Servicios para mascotas',
        description: 'Veterinarias, peluquerías y paseadores cerca de ti.',
        to: '/servicios',
        Icon: ChatIcon,
        feature: 'community',
      },
      {
        key: 'marketplace',
        label: 'Marketplace',
        description: 'Productos de las organizaciones y negocios aliados.',
        to: '/marketplace',
        Icon: ShoppingBagIcon,
        feature: 'marketplace',
      },
      {
        key: 'guias',
        label: 'Guías',
        description: 'Cómo adoptar bien y cuidar a tu nuevo amigo.',
        to: '/guias',
        Icon: BookIcon,
      },
    ],
  },
  {
    key: 'organizaciones',
    label: 'Organizaciones',
    modules: [
      {
        key: 'organizaciones',
        label: 'Organizaciones',
        description: 'Tu portal, tus animales y tus adopciones, gratis.',
        to: '/#organizaciones',
        Icon: ShieldIcon,
        anchor: true,
      },
    ],
  },
];

export interface PublicModuleState extends PublicModule {
  /** Falso si su módulo está apagado: se muestra como "muy pronto", sin enlace. */
  enabled: boolean;
}

/** Los grupos con cada módulo marcado como encendido o apagado. */
export function usePublicModules(): (Omit<PublicNavGroup, 'modules'> & {
  modules: PublicModuleState[];
})[] {
  const { features } = useCapabilities().capabilities;
  return PUBLIC_NAV_GROUPS.map((group) => ({
    ...group,
    modules: group.modules.map((module) => ({
      ...module,
      enabled: !module.feature || features[module.feature],
    })),
  }));
}
