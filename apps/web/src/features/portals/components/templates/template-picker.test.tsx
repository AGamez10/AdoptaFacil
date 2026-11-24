import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { TemplatePicker } from './template-picker';

const IN_SEASON = new Date('2026-12-10T15:00:00Z');
const OUT_OF_SEASON = new Date('2027-02-10T15:00:00Z');

function renderPicker(props: Partial<Parameters<typeof TemplatePicker>[0]> = {}) {
  return render(
    <MemoryRouter>
      <TemplatePicker value="clasica" onChange={() => undefined} {...props} />
    </MemoryRouter>,
  );
}

describe('selector de plantillas: Navidad de temporada', () => {
  it('en temporada aparece primero en la sección Pro con sus fechas', () => {
    renderPicker({ now: IN_SEASON });
    const option = screen.getByTestId('template-option-navidad');
    expect(option).toHaveTextContent('Pro');
    expect(screen.getByTestId('template-season-navidad')).toHaveTextContent(
      'del 20 de noviembre al 7 de enero',
    );
    const pro = screen.getByTestId('template-group-pro');
    expect(pro.querySelector('[data-testid^="template-option-"]')).toBe(option);
  });

  it('sin plan se ve bloqueada como las demás Pro', () => {
    renderPicker({ now: IN_SEASON, premiumAvailable: false });
    expect(screen.getByTestId('template-option-navidad')).toHaveAttribute('data-locked', 'true');
  });

  it('fuera de temporada no se ofrece y, si estaba elegida, avisa que el portal volvió a la Clásica', () => {
    renderPicker({ now: OUT_OF_SEASON });
    expect(screen.queryByTestId('template-option-navidad')).not.toBeInTheDocument();
    expect(screen.queryByTestId('template-season-ended')).not.toBeInTheDocument();

    renderPicker({ now: OUT_OF_SEASON, outOfSeasonTemplate: 'navidad' });
    expect(screen.getByTestId('template-season-ended')).toHaveTextContent(
      /Terminó la temporada de Navidad/,
    );
  });
});
