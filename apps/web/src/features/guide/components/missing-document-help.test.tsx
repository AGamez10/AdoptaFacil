import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DocumentType } from '@adoptafacil/contracts';
import { MissingDocumentHelp } from './missing-document-help';

describe('MissingDocumentHelp (F20, anexo #4)', () => {
  it('starts collapsed and opens the step-by-step with the official contact on click', async () => {
    render(<MissingDocumentHelp type={DocumentType.Rut} />);
    const toggle = screen.getByRole('button', { name: 'No lo tengo todavía' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', { name: '¿Aún no tienes el RUT?' });
    expect(panel).toHaveTextContent('Descarga el PDF del RUT y súbelo aquí');
    const whatsapp = screen.getByTestId('contact-whatsapp');
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573028528926\?text=.*RUT/);
    expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByTestId('contact-email').getAttribute('href')).toMatch(
      /^mailto:adoptafacil\.oficial@gmail\.com\?subject=/,
    );
  });

  it('renders nothing for a document type without a guide', () => {
    const { container } = render(<MissingDocumentHelp type={DocumentType.Other} />);
    expect(container).toBeEmptyDOMElement();
  });
});
