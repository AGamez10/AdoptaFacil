import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FORMALIZATION_SEQUENCE,
  STATE_REQUIRED_DOCUMENTS,
  type CapabilityDecision,
  type DocumentType,
  type OrganizationCapabilities,
  type OrganizationCapability,
} from '@adoptafacil/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  buttonVariants,
  cn,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { CAPABILITY_NAMES, DOCUMENT_NAMES, STATE_NAMES } from './legal-labels';

/** Donde la organización sube el RUT y el certificado de Cámara. */
export const DOCUMENTS_PATH = '/organizacion/documentos';
export const FORMALIZATION_PATH = '/organizacion/formalizacion';

export interface FormalCapabilityState {
  /** `undefined` mientras carga o si no se pudo leer: la pantalla no bloquea
   *  por suposición; el servidor igual rechaza lo que no corresponde. */
  decision?: CapabilityDecision;
  data?: OrganizationCapabilities;
}

/**
 * ¿El estado formal de la organización habilita `capability`? Lee la misma
 * matriz que aplica la API (`GET /org/formalization/capabilities`).
 */
export function useFormalCapability(capability: OrganizationCapability): FormalCapabilityState {
  const client = useApiClient();
  const [state, setState] = useState<FormalCapabilityState>({});

  useEffect(() => {
    let active = true;
    client
      .request<OrganizationCapabilities>('/org/formalization/capabilities')
      .then((result) => {
        if (!active || !Array.isArray(result?.capabilities)) return;
        setState({
          data: result,
          decision: result.capabilities.find((c) => c.capability === capability),
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, capability]);

  return state;
}

/**
 * Aviso para un módulo que la organización ve pero que su estado formal aún no
 * habilita: qué es, desde qué estado se desbloquea, qué documentos lo prueban y
 * un botón directo a donde se suben.
 */
export function FormalStateLock({
  decision,
  data,
}: {
  decision: CapabilityDecision;
  data?: OrganizationCapabilities;
}) {
  const target = decision.unlocksAt;
  // Todos los documentos de los estados hasta el que la habilita (puede estar
  // a más de un paso), sin repetir.
  const documents = [
    ...new Set<DocumentType>(
      FORMALIZATION_SEQUENCE.slice(0, FORMALIZATION_SEQUENCE.indexOf(target) + 1).flatMap(
        (state) => STATE_REQUIRED_DOCUMENTS[state],
      ),
    ),
  ];
  return (
    <Card data-testid="formal-state-lock" role="status">
      <CardHeader>
        <CardTitle className="text-base">
          {CAPABILITY_NAMES[decision.capability]} se desbloquea al ser {STATE_NAMES[target]}
        </CardTitle>
        <CardDescription>
          Hoy tu organización está como {data ? STATE_NAMES[data.state] : 'en un estado anterior'}.
          Esta función se habilita en cuanto avances en el estado formal de tu organización.{' '}
          {decision.basis}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Para llegar a {STATE_NAMES[target]} necesitas aprobados:{' '}
            {documents.map((type) => DOCUMENT_NAMES[type]).join(' y ')}. Súbelos y el equipo de
            AdoptaFácil los revisa.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link to={DOCUMENTS_PATH} className={buttonVariants()}>
            Cargar mis documentos
          </Link>
          <Link to={FORMALIZATION_PATH} className={cn(buttonVariants({ variant: 'outline' }))}>
            Ver mi formalización
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
