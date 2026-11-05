import { Link } from 'react-router-dom';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { useFeature } from '../../../shell/capabilities';
import { OPEN_OFFER_PATH } from '../model/open-offers-view';

interface Way {
  key: string;
  title: string;
  text: string;
  to: string;
  cta: string;
}

/** Caminos que el producto puede cumplir HOY (nunca un botón que lleve a un 404). */
export function useOtherWays(): Way[] {
  const payments = useFeature('payments');
  const sponsorships = useFeature('sponsorships');
  return [
    {
      key: 'adoptar',
      title: 'Adopta',
      text: 'Perros y gatos de todo el país esperan un hogar.',
      to: '/adoptar',
      cta: 'Conocer animales',
    },
    ...(sponsorships
      ? [
          {
            key: 'apadrinar',
            title: 'Apadrina',
            text: 'Un aporte mensual para el cuidado de un animal que aún espera.',
            to: '/apadrinar',
            cta: 'Apadrinar',
          },
        ]
      : []),
    {
      key: 'campanas',
      title: 'Apoya una campaña',
      text: 'Cirugías, alimento o esterilizaciones con meta y evidencia.',
      to: '/campanas',
      cta: 'Ver campañas',
    },
    ...(payments
      ? [
          {
            key: 'donar',
            title: 'Dona',
            text: 'Elige la organización y mira el desglose antes de pagar.',
            to: '/donaciones',
            cta: 'Donar',
          },
        ]
      : []),
    {
      key: 'voluntariado',
      title: 'Sé voluntario',
      text: 'Paseos, baños, jornadas de adopción: tu tiempo también cuenta.',
      to: '/voluntariado',
      cta: 'Ver voluntariados',
    },
  ];
}

/** Invitación a dejar un ofrecimiento abierto. `empty`: hoy no hay necesidades. */
export function OpenOfferInvite({ empty = false }: { empty?: boolean }) {
  return (
    <section
      className="rounded-xl border border-border bg-muted/40 p-5 sm:p-6"
      aria-labelledby="open-offer-invite-title"
      data-testid="open-offer-invite"
    >
      <h2 id="open-offer-invite-title" className="text-lg font-semibold tracking-tight">
        {empty
          ? 'Hoy no hay necesidades publicadas, pero lo que tienes sí sirve'
          : '¿Tienes algo que no está en la lista?'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Cuéntanos qué tienes y en qué municipio. Las organizaciones lo verán sin tu nombre ni tus
        datos y, si a una le sirve, te avisamos para coordinar la entrega.
      </p>
      <Link to={OPEN_OFFER_PATH} className={cn(buttonVariants(), 'mt-4')}>
        Ofrecer lo que tengo
      </Link>
    </section>
  );
}

/** Otras formas de ayudar, para que nadie se vaya sin un siguiente paso. */
export function OtherWaysToHelp() {
  const ways = useOtherWays();
  return (
    <section aria-labelledby="other-ways-title" data-testid="other-ways">
      <h2 id="other-ways-title" className="text-base font-semibold">
        Otras formas de ayudar hoy
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ways.map((way) => (
          <li key={way.key} className="rounded-lg border border-border p-4">
            <p className="font-medium">{way.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{way.text}</p>
            <Link
              to={way.to}
              className="mt-2 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {way.cta}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
