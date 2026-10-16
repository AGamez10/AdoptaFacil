import { useState } from 'react';
import { Link } from 'react-router-dom';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { useFeature } from '../../../shell/capabilities';

export const DONATIONS_ACTIVATING_TITLE = 'Este refugio está activando sus donaciones en línea.';

export interface DonationsActivatingNoticeProps {
  organizationName: string;
  /** Portal público de la organización (`/o/<slug>`), cuando se conoce. */
  portalPath?: string;
  /** Dentro del portal: desplaza a "Mascotas en adopción" en vez de navegar. */
  onBrowseAnimals?: () => void;
  /** Nivel del título según dónde se muestra (página: h2; tarjeta del portal: h3). */
  headingLevel?: 2 | 3;
  'data-testid'?: string;
}

async function sharePortal(url: string, title: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * Lo que ve un donante cuando la organización todavía no puede recibir
 * donaciones en línea (`canReceiveDonations: false`): un mensaje cálido, nunca
 * un error ni un formulario roto, y otras formas REALES de ayudar que ya
 * existen en AdoptaFácil (solo enlaces a rutas que existen y a módulos
 * encendidos). Aplica con cualquier pasarela.
 */
export function DonationsActivatingNotice({
  organizationName,
  portalPath,
  onBrowseAnimals,
  headingLevel = 2,
  'data-testid': testId = 'donations-activating-notice',
}: DonationsActivatingNoticeProps) {
  const resourcesOn = useFeature('resources');
  const [shareStatus, setShareStatus] = useState<'idle' | 'shared' | 'copied' | 'failed'>('idle');
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const linkClass = cn(buttonVariants({ variant: 'outline', size: 'sm' }));

  const share = async () => {
    if (!portalPath) return;
    const url = `${window.location.origin}${portalPath}`;
    setShareStatus(await sharePortal(url, `${organizationName} · AdoptaFácil`));
  };

  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <Heading className="text-lg font-semibold text-foreground">
        {DONATIONS_ACTIVATING_TITLE}
      </Heading>
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{organizationName}</strong> está terminando de conectar
        su cuenta para recibir donaciones. Mientras tanto, puedes ayudar de otras formas hoy mismo:
      </p>
      <div className="flex flex-wrap gap-2">
        {onBrowseAnimals ? (
          <button type="button" className={linkClass} onClick={onBrowseAnimals}>
            Conocer a sus animales en adopción
          </button>
        ) : portalPath ? (
          <Link to={portalPath} className={linkClass}>
            Conocer a sus animales en adopción
          </Link>
        ) : (
          <Link to="/" className={linkClass}>
            Ver mascotas en adopción
          </Link>
        )}
        {resourcesOn && (
          <Link to="/recursos" className={linkClass}>
            Donar alimento, medicinas u otros insumos
          </Link>
        )}
        <Link to="/campanas" className={linkClass}>
          Ver campañas solidarias
        </Link>
        <Link to="/voluntariado" className={linkClass}>
          Ofrecer tu tiempo como voluntario
        </Link>
        {portalPath && (
          <button type="button" className={linkClass} onClick={() => void share()}>
            Compartir su portal
          </button>
        )}
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground">
        {shareStatus === 'copied'
          ? 'Enlace del portal copiado. ¡Gracias por compartirlo!'
          : shareStatus === 'failed'
            ? 'No pudimos compartir el enlace automáticamente; puedes copiarlo desde la barra del navegador.'
            : ''}
      </p>
      <p className="text-xs text-muted-foreground">
        Vuelve pronto: este mismo enlace servirá para donar apenas esté listo.
      </p>
    </div>
  );
}
