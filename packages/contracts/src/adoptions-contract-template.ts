// ============================================================================
// Texto legal del Contrato de Adopción de Animal — FUENTE ÚNICA (api + web).
//
// El PDF que genera la api (`adoption-contract-pdf.ts`) y la vista previa de la
// web (`adoption-contract-page.tsx`) se construyen ambos a partir de
// `buildAdoptionContractDocument`, así el texto que la persona lee en pantalla
// es exactamente el que firma y el que recibe por correo.
//
// VERSIONADO: el texto que se muestra depende de `payload.templateVersion`,
// que entra al sello SHA-256 del contrato. Un contrato ya firmado se sigue
// renderizando con el texto con el que se firmó aunque esta plantilla cambie.
// Para cambiar la redacción: crear `v3`, nunca editar una versión publicada.
//   - `v1`: texto original del cliente (docs/Contrato de Adopción.pdf). Se
//     conserva literal, incluidos sus defectos, para los contratos ya
//     firmados con él.
//   - `v2`: texto revisado (octubre 2026). Ver docs/legal/contrato-adopcion-v2.md
//     para las fuentes y los puntos que debe validar el abogado.
//
// Solo funciones puras y strings: sin dependencias de runtime (el paquete se
// compila dual ESM + CJS).
// ============================================================================

import type {
  AdopterDocumentType,
  AdoptionContractData,
  AdoptionContractPayload,
  AdoptionContractSigner,
  AdoptionContractTemplateVersion,
  AdoptionFollowUpPlan,
  AdoptionSignerRole,
  AnimalIdentificationType,
} from './adoptions';

/** Un bloque de contenido del contrato, independiente del medio (PDF/HTML). */
export type AdoptionContractBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'clause'; title: string; text: string }
  | { kind: 'fields'; fields: Array<{ label: string; value: string }> };

export interface AdoptionContractSection {
  heading: string;
  blocks: AdoptionContractBlock[];
}

export interface AdoptionContractDocument {
  title: string;
  templateVersion: AdoptionContractTemplateVersion;
  sections: AdoptionContractSection[];
  /** Ciudad para la línea "Firmado en ___, el ___". */
  signatureCity: string;
  /** Etiqueta que va sobre cada línea de firma, por rol. */
  signerLabels: Record<AdoptionSignerRole, string>;
}

/** Marcador visible para un dato que la organización aún no diligenció. */
export const CONTRACT_BLANK = '______';

function blank(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return CONTRACT_BLANK;
  const text = String(value).trim();
  return text === '' ? CONTRACT_BLANK : text;
}

const SEX_LABELS: Record<string, string> = {
  male: 'Macho',
  female: 'Hembra',
  unknown: 'Sin especificar',
};
const SPECIES_LABELS: Record<string, string> = { dog: 'Perro', cat: 'Gato', other: 'Otro' };

export const ADOPTER_DOCUMENT_TYPE_LABELS: Record<AdopterDocumentType, string> = {
  CC: 'cédula de ciudadanía',
  CE: 'cédula de extranjería',
  PPT: 'Permiso por Protección Temporal',
  PA: 'pasaporte',
};

export const ANIMAL_IDENTIFICATION_LABELS: Record<AnimalIdentificationType, string> = {
  microchip: 'Microchip',
  tag: 'Placa de identificación',
  none: 'Sin identificación física',
};

export const FOLLOW_UP_PLAN_LABELS: Record<AdoptionFollowUpPlan, string> = {
  light: 'Ligero',
  standard: 'Acompañado',
};

const FOLLOW_UP_PLAN_MILESTONES: Record<AdoptionFollowUpPlan, string> = {
  light: 'al mes, a los cuatro (4) meses y a los doce (12) meses',
  standard: 'a los quince (15) días, al mes, a los cuatro (4) meses y a los doce (12) meses',
};

function animalFields(payload: AdoptionContractPayload): Array<{ label: string; value: string }> {
  const { data, animal } = payload;
  return [
    {
      label: 'Especie y raza',
      value: `${SPECIES_LABELS[animal.species] ?? animal.species} — ${blank(data.animalBreed)}`,
    },
    { label: 'Nombre', value: blank(animal.name) },
    {
      label: 'Sexo',
      value: data.animalSex ? (SEX_LABELS[data.animalSex] ?? data.animalSex) : CONTRACT_BLANK,
    },
    {
      label: 'Edad aproximada',
      value: data.animalAgeYears !== undefined ? `${data.animalAgeYears} años` : CONTRACT_BLANK,
    },
    { label: 'Peso', value: data.weightKg !== undefined ? `${data.weightKg} kg` : CONTRACT_BLANK },
    {
      label: 'Estado de salud al momento de la entrega',
      value: blank(data.healthStatusAtDelivery),
    },
  ];
}

// ---------------------------------------------------------------------------
// v1 — texto original, LITERAL (no corregir: es lo que se firmó con él).
// ---------------------------------------------------------------------------

const V1_FUNDAMENTO_LEGAL =
  'Este contrato se celebra en cumplimiento del Estatuto Nacional de Protección de los ' +
  'Animales (Ley 84 de 1989) y sus modificaciones posteriores. La Ley 84/1989 dispone que ' +
  '"los animales tendrán en todo el territorio nacional especial protección contra el ' +
  'sufrimiento y el dolor, causados directa o indirectamente por el hombre". Su artículo 5 ' +
  'enumera los deberes del propietario (ahora adoptante): suministrar alimento, agua, ' +
  'condiciones de habitabilidad (espacio, ventilación, abrigo) y atención médica al animal ' +
  'para asegurar su salud y bienestar. La Ley 1774 de 2016 incorporó a los animales como ' +
  '"seres sintientes" y reforzó estas protecciones. Más recientemente, la Ley 2455 de 2025 ' +
  '("Ley Ángel") actualizó las sanciones por maltrato y prohibió que personas condenadas por ' +
  'crueldad animal puedan adoptar o tener animales por el doble de su pena. Con este marco, ' +
  'las partes acuerdan el presente contrato de adopción con efectos jurídicos.';

const V1_OBLIGACIONES: Array<{ title: string; body: string }> = [
  {
    title: 'Cuidados básicos',
    body:
      'Proporcionar diariamente alimento de calidad, agua limpia, atención veterinaria ' +
      '(vacunaciones, desparasitaciones, medicamentos) y un refugio apropiado contra el ' +
      'clima. Todo ello debe hacerse con el fin de "asegurar su salud, bienestar y para ' +
      'evitarle daño, enfermedad o muerte".',
  },
  {
    title: 'Condiciones de alojamiento',
    body:
      'Mantener al animal en un entorno higiénico y seguro, con espacio suficiente. En caso ' +
      'de animales domésticos, debe evitarse mantenerlos confinados de forma extrema que los ' +
      'exponga a sufrimiento.',
  },
  {
    title: 'Identificación y control',
    body:
      'Pasear al animal con correa cuando esté fuera del hogar, colocarle placa de ' +
      'identificación o microchip y no permitir que se pierda o escape. El adoptante debe ' +
      'notificar de inmediato al cedente si la mascota se extravía, se enferma gravemente o ' +
      'fallece.',
  },
  {
    title: 'Prohibición de usos indebidos',
    body:
      'Queda expresamente prohibido vender, regalar, alquilar, intercambiar, donar o ceder ' +
      'el animal a terceros sin autorización del cedente. Tampoco podrá usarse para ' +
      'reproducción comercial, peleas, ejercicios de maltrato o espectáculos que impliquen ' +
      'violencia. Cualquier forma de maltrato o explotación es ilícita; las leyes (C.P. arts. ' +
      '339A–339C, Ley 2455/2025) sancionan penalmente infligir "lesiones que menoscaben ' +
      'gravemente la salud o integridad del animal" o causarle la muerte. El adoptante acepta ' +
      'actuar con el respeto que exige la dignidad del ser vivo.',
  },
  {
    title: 'Seguimiento post-adopción',
    body:
      'Durante los primeros {months} meses (plazo pactado), el adoptante permitirá visitas ' +
      'de seguimiento por parte del cedente o sus delegados, previa coordinación. El ' +
      'adoptante enviará fotos e información sobre la adaptación del animal cuando lo ' +
      'requiera el cedente.',
  },
];

const V1_SANCIONES: Array<{ title: string; body: string }> = [
  {
    title: 'Maltrato o abandono',
    body:
      'Se considera abandono y maltrato cualquier acto prohibido por la ley (por ejemplo, ' +
      'dejar al animal desamparado en estado de vejez o enfermedad, o simplemente ' +
      'abandonarlo bajo su custodia). Estos actos constituyen contravención o delito penal. ' +
      'En tal caso, el cedente podrá rescindir el contrato y recuperar la mascota sin ' +
      'responsabilidad alguna, enviándola de inmediato a un refugio o a otro hogar aprobado.',
  },
  {
    title: 'Ruptura de compromiso',
    body:
      'Si el adoptante decide que no puede continuar con la adopción (p. ej. por ' +
      'dificultades económicas o de salud), deberá notificar al cedente y devolver la ' +
      'mascota. El cedente acepta recibirla de regreso para reubicarla adecuadamente.',
  },
  {
    title: 'Responsabilidad civil y penal',
    body:
      'El adoptante asume cualquier responsabilidad legal derivada de sus acciones u ' +
      'omisiones en relación con la mascota. Por ejemplo, acepta que infringir las ' +
      'obligaciones aquí pactadas o las normas legales (como la Ley 84/1989 o el Código ' +
      'Penal modificado) puede implicar sanciones de multa, arresto o inhabilitación.',
  },
];

function buildV1(payload: AdoptionContractPayload): AdoptionContractDocument {
  const { data, applicant } = payload;
  return {
    title: 'CONTRATO DE ADOPCIÓN DE ANIMAL',
    templateVersion: 'v1',
    signatureCity: blank(data.signatureCity),
    signerLabels: {
      organization_representative: 'Por el Cedente (Adopta Fácil)',
      adopter: 'Por el Adoptante',
      witness: 'Testigo',
      co_adopter: 'Responsable firmante',
    },
    sections: [
      { heading: 'FUNDAMENTO LEGAL', blocks: [{ kind: 'paragraph', text: V1_FUNDAMENTO_LEGAL }] },
      {
        heading: 'PARTES',
        blocks: [
          {
            kind: 'paragraph',
            text:
              `Cedente/Entregante: Adopta Fácil (organización protectora de animales), con domicilio ` +
              `en ${blank(data.organizationAddress)} y NIT ${blank(data.organizationNit)}.`,
          },
          {
            kind: 'paragraph',
            text:
              `Adoptante: Sr./Sra. ${blank(applicant.fullName)}, identificado/a con cédula de ` +
              `ciudadanía nº ${blank(data.adopterDocumentNumber)}, con domicilio en ` +
              `${blank(data.adopterAddress)}.`,
          },
        ],
      },
      {
        heading: 'OBJETO',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'El cedente entrega en adopción responsable al adoptante la mascota descrita a ' +
              'continuación, a título gratuito (no es un contrato de compraventa):',
          },
          { kind: 'fields', fields: animalFields(payload) },
          {
            kind: 'paragraph',
            text:
              'El adoptante manifiesta conocer la salud y comportamiento de la mascota según la ' +
              'información proporcionada por el cedente, y acepta cuidarla como miembro de su hogar. ' +
              'Ambas partes reconocen que la adopción es gratuita y que el cedente actuó sin ánimo de ' +
              'lucro; solo se puede pactar una cuota de recuperación de gastos veterinarios (no precio ' +
              'de venta).',
          },
        ],
      },
      {
        heading: 'OBLIGACIONES DEL ADOPTANTE',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Las partes acuerdan que el adoptante asumirá todas las obligaciones inherentes al ' +
              'cuidado y bienestar de la mascota, de conformidad con la Ley 84 de 1989 y normas ' +
              'complementarias:',
          },
          ...V1_OBLIGACIONES.map((c) => ({
            kind: 'clause' as const,
            title: c.title,
            text: c.body.replace('{months}', blank(data.followUpMonths)),
          })),
        ],
      },
      {
        heading: 'SANCIONES POR INCUMPLIMIENTO Y DEVOLUCIÓN',
        blocks: [
          {
            kind: 'paragraph',
            text:
              'Las partes acuerdan que el incumplimiento de estas obligaciones será causa de ' +
              'resolución inmediata del contrato. En particular:',
          },
          ...V1_SANCIONES.map((c) => ({ kind: 'clause' as const, title: c.title, text: c.body })),
        ],
      },
      {
        heading: 'DISPOSICIONES FINALES',
        blocks: [
          {
            kind: 'clause',
            title: 'Vigencia',
            text:
              'Este contrato entra en vigencia en la fecha de su firma y permanecerá vigente mientras ' +
              'dure la tenencia de la mascota por parte del adoptante.',
          },
          {
            kind: 'clause',
            title: 'Jurisdicción',
            text:
              `Para efectos legales, las partes fijan como domicilio la ciudad de ${blank(data.signatureCity)}. Cualquier ` +
              'controversia se resolverá ante los jueces civiles de esta jurisdicción, renunciando a ' +
              'otro fuero.',
          },
          {
            kind: 'clause',
            title: 'Compromiso',
            text:
              'Ambas partes declaran haber leído íntegramente este documento y haber sido informadas ' +
              'de la normativa vigente aplicable (Leyes 84/1989, 1774/2016, 2455/2025, Código Penal, ' +
              'etc.), aceptando su contenido en todas sus partes.',
          },
          ...(payload.terms.trim()
            ? [{ kind: 'clause' as const, title: 'Notas adicionales', text: payload.terms.trim() }]
            : []),
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// v2 — texto revisado. Cada cláusula cita su fuente en
// docs/legal/contrato-adopcion-v2.md; las marcadas allí como "abogado" deben
// validarse antes de usar el contrato con dinero o en litigio.
// ---------------------------------------------------------------------------

const ORDINALS = [
  'PRIMERA',
  'SEGUNDA',
  'TERCERA',
  'CUARTA',
  'QUINTA',
  'SEXTA',
  'SÉPTIMA',
  'OCTAVA',
  'NOVENA',
  'DÉCIMA',
  'UNDÉCIMA',
  'DUODÉCIMA',
  'DECIMOTERCERA',
  'DECIMOCUARTA',
  'DECIMOQUINTA',
  'DECIMOSEXTA',
  'DECIMOSÉPTIMA',
  'DECIMOCTAVA',
  'DECIMONOVENA',
  'VIGÉSIMA',
];

function documentLabel(data: AdoptionContractData): string {
  return data.adopterDocumentType
    ? ADOPTER_DOCUMENT_TYPE_LABELS[data.adopterDocumentType]
    : 'documento de identidad';
}

function identificationValue(data: AdoptionContractData): string {
  if (!data.animalIdentificationType) return CONTRACT_BLANK;
  const label = ANIMAL_IDENTIFICATION_LABELS[data.animalIdentificationType];
  if (data.animalIdentificationType === 'none') return label;
  return `${label} nº ${blank(data.animalIdentificationNumber)}`;
}

function buildV2(
  payload: AdoptionContractPayload,
  signers: readonly AdoptionContractSigner[],
): AdoptionContractDocument {
  const { data, applicant, animal } = payload;
  const org = blank(data.organizationName);
  const representative = signers.find((s) => s.role === 'organization_representative');
  const coAdopters = signers.filter((s) => s.role === 'co_adopter');
  const plan: AdoptionFollowUpPlan = data.followUpPlan ?? 'light';
  const animalName = blank(animal.name);
  const months = blank(data.followUpMonths);
  const city = blank(data.signatureCity);

  const sections: AdoptionContractSection[] = [];
  let n = 0;
  const clause = (title: string, blocks: AdoptionContractBlock[]): void => {
    sections.push({ heading: `CLÁUSULA ${ORDINALS[n] ?? String(n + 1)}. ${title}`, blocks });
    n += 1;
  };
  const p = (text: string): AdoptionContractBlock => ({ kind: 'paragraph', text });
  const item = (title: string, text: string): AdoptionContractBlock => ({
    kind: 'clause',
    title,
    text,
  });

  // --- Partes (sin número, como en la práctica notarial colombiana) ---
  const partes: AdoptionContractBlock[] = [
    p(
      `EL CEDENTE: ${org}, entidad sin ánimo de lucro identificada con NIT ` +
        `${blank(data.organizationNit)}, con domicilio en ${blank(data.organizationAddress)}, ` +
        `representada en este acto por ${representative ? blank(representative.fullName) : CONTRACT_BLANK}, ` +
        'en su calidad de representante legal o persona autorizada según sus estatutos.',
    ),
    p(
      `EL ADOPTANTE: ${blank(applicant.fullName)}, mayor de edad, identificado(a) con ` +
        `${documentLabel(data)} nº ${blank(data.adopterDocumentNumber)}, con domicilio en ` +
        `${blank(data.adopterAddress)}, correo ${blank(applicant.email)}` +
        `${applicant.phone ? ` y celular ${applicant.phone}` : ''}.`,
    ),
  ];
  for (const co of coAdopters) {
    partes.push(
      p(
        `RESPONSABLE FIRMANTE: ${blank(co.fullName)}, mayor de edad, miembro del hogar del ` +
          'adoptante, quien firma este contrato y se obliga solidariamente con el adoptante al ' +
          'cumplimiento de todas sus obligaciones (Código Civil, art. 1568).',
      ),
    );
  }
  partes.push(
    p(
      'AdoptaFácil actúa únicamente como plataforma tecnológica que facilita la gestión, firma ' +
        'electrónica y custodia de este documento. No es parte del contrato, no entrega ni recibe ' +
        'animales y no responde por las obligaciones que aquí asumen el cedente y el adoptante.',
    ),
  );
  sections.push({ heading: 'PARTES', blocks: partes });

  clause('OBJETO Y NATURALEZA', [
    p(
      `El cedente entrega en adopción responsable al adoptante el animal de compañía descrito a ` +
        'continuación, y le transfiere su tenencia y propiedad a título gratuito, sujetas a las ' +
        'cargas y condiciones de este contrato. No es una compraventa.',
    ),
    { kind: 'fields', fields: animalFields(payload) },
    p(
      'Las partes reconocen que el animal es un ser sintiente y no una cosa (Ley 1774 de 2016, ' +
        'arts. 1 y 2, que modificó el art. 655 del Código Civil), y que las cargas de cuidado ' +
        'aquí pactadas son la causa de la entrega gratuita.',
    ),
    p(
      data.recoveryFeeCop && data.recoveryFeeCop > 0
        ? `El adoptante aporta una cuota de recuperación de gastos veterinarios de ` +
            `$${data.recoveryFeeCop.toLocaleString('es-CO')} pesos, que no constituye precio de ` +
            'venta ni da derecho a exigir características del animal distintas de las declaradas.'
        : 'La adopción no tiene costo para el adoptante.',
    ),
  ]);

  clause('ESTADO DEL ANIMAL E IDENTIFICACIÓN', [
    p(
      'El cedente declara que la información de salud y comportamiento entregada es veraz según ' +
        'su conocimiento, y el adoptante declara haberla recibido y entendido, incluido el estado ' +
        'de salud descrito en la cláusula primera.',
    ),
    {
      kind: 'fields',
      fields: [
        { label: 'Identificación del animal', value: identificationValue(data) },
        {
          label: 'Esterilizado',
          value:
            data.animalSterilized === undefined
              ? CONTRACT_BLANK
              : data.animalSterilized
                ? 'Sí'
                : 'No',
        },
      ],
    },
    p(
      data.animalSterilized === false
        ? `El adoptante se obliga a esterilizar al animal ${
            data.sterilizationCommitmentMonths
              ? `dentro de los ${data.sterilizationCommitmentMonths} meses siguientes a la firma`
              : 'cuando el médico veterinario lo indique'
          }, y a enviar al cedente el soporte veterinario.`
        : 'El adoptante mantendrá vigente la identificación del animal y actualizará sus datos de ' +
            'contacto en el registro del microchip o la placa cuando cambien.',
    ),
  ]);

  if (data.trialPeriodDays && data.trialPeriodDays > 0) {
    clause('SEMANA DE PRUEBA PREVIA', [
      p(
        `Las partes dejan constancia de que antes de este contrato el animal convivió con el ` +
          `adoptante durante un periodo de prueba de ${data.trialPeriodDays} días, regido por un ` +
          'acta separada, durante el cual la propiedad permaneció en cabeza del cedente a título ' +
          'de préstamo de uso (comodato, Código Civil art. 2200). Con la firma de este contrato ' +
          'ese periodo termina y el animal queda entregado en adopción.',
      ),
    ]);
  }

  clause('IDENTIDAD Y EDAD DE QUIEN FIRMA', [
    p(
      `El adoptante declara ser mayor de edad${
        data.minimumSignerAge && data.minimumSignerAge > 18
          ? ` y cumplir la edad mínima de ${data.minimumSignerAge} años que exige el cedente para ` +
            'firmar contratos de adopción, o firmar junto con un responsable del hogar que la cumple'
          : ''
      }. ${
        data.identityDocumentVerified
          ? 'El cedente verificó la identidad y la edad con el documento original, sin conservar copia de él.'
          : 'El cedente podrá verificar la identidad y la edad con el documento original.'
      }`,
    ),
    p(
      'El adoptante declara bajo la gravedad del juramento que no ha sido condenado por delitos ' +
        'contra los animales ni tiene vigente la pena de prohibición de adquisición, tenencia, ' +
        'cuidado o albergue de animales (Código Penal, arts. 43 num. 12 y 50A, adicionados por la ' +
        'Ley 2455 de 2025). La falsedad de esta declaración es causal de terminación del contrato ' +
        'y de restitución del animal.',
    ),
  ]);

  clause('OBLIGACIONES DEL ADOPTANTE', [
    p(
      'El adoptante asume los deberes de quien tiene un animal a su cargo según la Ley 84 de 1989 ' +
        '(art. 5), la Ley 1774 de 2016 (art. 3, principios de bienestar animal) y la Ley 1801 de ' +
        '2016 (Código Nacional de Seguridad y Convivencia Ciudadana). En especial:',
    ),
    item(
      'Bienestar',
      'Garantizar que el animal no sufra hambre ni sed; que no sufra injustificadamente malestar ' +
        'físico ni dolor; que no padezca enfermedades por negligencia o descuido; que no sea ' +
        'sometido a condiciones de miedo ni estrés; y que pueda manifestar su comportamiento ' +
        'natural (Ley 1774 de 2016, art. 3).',
    ),
    item(
      'Salud',
      'Proveer atención veterinaria, vacunación y desparasitación periódicas, y atención inmediata ' +
        'ante enfermedad o lesión. Se recomienda una consulta veterinaria durante el primer mes.',
    ),
    item(
      'Alojamiento',
      'Mantener al animal dentro del hogar o en un espacio higiénico, seguro y con abrigo, sin ' +
        'encadenamiento permanente ni confinamiento que le cause sufrimiento.',
    ),
    item(
      'Espacio público',
      'Sacarlo con traílla (y bozal y demás requisitos legales si es un perro de manejo especial), ' +
        'recoger sus excrementos y evitar que cause daños o ataque a personas o animales (Ley 1801 ' +
        'de 2016, arts. 117 —modificado por la Ley 2054 de 2020— y 124).',
    ),
    item(
      'Avisos',
      'Informar al cedente, dentro de las 48 horas siguientes, si el animal se pierde, enferma ' +
        'gravemente o muere, y cualquier cambio de domicilio, correo o celular durante el periodo ' +
        'de seguimiento.',
    ),
    item(
      'Cesión prohibida',
      'No vender, regalar, alquilar, intercambiar ni ceder el animal a terceros, ni usarlo para ' +
        'reproducción con fines comerciales, peleas, espectáculos o cualquier actividad que le ' +
        'cause daño. Si no puede seguir cuidándolo, aplicará la cláusula de devolución acordada.',
    ),
  ]);

  clause('OBLIGACIONES DEL CEDENTE', [
    item(
      'Entrega e información',
      'Entregar el animal en el estado declarado, junto con la información veterinaria y de ' +
        'comportamiento de que disponga.',
    ),
    item(
      'Acompañamiento',
      'Orientar al adoptante durante el periodo de seguimiento y responder a sus pedidos de ayuda.',
    ),
    item(
      'Recibirlo de vuelta',
      'Recibir el animal de regreso en los casos de la cláusula de devolución acordada, sin ' +
        'reproches para el adoptante, y procurar su reubicación responsable.',
    ),
    item(
      'Datos personales',
      'Tratar los datos del adoptante solo para las finalidades de este contrato (cláusula de ' +
        'datos personales).',
    ),
  ]);

  clause('SEGUIMIENTO DE APOYO', [
    p(
      `Durante los ${months} meses siguientes a la firma, el cedente hará seguimiento de la ` +
        `adaptación de ${animalName} según el plan ${FOLLOW_UP_PLAN_LABELS[plan].toLowerCase()} ` +
        `elegido por el adoptante: contactos ${FOLLOW_UP_PLAN_MILESTONES[plan]}. Cada contacto se ` +
        'hace por medios digitales (correo, la plataforma o mensajería) y consiste en confirmar ' +
        'cómo está el animal, si es posible con una foto, y si el adoptante necesita ayuda.',
    ),
    p(
      'Las visitas al domicilio solo proceden con acuerdo previo del adoptante sobre fecha y hora; ' +
        'el cedente no ingresará al domicilio sin ese consentimiento (Constitución Política, art. ' +
        '28). El adoptante puede pasar del plan acompañado al ligero cuando lo desee. Las fotos del ' +
        'seguimiento solo se usarán para verificar el bienestar del animal; su publicación requiere ' +
        'autorización separada del adoptante.',
    ),
  ]);

  if (data.backupCaregiverName) {
    clause('CUIDADOR DE RESPALDO', [
      p(
        `El adoptante designa como cuidador de respaldo a ${blank(data.backupCaregiverName)}` +
          `${data.backupCaregiverPhone ? `, celular ${data.backupCaregiverPhone}` : ''}, a quien ` +
          'el cedente podrá contactar si no logra comunicarse con el adoptante o si este no puede ' +
          'seguir cuidando al animal. La designación no transfiere la propiedad ni las obligaciones ' +
          'del adoptante; cualquier entrega al cuidador requiere acuerdo previo con el cedente.',
      ),
      p(
        data.backupCaregiverInformed
          ? 'El adoptante declara que informó al cuidador de respaldo y obtuvo su autorización ' +
              'para entregar su nombre y celular al cedente con esta única finalidad (Ley 1581 de 2012).'
          : 'El adoptante se obliga a informar al cuidador de respaldo y a obtener su autorización ' +
              'para entregar su nombre y celular al cedente con esta única finalidad (Ley 1581 de 2012).',
      ),
    ]);
  }

  clause('DEVOLUCIÓN ACORDADA', [
    p(
      'Si el animal no se adapta, o el adoptante no puede seguir cuidándolo, las partes seguirán ' +
        'este orden, sin culpa para ninguna de ellas:',
    ),
    item(
      'Señal temprana',
      'El adoptante avisa al cedente, o el cedente detecta en el seguimiento una señal de riesgo ' +
        '(por ejemplo, que el animal deja de comer o pide ayuda).',
    ),
    item(
      'Plan de apoyo',
      'El cedente propone medidas (orientación, médico veterinario o especialista en ' +
        'comportamiento) y una fecha de revisión que no supere catorce (14) días.',
    ),
    item(
      'Devolución',
      'Si la situación no mejora, las partes acuerdan fecha y lugar de entrega y firman un acta ' +
        'de devolución, con la que el adoptante restituye el animal y este contrato termina. Sobre ' +
        'la cuota de recuperación, si la hubo, se estará a lo que las partes acuerden en esa acta.',
    ),
  ]);

  clause('INCUMPLIMIENTO Y RESTITUCIÓN', [
    p(
      'Son causales de terminación del contrato y de restitución del animal al cedente: (a) el ' +
        'maltrato o el abandono del animal en los términos de la Ley 84 de 1989 o del Código Penal ' +
        '(arts. 339A, 339B y 339C, modificados y adicionados por la Ley 2455 de 2025); (b) la ' +
        'cesión del animal a terceros sin autorización; (c) la negligencia grave que comprometa la ' +
        'salud o la vida del animal, certificada por un médico veterinario; y (d) la falsedad de ' +
        'las declaraciones de este contrato. Ante una de estas causales, el cedente podrá pedir el ' +
        'cumplimiento o la rescisión de la entrega gratuita (Código Civil, art. 1483).',
    ),
    p(
      'Procedimiento: el cedente requerirá por escrito al adoptante, indicando la causal y un ' +
        'plazo razonable para corregirla o devolver el animal. Si no hay acuerdo, las partes ' +
        'acudirán a conciliación extrajudicial (Ley 2220 de 2022) antes de cualquier proceso, sin ' +
        'perjuicio de que, ante maltrato, cualquiera de ellas denuncie ante la inspección de ' +
        'policía, que puede ordenar la aprehensión preventiva del animal (Ley 84 de 1989, art. 46A, ' +
        'modificado por la Ley 2455 de 2025), o ante la Fiscalía.',
    ),
    p(
      'En ningún caso el cedente recuperará el animal por la fuerza ni ingresará al domicilio del ' +
        'adoptante sin su consentimiento o sin orden de autoridad competente.',
    ),
  ]);

  clause('RESPONSABILIDAD POR EL ANIMAL', [
    p(
      'Desde la entrega, el adoptante responde por los daños que el animal cause a terceros ' +
        '(Código Civil, art. 2353) y por el cumplimiento de las normas de convivencia que le ' +
        'apliquen como tenedor. El cedente no responde por hechos del animal posteriores a la ' +
        'entrega, salvo por vicios de salud o comportamiento que conocía y no declaró.',
    ),
  ]);

  clause('DATOS PERSONALES', [
    p(
      `El responsable del tratamiento de los datos personales de este contrato es ${org}. ` +
        'AdoptaFácil los trata como encargado, por cuenta del cedente. El adoptante autoriza su ' +
        'tratamiento para celebrar y ejecutar este contrato, hacer el seguimiento y, si es el ' +
        'caso, la devolución o restitución del animal. Los datos no se comparten con otras ' +
        'organizaciones ni se publican. El adoptante puede conocer, actualizar, rectificar y ' +
        'suprimir sus datos y revocar la autorización cuando no exista un deber legal o ' +
        'contractual de conservarlos (Ley 1581 de 2012, arts. 8 y 9), escribiendo al cedente.',
    ),
  ]);

  clause('FIRMA ELECTRÓNICA Y COPIAS', [
    p(
      'Las partes firman este contrato con firma electrónica a través de AdoptaFácil y aceptan ' +
        'que tiene la misma validez y fuerza obligatoria que la firma manuscrita (Ley 527 de 1999, ' +
        'art. 7; Decreto 1074 de 2015, que compiló el Decreto 2364 de 2012). Al completarse las ' +
        'firmas, el contenido queda sellado con una huella SHA-256 que permite comprobar que no ' +
        'fue modificado.',
    ),
    p(
      'Firmado por todas las partes, cada una recibe una copia íntegra en PDF en el correo que ' +
        'registró, y el documento queda disponible para consulta en AdoptaFácil. Todas las copias ' +
        'tienen el mismo valor.',
    ),
  ]);

  clause('VIGENCIA, DOMICILIO Y CONTROVERSIAS', [
    p(
      'Este contrato rige desde la firma de todas las partes. Las cargas de cuidado duran mientras ' +
        `el adoptante tenga al animal, y las de seguimiento durante el plazo de ${months} meses ` +
        'pactado.',
    ),
    p(
      `Para todos los efectos las partes fijan como domicilio contractual la ciudad de ${city}. ` +
        'Las diferencias se intentarán resolver primero por diálogo directo y luego por ' +
        'conciliación; en su defecto, conocerá el juez competente según el Código General del ' +
        'Proceso.',
    ),
  ]);

  if (payload.terms.trim()) {
    clause('ACUERDOS ADICIONALES', [p(payload.terms.trim())]);
  }

  clause('DECLARACIÓN FINAL', [
    p(
      'Las partes declaran que leyeron íntegramente este contrato, que entienden sus obligaciones ' +
        'y que lo firman libremente.',
    ),
  ]);

  return {
    title: 'CONTRATO DE ADOPCIÓN RESPONSABLE DE ANIMAL DE COMPAÑÍA',
    templateVersion: 'v2',
    sections,
    signatureCity: city,
    signerLabels: {
      organization_representative: `Por el Cedente (${org})`,
      adopter: 'El Adoptante',
      witness: 'Testigo',
      co_adopter: 'Responsable firmante (solidario)',
    },
  };
}

/**
 * Construye el contrato completo (texto legal + datos) en la versión de
 * plantilla con que se generó. `signers` se usa solo para nombrar al
 * representante y a los responsables firmantes dentro del texto.
 */
export function buildAdoptionContractDocument(
  payload: AdoptionContractPayload,
  signers: readonly AdoptionContractSigner[] = [],
): AdoptionContractDocument {
  return (payload.templateVersion ?? 'v1') === 'v2' ? buildV2(payload, signers) : buildV1(payload);
}
