import { useEffect, useState } from 'react';
import type {
  DocumentVerificationCheck,
  DocumentVerificationReport,
  VerificationCheckResult,
} from '@adoptafacil/contracts';
import { Button, Skeleton } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { STATE_NAMES } from './legal-labels';
import styles from './document-verification-panel.module.scss';

const ICON: Record<VerificationCheckResult, string> = {
  pass: '✓',
  warn: '!',
  fail: '✗',
  unknown: '?',
};

const ICON_LABEL: Record<VerificationCheckResult, string> = {
  pass: 'Coincide',
  warn: 'Revisar',
  fail: 'No coincide',
  unknown: 'No encontrado',
};

type Tone = 'ok' | 'warn' | 'bad' | 'manual';

function toneOf(report: DocumentVerificationReport): Tone {
  if (report.suggestion === 'manual') return 'manual';
  if (report.suggestion === 'observe') return 'bad';
  return report.checks.some((c) => c.result !== 'pass') ? 'warn' : 'ok';
}

const HEADLINE: Record<Tone, string> = {
  ok: 'Todo coincide con lo que declaró la organización',
  warn: 'Coincide lo importante; revisa los avisos',
  bad: 'Hay datos que no coinciden',
  manual: 'No pudimos leer el archivo: revísalo a mano',
};

export interface DocumentVerificationPanelProps {
  documentId: string;
  busy: boolean;
  onApprove: (report: DocumentVerificationReport) => void;
  onObserve: (note: string) => void;
}

/**
 * Lectura automática del documento en la revisión de plataforma. Muestra lo que
 * leyó el servidor, cada chequeo en una frase y UNA acción principal con lo
 * sugerido. La persona siempre decide: los botones normales siguen debajo.
 */
export function DocumentVerificationPanel({
  documentId,
  busy,
  onApprove,
  onObserve,
}: DocumentVerificationPanelProps) {
  const client = useApiClient();
  const [report, setReport] = useState<DocumentVerificationReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    client
      .request<DocumentVerificationReport>(`/platform/documents/${documentId}/verification`)
      .then((r) => {
        if (!active) return;
        // Una respuesta sin la forma esperada se trata como "no disponible".
        if (Array.isArray(r?.checks) && Array.isArray(r?.fields)) setReport(r);
        else setFailed(true);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [client, documentId]);

  if (failed) {
    return (
      <p className={styles.unavailable}>
        La lectura automática no está disponible. Revisa el documento a mano.
      </p>
    );
  }
  if (!report) return <Skeleton className="h-24 w-full" />;

  const tone = toneOf(report);
  const issues = report.checks.filter((c) => c.result !== 'pass');
  const passes = report.checks.filter((c) => c.result === 'pass');

  return (
    <section
      className={styles.panel}
      data-tone={tone}
      aria-label="Verificación automática"
      data-testid="verification-panel"
    >
      <header className={styles.panel__head}>
        <p className={styles.panel__headline}>{HEADLINE[tone]}</p>
        {report.suggestedState && (
          <p className={styles.panel__state}>
            Respalda: <strong>{STATE_NAMES[report.suggestedState]}</strong>
          </p>
        )}
      </header>

      {report.fields.length > 0 && (
        <dl className={styles.fields}>
          {report.fields.map((field) => (
            <div key={field.key}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {issues.length > 0 && <CheckList checks={issues} />}
      {passes.length > 0 && (
        <details className={styles.passes}>
          <summary>
            {passes.length} {passes.length === 1 ? 'chequeo coincide' : 'chequeos coinciden'}
          </summary>
          <CheckList checks={passes} />
        </details>
      )}

      <div className={styles.actions}>
        {report.suggestion === 'approve' && (
          <Button disabled={busy} onClick={() => onApprove(report)}>
            Aprobar
          </Button>
        )}
        {report.suggestion === 'observe' && report.suggestedNote && (
          <Button disabled={busy} onClick={() => onObserve(report.suggestedNote!)}>
            Observar con este motivo
          </Button>
        )}
        {report.links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className={styles.link}
          >
            {link.label}
          </a>
        ))}
      </div>
      {report.suggestion === 'observe' && report.suggestedNote && (
        <p className={styles.note}>
          <span>Motivo que recibirá la organización:</span> {report.suggestedNote}
        </p>
      )}
    </section>
  );
}

function CheckList({ checks }: { checks: DocumentVerificationCheck[] }) {
  return (
    <ul className={styles.checks}>
      {checks.map((c) => (
        <li key={c.id} data-result={c.result}>
          <span className={styles.icon} aria-label={ICON_LABEL[c.result]} role="img">
            {ICON[c.result]}
          </span>
          <span>
            <strong>{c.label}.</strong> {c.detail}
          </span>
        </li>
      ))}
    </ul>
  );
}
