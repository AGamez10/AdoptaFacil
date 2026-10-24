import { useState } from 'react';
import {
  MIN_DONATION_AMOUNT,
  type CommissionPayer,
  type LegalAcceptanceItem,
} from '@adoptafacil/contracts';
import { Button, Input, cn } from '@adoptafacil/ui';
import {
  acceptancesFrom,
  type ConsentState,
  LegalConsentFields,
  requiredConsentsGiven,
} from '../../legal';
import { DonationBreakdown } from './donation-breakdown';
import { formatCop, safeBuildDonationBreakdown } from '../model/donation-breakdown-view';
import styles from './donate-form.module.scss';

/** Regex de validación LIVIANA en UI — el backend (zod, `.email()`) es la
 *  autoridad real; esto solo evita habilitar "Continuar" con algo obviamente
 *  incompleto. */
const EMAIL_LOOKS_VALID = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DonateFormValues {
  intendedAmount: number;
  commissionPayer: CommissionPayer;
  /** "¿Donar de forma anónima frente a la organización?" */
  anonymous: boolean;
  /** Solo presente cuando NO hay sesión (checkout de invitado): el nombre y
   *  correo capturados en el propio formulario. Con sesión, `DonatePage`
   *  arma el payer desde `useSession()` — este formulario no lo duplica. */
  guestPayer?: { fullName: string; email: string };
  /** Solo sin sesión: términos y autorización de datos aceptados en el
   *  formulario (con sesión ya se aceptaron al registrarse). */
  legalAcceptances?: LegalAcceptanceItem[];
}

export interface DonateFormProps {
  organizationName: string;
  submitting?: boolean;
  /** Hay una sesión activa (Persona autenticada). `false` ⇒ checkout de
   *  invitado (requisito del cliente: donar nunca exige cuenta ni login) —
   *  el formulario pide nombre + correo y los exige antes de habilitar
   *  "Continuar". Con sesión, esos campos ni se muestran (se prellenan aparte). */
  hasSession: boolean;
  /**
   * ADR-PAG-002: "Donar" llama a `onDonate` directo (sin datos de tarjeta) y
   * la página abre el checkout de ePayco, que ofrece los medios que la
   * organización tenga habilitados. Un rechazo lo comunica la página (toast).
   */
  onDonate: (values: DonateFormValues) => Promise<void>;
}

/**
 * Formulario de donación (§M05, P1 + checkout de invitado + ADR-PAG-002). PRESENTACIONAL
 * (sin api/sesión real, recibe `hasSession` como prop) para poder testearlo directo.
 * Un solo paso: monto + casillas + desglose transparente EN VIVO (misma cuenta que el
 * backend, vía `computeBreakdown`) + identidad de invitado si no hay sesión. "Donar"
 * crea la donación y la página abre la pasarela segura de ePayco (la única desde que
 * Mercado Pago se retiró, 2026-10-17): nunca se piden datos de tarjeta en AdoptaFácil.
 * Ofrece la casilla "cubro la comisión de la pasarela"
 * (commissionPayer = 'donor'; F-NOMENCLATURA-CHECKBOX: el donante cubre la comisión
 * real de la pasarela de pago, un tercero).
 * Lo PRIMERO que se pregunta es si la donación es con datos o anónima FRENTE A LA
 * ORGANIZACIÓN (con o sin sesión). Sin sesión y con datos, se exige nombre + correo
 * (checkout de invitado); si elige anónima, esos campos se omiten por completo.
 */
export function DonateForm({
  organizationName,
  submitting = false,
  hasSession,
  onDonate,
}: DonateFormProps) {
  const [amountText, setAmountText] = useState('');
  const [coverFee, setCoverFee] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [consents, setConsents] = useState<ConsentState>({});

  const commissionPayer: CommissionPayer = coverFee ? 'donor' : 'organization';
  const amount = Number.parseInt(amountText, 10);
  const preview = safeBuildDonationBreakdown(amount, commissionPayer);
  // Anónima: el invitado no entrega nombre ni correo (no se pide ni se envía).
  const askGuestIdentity = !hasSession && !anonymous;
  const guestIdentityComplete =
    !askGuestIdentity || (guestName.trim().length > 0 && EMAIL_LOOKS_VALID.test(guestEmail.trim()));
  // Sin sesión, el invitado acepta términos y tratamiento de datos antes de pagar.
  const legalComplete = hasSession || requiredConsentsGiven('guest', consents);
  const canContinue = preview !== null && !submitting && guestIdentityComplete && legalComplete;

  const guestPayer = askGuestIdentity
    ? { fullName: guestName.trim(), email: guestEmail.trim() }
    : undefined;
  return (
    <div className={styles.form}>
      <fieldset className={styles.choice}>
        <legend className={styles.label}>¿Cómo quieres donar?</legend>
        <div className={styles.choice__options}>
          <label
            className={cn(styles.choice__option, !anonymous && styles['choice__option--selected'])}
          >
            <input
              type="radio"
              name="donation-visibility"
              className={styles.choice__input}
              checked={!anonymous}
              data-testid="donate-identified"
              onChange={() => setAnonymous(false)}
            />
            <span className={styles.choice__title}>Con mis datos</span>
            <span className={styles.choice__desc}>
              La organización sabrá quién dona y recibirás tu recibo por correo.
            </span>
          </label>
          <label
            className={cn(styles.choice__option, anonymous && styles['choice__option--selected'])}
          >
            <input
              type="radio"
              name="donation-visibility"
              className={styles.choice__input}
              checked={anonymous}
              data-testid="donate-anonymous"
              onChange={() => setAnonymous(true)}
            />
            <span className={styles.choice__title}>De forma anónima</span>
            <span className={styles.choice__desc}>
              La organización no verá tu identidad.
              {!hasSession && ' No te pediremos nombre ni correo, y no recibirás recibo.'}
            </span>
          </label>
        </div>
      </fieldset>

      {askGuestIdentity && (
        <>
          <label className={styles.label} htmlFor="donation-guest-name">
            Tu nombre
          </label>
          <Input
            id="donation-guest-name"
            data-testid="donation-guest-name"
            placeholder="Nombre y apellido"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
          />

          <label className={styles.label} htmlFor="donation-guest-email">
            Tu correo electrónico
          </label>
          <Input
            id="donation-guest-email"
            data-testid="donation-guest-email"
            type="email"
            placeholder="tucorreo@ejemplo.com"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
          />
          <p className={styles.hint}>
            No necesitas una cuenta para donar. Usamos tu correo para enviarte el recibo.
          </p>
        </>
      )}

      <label className={styles.label} htmlFor="donation-amount">
        Monto de tu donación (COP)
      </label>
      <Input
        id="donation-amount"
        inputMode="numeric"
        placeholder="50000"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value.replace(/[^\d]/g, ''))}
      />

      <label className={styles['checkbox-row']}>
        <input
          type="checkbox"
          className={styles['checkbox-row__input']}
          checked={coverFee}
          data-testid="cover-fee"
          onChange={(e) => setCoverFee(e.target.checked)}
        />
        <span>
          Cubro la comisión de la pasarela de pago para que la organización reciba el monto
          completo. AdoptaFácil no cobra comisión por tu donación.
        </span>
      </label>

      {preview ? (
        <DonationBreakdown intendedAmount={amount} commissionPayer={commissionPayer} />
      ) : (
        <p className={styles.hint}>
          Ingresa al menos {formatCop(MIN_DONATION_AMOUNT)} para ver el desglose.
        </p>
      )}

      {!hasSession && (
        <LegalConsentFields
          audience="guest"
          value={consents}
          onChange={setConsents}
          idPrefix="donation"
        />
      )}

      <p className={styles.hint}>
        Pagarás en la pasarela segura de ePayco con los medios que tenga habilitados{' '}
        {organizationName} (tarjeta, PSE, Nequi, Daviplata, efectivo…). El dinero llega directo a su
        cuenta.
      </p>

      <Button
        disabled={!canContinue}
        onClick={() => {
          // Sin paso de tarjeta: la página crea la donación y abre ePayco. Un
          // rechazo ya lo comunica la página (toast); aquí solo se evita el
          // "unhandled rejection".
          onDonate({
            intendedAmount: amount,
            commissionPayer,
            anonymous,
            guestPayer,
            legalAcceptances: hasSession ? undefined : acceptancesFrom('guest', consents),
          }).catch(() => undefined);
        }}
      >
        {submitting ? 'Procesando…' : `Donar a ${organizationName}`}
      </Button>
    </div>
  );
}
