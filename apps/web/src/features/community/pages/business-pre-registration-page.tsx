import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ServiceCategory,
  SERVICE_CATEGORIES,
  type CommunityPreRegistrationInput,
} from '@adoptafacil/contracts';
import { Button } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { submitCommunityPreRegistration } from '../api/pre-registration';
import { SERVICE_CATEGORY_LABELS } from '../model/directory-view';

type Kind = CommunityPreRegistrationInput['kind'];
type Category = CommunityPreRegistrationInput['category'];

const KIND_OPTIONS: ReadonlyArray<{ value: Kind; label: string }> = [
  { value: 'commerce', label: 'Comercio o establecimiento' },
  { value: 'professional', label: 'Profesional independiente' },
];

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

/**
 * `/servicios/prerregistro`: un comercio o profesional deja su interés en
 * aparecer en la Comunidad. Sin cuenta ni inicio de sesión: en este MVP solo
 * capturamos el registro para contactarlo cuando la vitrina esté lista.
 */
export function BusinessPreRegistrationPage() {
  const [kind, setKind] = useState<Kind>('commerce');
  const [category, setCategory] = useState<Category>(ServiceCategory.Veterinary);
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!consent) {
      setError('Necesitamos tu autorización para tratar tus datos antes de enviar.');
      return;
    }
    setSubmitting(true);
    try {
      await submitCommunityPreRegistration({
        kind,
        businessName: businessName.trim(),
        category,
        city: city.trim(),
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim() || undefined,
        message: message.trim() || undefined,
        consent: true,
      });
      setReceived(true);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'No pudimos guardar tu registro. Inténtalo de nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <PublicNavbar />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Quiero que mi negocio aparezca</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Si tienes una veterinaria, peluquería, paseos, tienda o eres un profesional que cuida
          animales, deja aquí tus datos. <strong>No necesitas crear una cuenta.</strong> Usaremos
          este registro solo para contactarte cuando la vitrina de la Comunidad esté lista para tu
          negocio.
        </p>

        {received ? (
          <section
            className="mt-8 rounded-xl border border-border bg-card p-6"
            aria-live="polite"
            data-testid="pre-registration-received"
          >
            <h2 className="text-lg font-semibold">¡Gracias! Tu interés quedó registrado.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Te escribiremos al correo que nos diste. Mientras tanto, puedes conocer a la comunidad
              y sus servicios.
            </p>
            <Link
              to="/servicios"
              className="mt-4 inline-block text-sm font-medium text-primary underline"
            >
              Ver el directorio de servicios
            </Link>
          </section>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
            <fieldset>
              <legend className="text-sm font-medium">¿Qué eres?</legend>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                {KIND_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="kind"
                      value={option.value}
                      checked={kind === option.value}
                      onChange={() => setKind(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="pre-category" className="text-sm font-medium">
                ¿Qué ofreces?
              </label>
              <select
                id="pre-category"
                className={`${inputClass} mt-1`}
                value={category}
                onChange={(event) => setCategory(event.target.value as Category)}
              >
                {SERVICE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {SERVICE_CATEGORY_LABELS[value]}
                  </option>
                ))}
                <option value="other">Otro servicio</option>
              </select>
            </div>

            <div>
              <label htmlFor="pre-business" className="text-sm font-medium">
                Nombre del negocio o tu nombre profesional
              </label>
              <input
                id="pre-business"
                className={`${inputClass} mt-1`}
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                maxLength={120}
                required
              />
            </div>

            <div>
              <label htmlFor="pre-city" className="text-sm font-medium">
                Ciudad o municipio
              </label>
              <input
                id="pre-city"
                className={`${inputClass} mt-1`}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                maxLength={80}
                required
              />
            </div>

            <div>
              <label htmlFor="pre-contact-name" className="text-sm font-medium">
                Tu nombre de contacto
              </label>
              <input
                id="pre-contact-name"
                className={`${inputClass} mt-1`}
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                maxLength={120}
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label htmlFor="pre-email" className="text-sm font-medium">
                Correo de contacto
              </label>
              <input
                id="pre-email"
                type="email"
                className={`${inputClass} mt-1`}
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                maxLength={200}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label htmlFor="pre-phone" className="text-sm font-medium">
                Teléfono o WhatsApp (opcional)
              </label>
              <input
                id="pre-phone"
                type="tel"
                className={`${inputClass} mt-1`}
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                maxLength={30}
                autoComplete="tel"
              />
            </div>

            <div>
              <label htmlFor="pre-message" className="text-sm font-medium">
                Algo que quieras contarnos (opcional)
              </label>
              <textarea
                id="pre-message"
                className={`${inputClass} mt-1 min-h-24`}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={500}
              />
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                Autorizo a AdoptaFácil a usar estos datos para contactarme sobre mi inclusión en la
                Comunidad, según su{' '}
                <Link to="/legal/politica-de-datos" className="underline">
                  Política de datos
                </Link>
                .
              </span>
            </label>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Quiero aparecer en la Comunidad'}
            </Button>
          </form>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
