import { Fragment, type ReactNode } from 'react';

/**
 * Renderizador mínimo del Markdown de los textos legales: títulos, párrafos,
 * listas, citas, tablas, **negrita**, `código` y [enlaces](url). Construye
 * elementos React (nunca `innerHTML`), así que el texto no puede inyectar HTML.
 * Cubre solo lo que usan los documentos de `docs/legal`.
 */
export function LegalMarkdown({ markdown }: { markdown: string }) {
  return <div className="space-y-4 text-sm leading-relaxed">{renderBlocks(markdown)}</div>;
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] };

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const text: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        text.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', text: text.join(' ') });
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const [header, separator, ...body] = rows;
      const isSeparator = separator?.every((c) => /^:?-{3,}:?$/.test(c));
      blocks.push({ kind: 'table', header, rows: isSeparator ? body : rows.slice(1) });
      continue;
    }
    const listItem = /^\s*(-|\d+\.)\s+(.*)$/.exec(line);
    if (listItem) {
      const ordered = listItem[1] !== '-';
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*(-|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (!m || (m[1] !== '-') === !ordered) break;
        items.push(m[2]);
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const text: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4}\s|>|\s*\||\s*(-|\d+\.)\s)/.test(lines[i])
    ) {
      text.push(lines[i].trim());
      i++;
    }
    blocks.push({ kind: 'paragraph', text: text.join(' ') });
  }
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|⟦[^⟧]+⟧)/g;

/** Negrita, código, enlaces y los marcadores ⟦pendientes⟧ resaltados. */
export function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-muted px-1 text-xs">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      // Solo rutas internas o https: nunca `javascript:` ni otros esquemas.
      const href = /^(\/|https:\/\/)/.test(link[2]) ? link[2] : undefined;
      return (
        <a key={index} href={href} className="text-primary underline underline-offset-2">
          {link[1]}
        </a>
      );
    }
    if (part.startsWith('⟦') && part.endsWith('⟧')) {
      return (
        <mark key={index} className="rounded bg-amber-100 px-1 text-amber-900">
          {part}
        </mark>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function renderBlocks(markdown: string): ReactNode[] {
  return parseBlocks(markdown).map((block, index) => {
    switch (block.kind) {
      case 'heading': {
        if (block.level === 1) {
          return (
            <h1 key={index} className="text-2xl font-semibold tracking-tight">
              {renderInline(block.text)}
            </h1>
          );
        }
        if (block.level === 2) {
          return (
            <h2 key={index} className="pt-4 text-lg font-semibold">
              {renderInline(block.text)}
            </h2>
          );
        }
        return (
          <h3 key={index} className="pt-2 font-semibold">
            {renderInline(block.text)}
          </h3>
        );
      }
      case 'quote':
        return (
          <aside
            key={index}
            role="note"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900"
          >
            {renderInline(block.text)}
          </aside>
        );
      case 'list': {
        const items = block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>);
        return block.ordered ? (
          <ol key={index} className="list-decimal space-y-1 pl-6">
            {items}
          </ol>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-6">
            {items}
          </ul>
        );
      }
      case 'table':
        return (
          <div key={index} className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr>
                  {block.header.map((cell, j) => (
                    <th key={j} className="border-b border-border p-2 font-semibold">
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, j) => (
                      <td key={j} className="border-b border-border p-2 align-top">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return (
          <p key={index} className="text-foreground/90">
            {renderInline(block.text)}
          </p>
        );
    }
  });
}
