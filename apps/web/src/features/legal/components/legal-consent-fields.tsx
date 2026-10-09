import type { ReactNode } from 'react';
import {
  getLegalDocument,
  type LegalConsentGroup,
  type LegalDocumentKey,
} from '@adoptafacil/contracts';
import { legalPath } from '../model/legal-content';
import { type ConsentAudience, type ConsentState, consentGroupsFor } from '../model/consent';

function DocLink({ docKey, children }: { docKey: LegalDocumentKey; children: ReactNode }) {
  // Se abre en otra pestaña para no perder lo escrito en el formulario.
  return (
    <a
      href={legalPath(getLegalDocument(docKey).slug)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2"
    >
      {children}
    </a>
  );
}

function label(group: LegalConsentGroup['id']): ReactNode {
  switch (group) {
    case 'terms':
      return (
        <>
          Acepto los <DocLink docKey="terms">Términos y condiciones</DocLink> y lo que dice{' '}
          <DocLink docKey="platform_scope">qué es y qué no es AdoptaFácil</DocLink>.
        </>
      );
    case 'data':
      return (
        <>
          Autorizo el tratamiento de mis datos personales según la{' '}
          <DocLink docKey="data_authorization">autorización</DocLink> y la{' '}
          <DocLink docKey="privacy_policy">Política de tratamiento de datos</DocLink>.
        </>
      );
    case 'organization':
      return (
        <>
          En nombre de la organización, acepto las{' '}
          <DocLink docKey="org_terms">
            Condiciones para organizaciones y el acuerdo de datos
          </DocLink>{' '}
          y declaro que puedo obligarla.
        </>
      );
    case 'commercial':
      return (
        <>
          <span className="font-medium">Opcional:</span> autorizo{' '}
          <DocLink docKey="commercial_authorization">usos comerciales</DocLink> de mis datos de
          contacto. Puedo retirarlo cuando quiera.
        </>
      );
  }
}

export interface LegalConsentFieldsProps {
  audience: ConsentAudience;
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  /** Mensaje cuando se intentó continuar sin las casillas obligatorias. */
  error?: string;
  idPrefix: string;
}

/**
 * Casillas de aceptación legal. Ninguna viene marcada; la autorización de datos
 * va separada de los términos (Ley 1581 art. 9) y la comercial es opcional.
 */
export function LegalConsentFields({
  audience,
  value,
  onChange,
  error,
  idPrefix,
}: LegalConsentFieldsProps) {
  return (
    <fieldset
      className="space-y-2"
      aria-describedby={error ? `${idPrefix}-legal-error` : undefined}
    >
      <legend className="sr-only">Aceptación de términos y tratamiento de datos</legend>
      {consentGroupsFor(audience).map((group) => {
        const id = `${idPrefix}-legal-${group.id}`;
        return (
          <div key={group.id} className="flex items-start gap-2 text-sm">
            <input
              id={id}
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0"
              checked={value[group.id] === true}
              onChange={(e) => onChange({ ...value, [group.id]: e.target.checked })}
              data-testid={id}
            />
            <label htmlFor={id} className="text-muted-foreground">
              {label(group.id)}
            </label>
          </div>
        );
      })}
      {error && (
        <p id={`${idPrefix}-legal-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
