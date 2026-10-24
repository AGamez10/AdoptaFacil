import type { AdoptionDelivery } from '@adoptafacil/contracts';
import { Card, CardContent } from '@adoptafacil/ui';
import {
  DELIVERY_ITEM_LABELS,
  IDENTIFICATION_LABELS,
  RECORD_CLINICAL_LABELS,
  formatBogotaDate,
  upcomingDoses,
} from '../model/adoptions-delivery-view';

const SEX_LABELS: Record<string, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sin definir',
};

/**
 * Ficha del animal que recibe el adoptante (copia sellada al confirmar la
 * entrega): identificación, próximas dosis, historial clínico relevante y
 * comportamiento. Sin notas internas ni datos del equipo de la organización.
 */
export function AnimalRecordCard({ delivery }: { delivery: AdoptionDelivery }) {
  const { record } = delivery;
  const headingId = `record-${delivery.id}`;
  const doses = upcomingDoses(record);
  return (
    <Card aria-labelledby={headingId}>
      <CardContent className="space-y-4 pt-6 text-sm">
        <div>
          <h2 id={headingId} className="text-lg font-semibold">
            {record.animal.name}
          </h2>
          <p className="text-muted-foreground">
            {[SEX_LABELS[record.animal.sex] ?? record.animal.sex, record.animal.breed]
              .filter(Boolean)
              .join(' · ')}
            {delivery.confirmedAt &&
              ` · En casa desde el ${formatBogotaDate(delivery.confirmedAt)}`}
            {` · Entregado por ${record.organizationName}`}
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {record.identification && (
            <div>
              <dt className="font-medium">Identificación</dt>
              <dd>
                {IDENTIFICATION_LABELS[record.identification.type]}
                {record.identification.number && ` ${record.identification.number}`}
              </dd>
            </div>
          )}
          {record.sterilized !== undefined && (
            <div>
              <dt className="font-medium">Esterilización</dt>
              <dd>
                {record.sterilized
                  ? 'Esterilizado'
                  : record.sterilizationCommitmentMonths
                    ? `Pendiente: tienes ${record.sterilizationCommitmentMonths} meses para hacerla`
                    : 'Pendiente, según indique el veterinario'}
              </dd>
            </div>
          )}
          <div>
            <dt className="font-medium">Estado al entregar</dt>
            <dd>
              {delivery.details.healthStatus} · {delivery.details.weightKg} kg
            </dd>
          </div>
          {delivery.details.items.length > 0 && (
            <div>
              <dt className="font-medium">Recibiste</dt>
              <dd>{delivery.details.items.map((i) => DELIVERY_ITEM_LABELS[i]).join(', ')}</dd>
            </div>
          )}
        </dl>

        {doses.length > 0 && (
          <section>
            <h3 className="font-medium">Próximas dosis</h3>
            <ul className="list-disc pl-5">
              {doses.map((d) => (
                <li key={`${d.type}-${d.dueAt}`}>
                  {RECORD_CLINICAL_LABELS[d.type] ?? d.type}: {formatBogotaDate(d.dueAt)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {record.clinical.length > 0 && (
          <section>
            <h3 className="font-medium">Historial clínico</h3>
            <ul className="list-disc pl-5">
              {record.clinical.map((c, index) => (
                <li key={`${c.type}-${c.occurredAt}-${index}`}>
                  {RECORD_CLINICAL_LABELS[c.type] ?? c.type} · {formatBogotaDate(c.occurredAt)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {record.behavior && (
          <section>
            <h3 className="font-medium">Comportamiento</h3>
            <p>
              {record.behavior.biteHistory
                ? `Tiene antecedentes de mordida${record.behavior.biteHistoryDetail ? `: ${record.behavior.biteHistoryDetail}` : '.'}`
                : 'Sin antecedentes de mordida.'}
            </p>
            {record.behavior.reactivityNotes && <p>{record.behavior.reactivityNotes}</p>}
            {record.behavior.medicalConditionsRelevant && (
              <p>{record.behavior.medicalConditionsRelevant}</p>
            )}
          </section>
        )}

        <p className="break-all text-xs text-muted-foreground">
          Acta de entrega sellada · huella SHA-256 {delivery.contentHash}
        </p>
      </CardContent>
    </Card>
  );
}
