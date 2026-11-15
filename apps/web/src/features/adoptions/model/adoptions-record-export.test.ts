import { describe, expect, it } from 'vitest';
import type { AdoptionDelivery } from '@adoptafacil/contracts';
import { dosesToIcs, recordAgeLabel, recordShareText } from './adoptions-record-export';

function delivery(over: Record<string, unknown> = {}, animal: Record<string, unknown> = {}) {
  return {
    id: 'dl-1',
    createdAt: '2026-10-01T15:00:00.000Z',
    confirmedAt: '2026-10-02T15:00:00.000Z',
    record: {
      organizationName: 'Refugio Demo',
      animal: { id: 'a1', name: 'Chorizo', species: 'dog', sex: 'male', ...animal },
      clinical: [
        {
          type: 'vaccine',
          occurredAt: '2026-09-01T15:00:00.000Z',
          nextDueDate: '2027-09-01T15:00:00.000Z',
        },
        { type: 'treatment', occurredAt: '2026-08-01T15:00:00.000Z' },
      ],
    },
    ...over,
  } as unknown as AdoptionDelivery;
}

describe('ficha digital exportable (puntos 16 y 17)', () => {
  it('calcula la edad de hoy, exacta o aproximada', () => {
    const now = new Date('2026-11-15T12:00:00.000Z');
    expect(recordAgeLabel(delivery({}, { birthDate: '2023-05-10' }), now)).toBe('3 años');
    expect(recordAgeLabel(delivery({}, { approximateAgeMonths: 7 }), now)).toBe('Unos 8 meses');
    expect(recordAgeLabel(delivery(), now)).toBeNull();
  });

  it('el texto para compartir no lleva datos personales y nombra la próxima dosis', () => {
    const text = recordShareText(delivery());
    expect(text).toContain('Chorizo');
    expect(text).toContain('Refugio Demo');
    expect(text).toContain('Próxima dosis: Vacuna');
  });

  it('exporta las próximas dosis como calendario con recordatorio una semana antes', () => {
    const ics = dosesToIcs(delivery(), new Date('2026-11-15T12:00:00.000Z')) ?? '';
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270901');
    expect(ics).toContain('SUMMARY:Vacuna de Chorizo');
    expect(ics).toContain('TRIGGER:-P7D');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it('sin próximas dosis no hay calendario que exportar', () => {
    const none = delivery();
    none.record.clinical = [];
    expect(dosesToIcs(none)).toBeNull();
  });
});
