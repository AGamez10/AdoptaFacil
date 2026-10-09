import { useEffect, useState } from 'react';
import {
  FormalizationState,
  type CapabilityDecision,
  type OrganizationCapabilities,
} from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { CAPABILITY_NAMES, DOCUMENT_NAMES, STATE_NAMES } from './legal-labels';
import styles from './capabilities-panel.module.scss';

const EFFECT_LABEL: Record<CapabilityDecision['legalEffect'], string | null> = {
  none: null,
  accounting: 'Soporte contable',
  tax: 'Efecto tributario',
};

/**
 * Qué puede hacer la organización hoy según su estado formal y qué desbloquea
 * en el siguiente. Lee la misma matriz que aplica la API
 * (`GET /org/formalization/capabilities`), así que nunca promete algo que el
 * servidor no permita.
 */
export function CapabilitiesPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const client = useApiClient();
  const [data, setData] = useState<OrganizationCapabilities | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    client
      .request<OrganizationCapabilities>('/org/formalization/capabilities')
      .then((result) => active && setData(result))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [client, refreshKey]);

  if (failed) return null;
  if (!data) return <Skeleton className="h-48 w-full" />;

  const enabled = data.capabilities.filter((c) => c.enabled);
  const informal =
    data.state === FormalizationState.Informal || data.state === FormalizationState.EnProceso;
  const rteLapsed = data.state === FormalizationState.ESAL_RTE && !data.rteVigente;

  return (
    <Card data-testid="capabilities-panel">
      <CardHeader>
        <CardTitle>Lo que puedes hacer como {STATE_NAMES[data.state]}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {rteLapsed && (
          <p className={styles.alert} role="status">
            Tu RTE no está vigente, así que por ahora no emites certificados con beneficio
            tributario. Sube un RUT reciente con la responsabilidad 04 para reactivarlo.
          </p>
        )}

        <ul className={styles.list} aria-label="Funciones habilitadas">
          {enabled.map((c) => (
            <li key={c.capability} className={styles.item}>
              <span className={styles.check} aria-hidden="true">
                ✓
              </span>
              <div>
                <p className={styles.item__title}>
                  {CAPABILITY_NAMES[c.capability]}
                  {EFFECT_LABEL[c.legalEffect] && (
                    <Badge variant="secondary" className={styles.item__badge}>
                      {EFFECT_LABEL[c.legalEffect]}
                    </Badge>
                  )}
                </p>
                <p className={styles.item__text}>{c.description}</p>
              </div>
            </li>
          ))}
        </ul>

        {data.next && data.next.unlocks.length > 0 && (
          <section className={styles.next} aria-labelledby="capabilities-next">
            <h3 id="capabilities-next" className={styles.next__title}>
              Al pasar a {STATE_NAMES[data.next.state]} desbloqueas
            </h3>
            <ul className={styles.next__list}>
              {data.next.unlocks.map((capability) => (
                <li key={capability}>{CAPABILITY_NAMES[capability]}</li>
              ))}
            </ul>
            {data.next.requiredDocuments.length > 0 && (
              <p className={styles.next__docs}>
                Necesitas aprobados:{' '}
                {data.next.requiredDocuments.map((type) => DOCUMENT_NAMES[type]).join(', ')}.
                Súbelos en Documentos y el equipo de AdoptaFácil los verifica.
              </p>
            )}
          </section>
        )}

        {informal && <HowToFormalize />}
      </CardContent>
    </Card>
  );
}

/** Guía corta para quien aún no tiene RUT ni personería. Enlaces solo a sitios
 *  oficiales. TODO(client): validar el texto con el abogado. */
function HowToFormalize() {
  return (
    <details className={styles.howto}>
      <summary>¿Aún no tienes RUT ni fundación constituida? Así lo haces</summary>
      <ol>
        <li>
          Reúnan el acta de constitución y los estatutos de la fundación o asociación, firmados por
          los fundadores.
        </li>
        <li>
          Inscríbanla en la Cámara de Comercio de su ciudad. En ese trámite se saca el RUT de la
          entidad y queda el certificado de existencia y representación legal. Consulta los
          requisitos en el{' '}
          <a href="https://www.rues.org.co/" target="_blank" rel="noreferrer">
            RUES
          </a>
          .
        </li>
        <li>
          Descarga el RUT en PDF desde los servicios en línea de la{' '}
          <a href="https://www.dian.gov.co/" target="_blank" rel="noreferrer">
            DIAN
          </a>{' '}
          y el certificado de la Cámara, y súbelos en Documentos.
        </li>
        <li>
          Para que tus donantes descuenten impuestos, la entidad debe calificarse en el Régimen
          Tributario Especial ante la DIAN y actualizarlo cada año. Tu contador te acompaña.
        </li>
      </ol>
      <p>
        Mientras tanto puedes seguir recibiendo donaciones con comprobante sin efecto tributario.
      </p>
    </details>
  );
}
