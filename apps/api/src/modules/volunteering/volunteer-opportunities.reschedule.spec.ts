import {
  describeOpportunityDates,
  describeSessionDays,
  hoursLeftOutside,
} from './volunteer-opportunities.service';
import { generateVolunteerCertificateCode } from './volunteer-certificates.service';
import { formatDay, hoursLabel } from './volunteer-certificate-pdf';
import { isVolunteerCertificateCode } from '@adoptafacil/contracts';

describe('reprogramar una jornada', () => {
  it('no deja por fuera horas ya registradas (fuera de fechas o de los días)', () => {
    expect(
      hoursLeftOutside(['2026-11-08'], '2026-11-01', '2026-11-30', ['2026-11-08', '2026-11-15']),
    ).toBeNull();
    expect(hoursLeftOutside(['2026-11-08'], '2026-11-10', '2026-11-30', [])).toBe('2026-11-08');
    expect(hoursLeftOutside(['2026-11-08'], '2026-11-01', '2026-11-30', ['2026-11-15'])).toBe(
      '2026-11-08',
    );
    expect(hoursLeftOutside([], '2026-11-10', '2026-11-12', ['2026-11-11'])).toBeNull();
  });

  it('describe las fechas y los días para el correo', () => {
    expect(
      describeOpportunityDates(new Date('2026-11-22T00:00:00Z'), new Date('2026-11-22T00:00:00Z')),
    ).toBe('el 22 de noviembre de 2026');
    expect(
      describeOpportunityDates(new Date('2026-11-22T00:00:00Z'), new Date('2026-11-23T00:00:00Z')),
    ).toContain('del 22 de noviembre');
    expect(describeSessionDays([])).toBe('todos los días de la convocatoria');
  });
});

describe('certificado verificable', () => {
  it('genera códigos públicos con el formato que verifica la página pública', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateVolunteerCertificateCode()));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(isVolunteerCertificateCode(code)).toBe(true);
    expect(isVolunteerCertificateCode('vol-0123abcd-0123abcd')).toBe(true);
    expect(isVolunteerCertificateCode('ADF-REP-1')).toBe(false);
  });

  it('un día guardado a medianoche UTC se imprime ese mismo día (no el anterior)', () => {
    expect(formatDay('2026-11-03T00:00:00.000Z')).toBe('3 de noviembre de 2026');
    expect(hoursLabel(1)).toBe('1 hora');
    expect(hoursLabel(6.5)).toBe('6,5 horas');
  });
});
