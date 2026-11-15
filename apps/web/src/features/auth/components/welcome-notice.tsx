import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { takeWelcome, useSession, type WelcomeNote } from '../../../shell/auth';

const FIRST_STEPS: ReadonlyArray<{ to: string; label: string }> = [
  { to: '/adoptar', label: 'Conocer animales en adopción' },
  { to: '/campanas', label: 'Apoyar una campaña' },
  { to: '/voluntariados', label: 'Inscribirte a una jornada' },
  { to: '/recursos', label: 'Ofrecer lo que tienes' },
];

/**
 * Aviso de una sola vez al terminar de entrar (por correo, Google o registro):
 * da la bienvenida a quien acaba de crear su cuenta y le dice en qué seguimos
 * (la acción que lo trajo) o, si llegó sin una, por dónde empezar. Los datos
 * que falten para esa acción se piden en ese momento, no antes.
 */
export function WelcomeNotice() {
  const { user, isAuthenticated } = useSession();
  const location = useLocation();
  const [note, setNote] = useState<WelcomeNote | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const next = takeWelcome();
    if (next) setNote(next);
  }, [isAuthenticated, location.key]);

  if (!note || !user) return null;
  const firstName = user.name?.trim().split(/\s+/)[0] || '';
  const close = () => setNote(null);

  return (
    <div
      role="status"
      data-testid="welcome-notice"
      className="fixed inset-x-4 top-20 z-50 mx-auto max-w-md rounded-2xl border border-primary/30 bg-background p-4 shadow-xl sm:right-6 sm:left-auto sm:mx-0"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="text-2xl">
          🐾
        </span>
        <div className="flex-1 space-y-1 text-sm">
          <p className="text-base font-semibold text-foreground">
            {note.isNew
              ? `¡Te damos la bienvenida a AdoptaFácil${firstName ? `, ${firstName}` : ''}!`
              : `Listo${firstName ? `, ${firstName}` : ''}: ya entraste.`}
          </p>
          {note.intentLabel ? (
            <p className="text-muted-foreground">
              Seguimos donde ibas: <strong className="text-foreground">{note.intentLabel}</strong>.
              {note.isNew && ' Si para eso nos falta algún dato tuyo, te lo pediremos en ese paso.'}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Tu cuenta ya está lista. Puedes empezar por aquí:
              </p>
              <ul className="mt-2 grid gap-1.5">
                {FIRST_STEPS.map((step) => (
                  <li key={step.to}>
                    <Link
                      to={step.to}
                      onClick={close}
                      className="font-medium text-primary hover:underline"
                    >
                      {step.label} →
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar aviso"
          className="rounded-md px-2 text-lg leading-none text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      </div>
    </div>
  );
}
