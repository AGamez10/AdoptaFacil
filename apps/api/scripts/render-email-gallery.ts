/**
 * Renderiza TODOS los correos del catálogo (con sus valores de ejemplo) y el
 * envoltorio genérico de un correo sin plantilla, tal como los arma el envío
 * real (mismo `composeEmail` / `composePlainEmail`). Sirve para revisar el
 * diseño en un navegador o tomar capturas sin levantar la API ni un SMTP.
 *
 *   pnpm --filter @adoptafacil/api exec ts-node --transpile-only scripts/render-email-gallery.ts <carpeta>
 *
 * Escribe un `.html` por correo y un `index.json` con el asunto de cada uno.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMAIL_CATALOG } from '../src/core/notifications/templates/email-catalog';
import { composeEmail, composePlainEmail } from '../src/core/notifications/templates/email-compose';
import { exampleValues } from '../src/core/notifications/templates/email-render';

const out = process.argv[2] ?? 'email-gallery';
const web = 'https://adoptafacil.co';
mkdirSync(out, { recursive: true });
const index: Array<{ file: string; event: string; label: string; subject: string }> = [];

for (const def of EMAIL_CATALOG) {
  const email = composeEmail(def, def.defaults, exampleValues(def.variables), {
    organizationName: def.variables.some((v) => v.name === 'organizacion')
      ? 'Fundación Huellitas de Amor'
      : undefined,
    webBaseUrl: web,
    unsubscribeUrl: def.category === 'bulk' ? `${web}/correo/baja?h=demo&t=demo` : undefined,
  });
  const file = `${def.event}.html`;
  writeFileSync(join(out, file), email.html);
  index.push({ file, event: def.event, label: def.label, subject: email.subject });
}

// Un correo de texto plano sin plantilla (red de seguridad).
const plain = composePlainEmail(
  'Aviso de prueba sin plantilla',
  'Hola,\n\nEste correo lo armó un módulo en texto plano, sin plantilla del catálogo. ' +
    'Igual sale con el diseño de AdoptaFácil.\n\n- Los enlaces sueltos quedan clicables\n- El texto se escapa siempre\n\n' +
    `Más información: ${web}/ayuda`,
  web,
);
writeFileSync(join(out, '_sin-plantilla.html'), plain.html);
index.push({
  file: '_sin-plantilla.html',
  event: '(sin plantilla)',
  label: 'Correo sin plantilla (red de seguridad)',
  subject: plain.subject,
});

writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2));
console.log(`${index.length} correos en ${out}`);
