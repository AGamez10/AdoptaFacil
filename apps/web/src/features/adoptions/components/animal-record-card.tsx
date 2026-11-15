import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdoptionDelivery } from '@adoptafacil/contracts';
import { Button, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import {
  DELIVERY_ITEM_LABELS,
  IDENTIFICATION_LABELS,
  RECORD_CLINICAL_LABELS,
  formatBogotaDate,
  upcomingDoses,
} from '../model/adoptions-delivery-view';
import {
  dosesToIcs,
  recordAgeLabel,
  recordShareText,
  recordSpeciesLabel,
} from '../model/adoptions-record-export';

const SEX_LABELS: Record<string, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sin definir',
};

/**
 * Al imprimir (o "Guardar como PDF") solo sale la ficha elegida, a página
 * completa: el resto de la aplicación se oculta mientras dura la impresión.
 */
const PRINT_CSS = `
@media print {
  body[data-print-record] * { visibility: hidden !important; }
  body[data-print-record] [data-record-print="on"],
  body[data-print-record] [data-record-print="on"] * { visibility: visible !important; }
  body[data-print-record] [data-record-print="on"] {
    position: absolute; inset: 0 auto auto 0; width: 100%;
    box-shadow: none !important; border: 0 !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  body[data-print-record] [data-record-noprint] { display: none !important; }
}`;

function PawMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <ellipse cx="6" cy="10" rx="2" ry="2.6" />
      <ellipse cx="10" cy="6" rx="2" ry="2.6" />
      <ellipse cx="14.5" cy="6" rx="2" ry="2.6" />
      <ellipse cx="18.5" cy="10" rx="2" ry="2.6" />
      <path d="M12.2 11c-2.7 0-5.2 3-5.2 5.4 0 1.7 1.3 2.6 2.8 2.6 1 0 1.6-.5 2.4-.5s1.4.5 2.4.5c1.5 0 2.8-.9 2.8-2.6 0-2.4-2.5-5.4-5.2-5.4z" />
    </svg>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

/**
 * Ficha digital del animal para su nueva familia (copia sellada al confirmar la
 * entrega): quién es, desde cuándo está en casa, sus próximas dosis, su
 * historial y su carácter. Pensada para verse bien en el celular y para
 * llevársela: se guarda como PDF, se comparte y sus dosis van al calendario.
 * Sin notas internas ni datos del equipo de la organización.
 */
export function AnimalRecordCard({ delivery }: { delivery: AdoptionDelivery }) {
  const client = useApiClient();
  const { toast } = useToast();
  const { record } = delivery;
  const headingId = `record-${delivery.id}`;
  const doses = upcomingDoses(record);
  const age = recordAgeLabel(delivery);
  const [printing, setPrinting] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // La foto de la entrega es privada: se pide con la sesión. Si esta cuenta no
  // puede verla, la ficha muestra la huella y sigue completa.
  const photoRef = delivery.details.photoRef;
  useEffect(() => {
    if (!photoRef) return;
    let active = true;
    let url: string | null = null;
    client
      .requestBlob(`/storage/private?key=${encodeURIComponent(photoRef)}`)
      .then((blob) => {
        if (!active || !blob.type.startsWith('image/')) return;
        url = URL.createObjectURL(blob);
        setPhotoUrl(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (url) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* limpieza de mejor esfuerzo */
        }
      }
    };
  }, [client, photoRef]);

  const print = () => {
    setPrinting(true);
    document.body.setAttribute('data-print-record', delivery.id);
    const done = () => {
      document.body.removeAttribute('data-print-record');
      setPrinting(false);
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    // Deja que React marque la ficha antes de abrir el diálogo de impresión.
    window.setTimeout(() => {
      try {
        window.print();
      } catch {
        done();
      }
    }, 50);
  };

  const share = async () => {
    const text = recordShareText(delivery);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `Ficha de ${record.animal.name}`, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast({ title: 'Resumen copiado', description: 'Pégalo en el chat que quieras.' });
    } catch (error) {
      // Cerrar el menú de compartir no es un error.
      if ((error as { name?: string })?.name === 'AbortError') return;
      toast({ title: 'No se pudo compartir', variant: 'destructive' });
    }
  };

  const downloadCalendar = () => {
    const ics = dosesToIcs(delivery);
    if (!ics) return;
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `dosis-${record.animal.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const subtitle = [
    recordSpeciesLabel(record.animal.species),
    SEX_LABELS[record.animal.sex] ?? record.animal.sex,
    record.animal.breed,
    age,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article
      aria-labelledby={headingId}
      data-record-print={printing ? 'on' : 'off'}
      className="overflow-hidden rounded-2xl border border-border bg-card text-sm shadow-sm"
    >
      <style>{PRINT_CSS}</style>

      {/* --- Portada --- */}
      <header className="relative overflow-hidden bg-[hsl(var(--navy))] px-5 py-6 text-white sm:px-8">
        <PawMark className="pointer-events-none absolute -right-4 -top-6 h-32 w-32 rotate-12 text-white/10" />
        <div className="relative flex flex-wrap items-center gap-4">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={`${record.animal.name} con su nueva familia`}
              className="h-24 w-24 shrink-0 rounded-full border-4 border-[var(--brand)] object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-[var(--brand)] bg-white/10"
            >
              <PawMark className="h-12 w-12 text-[var(--brand)]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-[var(--brand)]">
              Ficha digital
            </p>
            <h2 id={headingId} className="break-words text-3xl font-semibold leading-tight">
              {record.animal.name}
            </h2>
            <p className="text-white/80">{subtitle}</p>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2 text-xs">
          {delivery.confirmedAt && (
            <span className="rounded-full bg-[var(--brand)] px-3 py-1 font-semibold text-[hsl(var(--navy))]">
              En casa desde el {formatBogotaDate(delivery.confirmedAt)}
            </span>
          )}
          <span className="rounded-full bg-white/10 px-3 py-1">
            Adoptado con {record.organizationName}
          </span>
        </div>
      </header>

      <div className="space-y-6 px-5 py-6 sm:px-8">
        {/* --- Próximas dosis: lo que más importa en casa --- */}
        {doses.length > 0 && (
          <section className="rounded-xl bg-[var(--brand-light)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Próximas dosis</h3>
              <Button size="sm" variant="outline" data-record-noprint onClick={downloadCalendar}>
                Agregar a mi calendario
              </Button>
            </div>
            <ul className="mt-2 space-y-1.5">
              {doses.map((d) => (
                <li key={`${d.type}-${d.dueAt}`} className="flex flex-wrap justify-between gap-x-4">
                  <span>{RECORD_CLINICAL_LABELS[d.type] ?? d.type}</span>
                  <span className="font-semibold">{formatBogotaDate(d.dueAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* --- Datos de un vistazo --- */}
        <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
          {record.identification && (
            <Fact label="Identificación">
              {IDENTIFICATION_LABELS[record.identification.type]}
              {record.identification.number && ` ${record.identification.number}`}
            </Fact>
          )}
          {record.sterilized !== undefined && (
            <Fact label="Esterilización">
              {record.sterilized
                ? 'Esterilizado'
                : record.sterilizationCommitmentMonths
                  ? `Pendiente: tienes ${record.sterilizationCommitmentMonths} meses para hacerla`
                  : 'Pendiente, según indique el veterinario'}
            </Fact>
          )}
          <Fact label="Peso al llegar a casa">{delivery.details.weightKg} kg</Fact>
          <Fact label="Salud al llegar a casa">{delivery.details.healthStatus}</Fact>
        </dl>

        {/* --- Historial clínico como línea de tiempo --- */}
        {record.clinical.length > 0 && (
          <section>
            <h3 className="font-semibold">Historial clínico</h3>
            <ol className="mt-3 space-y-3 border-l-2 border-[var(--brand-light)] pl-4">
              {record.clinical.map((c, index) => (
                <li key={`${c.type}-${c.occurredAt}-${index}`} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--brand)]"
                  />
                  <p className="font-medium">{RECORD_CLINICAL_LABELS[c.type] ?? c.type}</p>
                  <p className="text-xs text-muted-foreground">{formatBogotaDate(c.occurredAt)}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {record.behavior && (
          <section>
            <h3 className="font-semibold">Carácter y cuidados</h3>
            <div className="mt-1 space-y-1 text-muted-foreground">
              <p>
                {record.behavior.biteHistory
                  ? `Tiene antecedentes de mordida${record.behavior.biteHistoryDetail ? `: ${record.behavior.biteHistoryDetail}` : '.'}`
                  : 'Sin antecedentes de mordida.'}
              </p>
              {record.behavior.reactivityNotes && <p>{record.behavior.reactivityNotes}</p>}
              {record.behavior.medicalConditionsRelevant && (
                <p>{record.behavior.medicalConditionsRelevant}</p>
              )}
            </div>
          </section>
        )}

        {delivery.details.items.length > 0 && (
          <section>
            <h3 className="font-semibold">Llegó a casa con</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {delivery.details.items.map((item) => (
                <li key={item} className="rounded-full border border-border px-3 py-1 text-xs">
                  {DELIVERY_ITEM_LABELS[item]}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* --- Llevársela --- */}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4" data-record-noprint>
          <Button size="sm" onClick={print}>
            Guardar como PDF o imprimir
          </Button>
          <Button size="sm" variant="outline" onClick={() => void share()}>
            Compartir
          </Button>
        </div>

        {/* --- Lo que sigue en la comunidad (punto 17) --- */}
        <nav
          aria-label={`Sigue con ${record.animal.name} en AdoptaFácil`}
          data-record-noprint
          className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]"
        >
          {[
            {
              to: '/mis-seguimientos',
              title: 'Cuéntanos cómo va',
              text: 'Responde los seguimientos con una foto.',
            },
            {
              to: '/comunidad',
              title: 'Comparte su historia',
              text: 'Otras familias adoptantes quieren conocerla.',
            },
            {
              to: '/apadrinar',
              title: 'Ayuda a otro animal',
              text: 'Apadrina a uno que aún espera hogar.',
            },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-xl border border-border px-4 py-3 transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand-light)]"
            >
              <span className="block font-semibold">{item.title} →</span>
              <span className="block text-xs text-muted-foreground">{item.text}</span>
            </Link>
          ))}
        </nav>

        <p className="break-all text-xs text-muted-foreground">
          Acta de entrega sellada · huella SHA-256 {delivery.contentHash}
        </p>
      </div>
    </article>
  );
}
