import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import sharp from 'sharp';
import {
  ANIMAL_REPORT_MAX_ROWS,
  ANIMAL_REPORT_PHOTO_LIMIT,
  CUSTODY_STATUS_LABELS,
  type AnimalReportPreview,
  type AnimalReportRow,
  type CustodyContractStatus,
  type CustodyDocument,
  type CustodyStatus,
} from '@adoptafacil/contracts';
import { csvCell } from '../accounting/accounting-export';
import { sheetText } from '../reports/report-text';
import { styleHeader, styleTable } from '../reports/xlsx-style';
import { computeAge } from '../animals/animal-age';
import { CustodyCoreService } from './custody-core.service';
import { buildAnimalReport, buildConsolidatedReport } from './custody-document-builders';
import { renderCustodyPdf } from './custody-pdf';
import type { ReportFiltersDto } from './custody.schemas';
import {
  ANIMAL_STATUS_LABELS,
  SEX_LABELS,
  SPECIES_LABELS,
  actorNameOf,
  ageLabel,
  animalCode,
  formatDateShort,
  fromDbDate,
  generatedLabel,
  todayInColombia,
} from './custody.util';

const PREVIEW_ROWS = 200;
/** Lectura de fotos en tandas, para no abrir cientos de archivos a la vez. */
const PHOTO_BATCH = 12;

/** Fecha de calendario en Colombia de un instante UTC. */
function colombiaDate(instant: Date): string {
  return todayInColombia(instant);
}

interface ReportData {
  organizationName: string;
  rows: AnimalReportRow[];
  /** Clave de almacenamiento de la foto principal por animal. */
  photoRefs: Map<string, string>;
  total: number;
  truncated: boolean;
}

/**
 * Reportes de animales: el consolidado (PDF, CSV y Excel, con filtros) y el
 * individual. Son administrativos: no incluyen la cuenta del responsable ni
 * información clínica.
 */
@Injectable()
export class CustodyReportsService {
  constructor(private readonly core: CustodyCoreService) {}

  filterLabels(filters: ReportFiltersDto): string[] {
    const labels: string[] = [];
    if (filters.status)
      labels.push(`Estado: ${ANIMAL_STATUS_LABELS[filters.status] ?? filters.status}`);
    if (filters.species)
      labels.push(`Especie: ${SPECIES_LABELS[filters.species] ?? filters.species}`);
    if (filters.sex) labels.push(`Sexo: ${SEX_LABELS[filters.sex] ?? filters.sex}`);
    if (filters.custody) {
      labels.push(`Custodia: ${CUSTODY_STATUS_LABELS[filters.custody as CustodyStatus]}`);
    }
    if (filters.intakeFrom) labels.push(`Ingreso desde: ${formatDateShort(filters.intakeFrom)}`);
    if (filters.intakeTo) labels.push(`Ingreso hasta: ${formatDateShort(filters.intakeTo)}`);
    if (filters.search) labels.push(`Búsqueda: "${filters.search}"`);
    if (filters.includeInactive) labels.push('Incluye animales inactivos');
    return labels;
  }

  /**
   * Una sola lectura para todo el reporte: los animales, y de un golpe el
   * último ingreso y la última salida de cada uno (sin una consulta por animal).
   */
  private async load(filters: ReportFiltersDto): Promise<ReportData> {
    const organizationId = this.core.orgId();
    return this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      });
      const animals = await tx.animal.findMany({
        where: {
          organizationId,
          ...(filters.includeInactive ? {} : { isActive: true }),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.species ? { species: filters.species } : {}),
          ...(filters.sex ? { sex: filters.sex } : {}),
          ...(filters.search
            ? { name: { contains: filters.search, mode: 'insensitive' as const } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          species: true,
          sex: true,
          status: true,
          isActive: true,
          customBreed: true,
          birthDate: true,
          approximateAgeMonths: true,
          createdAt: true,
          breed: { select: { name: true } },
          photos: { select: { storageRef: true, order: true }, orderBy: { order: 'asc' }, take: 1 },
        },
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      });
      const intakes = await tx.animalIntake.findMany({
        where: { organizationId },
        select: {
          animalId: true,
          intakeAt: true,
          origin: true,
          notes: true,
          physicalCondition: true,
          responsible: { select: { fullName: true } },
        },
        orderBy: { intakeAt: 'desc' },
      });
      const releases = await tx.custodyRelease.findMany({
        where: { organizationId },
        select: { animalId: true, releasedAt: true },
        orderBy: { releasedAt: 'desc' },
      });
      const lastIntake = new Map<string, (typeof intakes)[number]>();
      for (const intake of intakes) {
        if (!lastIntake.has(intake.animalId)) lastIntake.set(intake.animalId, intake);
      }
      const lastRelease = new Map<string, Date>();
      for (const release of releases) {
        if (!lastRelease.has(release.animalId))
          lastRelease.set(release.animalId, release.releasedAt);
      }

      const now = new Date();
      const photoRefs = new Map<string, string>();
      const all: AnimalReportRow[] = [];
      for (const animal of animals) {
        const intake = lastIntake.get(animal.id);
        const released = lastRelease.get(animal.id);
        let custodyStatus: CustodyStatus = 'not_registered';
        if (intake && (!released || intake.intakeAt > released)) custodyStatus = 'in_custody';
        else if (released) custodyStatus = 'released';
        const intakeDate = colombiaDate(intake?.intakeAt ?? animal.createdAt);
        if (filters.custody && filters.custody !== custodyStatus) continue;
        if (filters.intakeFrom && intakeDate < filters.intakeFrom) continue;
        if (filters.intakeTo && intakeDate > filters.intakeTo) continue;
        if (animal.photos[0]) photoRefs.set(animal.id, animal.photos[0].storageRef);
        all.push({
          id: animal.id,
          code: animalCode(animal.id),
          name: animal.name,
          species: animal.species,
          sex: animal.sex,
          breed: animal.breed?.name ?? animal.customBreed ?? undefined,
          ageLabel: ageLabel(computeAge(animal.birthDate, animal.approximateAgeMonths, now)),
          status: animal.status,
          isActive: animal.isActive,
          intakeDate,
          intakeDateSource: intake ? 'intake_record' : 'system_record',
          custodyStatus,
          origin: intake?.origin ?? undefined,
          responsibleName: intake?.responsible?.fullName,
          notes: intake?.notes ?? intake?.physicalCondition ?? undefined,
        });
      }
      return {
        organizationName: org?.name ?? '',
        rows: all.slice(0, ANIMAL_REPORT_MAX_ROWS),
        photoRefs,
        total: all.length,
        truncated: all.length > ANIMAL_REPORT_MAX_ROWS,
      };
    });
  }

  async preview(filters: ReportFiltersDto): Promise<AnimalReportPreview> {
    const data = await this.load(filters);
    return {
      total: data.total,
      rows: data.rows.slice(0, PREVIEW_ROWS),
      limit: ANIMAL_REPORT_MAX_ROWS,
      truncated: data.truncated,
    };
  }

  /** Miniaturas pequeñas (JPEG de 96 px): el PDF no carga las fotos completas. */
  private async thumbnails(data: ReportData): Promise<Map<string, Buffer>> {
    const result = new Map<string, Buffer>();
    const entries = data.rows
      .map((row) => [row.id, data.photoRefs.get(row.id)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
    for (let i = 0; i < entries.length; i += PHOTO_BATCH) {
      await Promise.all(
        entries.slice(i, i + PHOTO_BATCH).map(async ([id, ref]) => {
          const bytes = await this.core.readFile(ref);
          if (!bytes) return;
          try {
            const thumb = await sharp(bytes)
              .rotate()
              .resize(96, 96, { fit: 'cover' })
              .jpeg({ quality: 70 })
              .toBuffer();
            result.set(id, thumb);
          } catch {
            // Una foto dañada no detiene el reporte: esa fila va sin imagen.
          }
        }),
      );
    }
    return result;
  }

  /** Un solo PDF consolidado, paginado, con los filtros aplicados. */
  async consolidatedPdf(actorUserId: string, filters: ReportFiltersDto): Promise<Buffer> {
    const organizationId = this.core.orgId();
    const data = await this.load(filters);
    const organization = await this.core.prisma.withOrgContext(organizationId, (tx) =>
      this.core.loadOrganization(tx),
    );
    const photosOmitted = data.rows.length > ANIMAL_REPORT_PHOTO_LIMIT;
    const photos = photosOmitted ? new Map<string, Buffer>() : await this.thumbnails(data);
    const pdf = await renderCustodyPdf(
      buildConsolidatedReport({
        organization,
        rows: data.rows,
        photos,
        filterLabels: this.filterLabels(filters),
        total: data.total,
        truncated: data.truncated,
        photosOmitted,
      }),
    );
    await this.auditExport(actorUserId, 'pdf', data.rows.length, filters);
    return pdf;
  }

  private tableCells(row: AnimalReportRow): string[] {
    return [
      row.code,
      row.name,
      SPECIES_LABELS[row.species] ?? row.species,
      row.breed ?? '',
      SEX_LABELS[row.sex] ?? row.sex,
      row.ageLabel,
      ANIMAL_STATUS_LABELS[row.status] ?? row.status,
      row.isActive ? 'Sí' : 'No',
      CUSTODY_STATUS_LABELS[row.custodyStatus],
      row.intakeDate,
      row.intakeDateSource === 'intake_record' ? 'Acta de ingreso' : 'Registro en AdoptaFácil',
      row.origin ?? '',
      row.responsibleName ?? '',
      row.notes ?? '',
    ];
  }

  private static readonly HEADERS = [
    'Código',
    'Nombre',
    'Especie',
    'Raza',
    'Sexo',
    'Edad',
    'Estado',
    'Activo',
    'Custodia',
    'Fecha de ingreso',
    'Origen de la fecha',
    'Procedencia',
    'Responsable',
    'Observaciones',
  ];

  async csv(actorUserId: string, filters: ReportFiltersDto): Promise<Buffer> {
    const data = await this.load(filters);
    const labels = this.filterLabels(filters);
    const lines = [
      [`Reporte consolidado de animales`, data.organizationName].map(csvCell).join(','),
      [generatedLabel(), `Total: ${data.rows.length}`].map(csvCell).join(','),
      [`Filtros: ${labels.length > 0 ? labels.join(' · ') : 'Ninguno'}`].map(csvCell).join(','),
      '',
      CustodyReportsService.HEADERS.map(csvCell).join(','),
      ...data.rows.map((row) => this.tableCells(row).map(csvCell).join(',')),
    ];
    await this.auditExport(actorUserId, 'csv', data.rows.length, filters);
    // BOM: Excel abre el archivo en UTF-8 con las tildes bien.
    return Buffer.from(`${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`, 'utf8');
  }

  async xlsx(actorUserId: string, filters: ReportFiltersDto): Promise<Buffer> {
    const data = await this.load(filters);
    const labels = this.filterLabels(filters);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AdoptaFácil';
    const ws = workbook.addWorksheet('Animales');
    ws.columns = CustodyReportsService.HEADERS.map((header, index) => ({
      header,
      width: [12, 22, 12, 20, 12, 18, 22, 9, 18, 16, 22, 26, 26, 50][index],
    }));
    styleHeader(ws.getRow(1));
    for (const row of data.rows) {
      ws.addRow(this.tableCells(row).map((cell) => sheetText(cell)));
    }
    styleTable(ws, CustodyReportsService.HEADERS.length);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: { row: 1, column: CustodyReportsService.HEADERS.length } };
    ws.pageSetup = {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:1',
    };

    const info = workbook.addWorksheet('Información');
    info.columns = [{ width: 26 }, { width: 80 }];
    info.addRows([
      ['Reporte', 'Reporte consolidado de animales'],
      ['Organización', sheetText(data.organizationName)],
      ['Generado', generatedLabel()],
      ['Total de animales', data.rows.length],
      ['Filtros aplicados', sheetText(labels.length > 0 ? labels.join(' · ') : 'Ninguno')],
    ]);
    info.getColumn(1).font = { bold: true };

    await this.auditExport(actorUserId, 'xlsx', data.rows.length, filters);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private async auditExport(
    actorUserId: string,
    format: string,
    rows: number,
    filters: ReportFiltersDto,
  ): Promise<void> {
    await this.core.audit.record({
      organizationId: this.core.orgId(),
      actorUserId,
      action: 'custody.animal_report_exported',
      entityType: 'animal_report',
      entityId: this.core.orgId(),
      metadata: { format, rows, filters: this.filterLabels(filters) },
    });
  }

  /**
   * Reporte individual: identificación, foto, custodia, documentos y eventos
   * del animal. Queda guardado en su historial como documento generado.
   */
  async individual(
    actorUserId: string,
    animalId: string,
  ): Promise<{ document: CustodyDocument; data: Buffer }> {
    const organizationId = this.core.orgId();
    const loaded = await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const animal = await this.core.requireAnimal(tx, animalId);
      const organization = await this.core.loadOrganization(tx);
      const [intakes, releases, contracts, documents, events] = await Promise.all([
        tx.animalIntake.findMany({
          where: { organizationId, animalId },
          include: { responsible: true },
          orderBy: { intakeAt: 'desc' },
        }),
        tx.custodyRelease.findMany({
          where: { organizationId, animalId },
          orderBy: { releasedAt: 'desc' },
        }),
        tx.custodyContract.findMany({
          where: { organizationId, animalId },
          include: { responsible: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        tx.custodyDocument.findMany({
          where: { organizationId, animalId, kind: { not: 'animal_report' } },
          orderBy: { createdAt: 'desc' },
          take: 300,
        }),
        tx.custodyEvent.findMany({
          where: { organizationId, animalId },
          orderBy: { occurredAt: 'desc' },
          take: 300,
        }),
      ]);
      return { animal, organization, intakes, releases, contracts, documents, events };
    });
    const { animal, intakes, releases } = loaded;
    const lastIntake = intakes[0];
    const lastRelease = releases[0];
    let custodyStatus: CustodyStatus = 'not_registered';
    if (lastIntake && (!lastRelease || lastIntake.intakeAt > lastRelease.releasedAt)) {
      custodyStatus = 'in_custody';
    } else if (lastRelease) custodyStatus = 'released';

    const code = `REP-${animalCode(animalId)}-${fromDbDate(new Date()).replace(/-/g, '')}`;
    const pdf = await renderCustodyPdf(
      buildAnimalReport({
        organization: loaded.organization,
        animal: {
          ...this.core.animalFacts(animal),
          description: animal.description ?? undefined,
          tags: animal.tags,
          size: animal.size,
        },
        photo: await this.core.primaryPhoto(animal),
        custodyStatus,
        intakeDate: colombiaDate(lastIntake?.intakeAt ?? animal.createdAt),
        intakeDateSource: lastIntake ? 'intake_record' : 'system_record',
        intakes: intakes.map((row) => this.core.toIntake(row)),
        releases: releases.map((row) => this.core.toRelease(row)),
        contracts: loaded.contracts.map((row) => ({
          number: row.number,
          status: row.status as CustodyContractStatus,
          startDate: fromDbDate(row.startDate),
          endDate: row.endDate ? fromDbDate(row.endDate) : undefined,
          responsibleName: row.responsible.fullName,
        })),
        documents: loaded.documents.map((row) => this.core.toDocument(row)),
        events: loaded.events.map((row) => this.core.toEvent(row)),
        code,
      }),
    );
    const stored = await this.core.saveFile(pdf, `reporte-${code}.pdf`, 'application/pdf');
    const document = await this.core.prisma.withOrgContext(organizationId, async (tx) => {
      const actorName = await actorNameOf(tx, actorUserId);
      const doc = await this.core.insertDocument(tx, {
        animalId,
        kind: 'animal_report',
        title: `Reporte individual de ${animal.name}`,
        source: 'generated',
        file: stored,
        actorUserId,
        actorName,
      });
      await this.core.recordEvent(tx, {
        animalId,
        type: 'document_generated',
        summary: `Reporte individual generado (${code})`,
        documentId: doc.id,
        actorUserId,
        actorName,
      });
      await this.core.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'custody.animal_report_generated',
        entityType: 'custody_document',
        entityId: doc.id,
        metadata: { animalId, sha256: stored.sha256 },
      });
      return this.core.toDocument(doc);
    });
    return { document, data: pdf };
  }
}
