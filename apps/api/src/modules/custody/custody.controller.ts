import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  type AnimalReportPreview,
  type CustodyAccountSummary,
  type CustodyCharge,
  type CustodyChargeStatus,
  type CustodyContract,
  type CustodyContractPrefill,
  type CustodyContractTemplate,
  type CustodyDocument,
  type CustodyEvent,
  type CustodyIntake,
  type CustodyOverview,
  type CustodyRelease,
  type CustodyResponsible,
  Role,
  type SaveCustodyContractTemplateInput,
  type UpsertCustodyResponsibleInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { setServeHeaders } from '../../core/storage/serve-headers';
import { CustodyBillingService } from './custody-billing.service';
import { CustodyContractsService } from './custody-contracts.service';
import type { UploadedFileLike } from './custody-core.service';
import { CustodyRecordsService } from './custody-records.service';
import { CustodyReportsService } from './custody-reports.service';
import {
  type ChargeDto,
  type ContractDto,
  type EventDto,
  type IntakeDto,
  type PaymentDto,
  type ReleaseDto,
  type ReportFiltersDto,
  type UploadDocumentDto,
  chargeSchema,
  collectionSchema,
  contractSchema,
  contractTemplateSchema,
  endContractSchema,
  eventSchema,
  extensionSchema,
  intakeSchema,
  issueContractSchema,
  paymentSchema,
  reasonSchema,
  releaseSchema,
  reportFiltersSchema,
  responsibleSchema,
  uploadDocumentSchema,
} from './custody.schemas';

/** Consultan el historial, los documentos, la cuenta y los reportes. */
const VIEW_ROLES = [Role.Owner, Role.Administrator, Role.Operator, Role.ReadOnlyAuditor] as const;
/** Operación diaria: ingresos, salidas, documentos, cobros y pagos. */
const WRITE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;
/**
 * Decisiones de la organización: plantillas, emitir o terminar contratos,
 * prórrogas, anulaciones y el inicio de un procedimiento de cobro.
 */
const MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;

function sendPdf(res: Response, filename: string, data: Buffer): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(data);
}

/**
 * Documentación, ingreso, custodia y guardería. Deny-by-default: cada ruta
 * declara sus roles y la organización sale SIEMPRE del JWT.
 */
@Controller('custody')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustodyController {
  constructor(
    private readonly records: CustodyRecordsService,
    private readonly contracts: CustodyContractsService,
    private readonly billing: CustodyBillingService,
    private readonly reports: CustodyReportsService,
  ) {}

  // --- Responsables ----------------------------------------------------------

  @Get('responsibles')
  @Roles(...VIEW_ROLES)
  listResponsibles(@Query('search') search?: string): Promise<CustodyResponsible[]> {
    return this.records.listResponsibles(search);
  }

  @Post('responsibles')
  @Roles(...WRITE_ROLES)
  createResponsible(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(responsibleSchema)) dto: UpsertCustodyResponsibleInput,
  ): Promise<CustodyResponsible> {
    return this.records.createResponsible(actor.id, dto);
  }

  @Put('responsibles/:id')
  @Roles(...WRITE_ROLES)
  updateResponsible(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(responsibleSchema)) dto: UpsertCustodyResponsibleInput,
  ): Promise<CustodyResponsible> {
    return this.records.updateResponsible(actor.id, id, dto);
  }

  @Get('responsibles/:id/statement')
  @Roles(...VIEW_ROLES)
  async statement(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendPdf(res, 'estado-de-cuenta.pdf', await this.billing.accountStatement(actor.id, id));
  }

  // --- Por animal ------------------------------------------------------------

  @Get('animals/:animalId/overview')
  @Roles(...VIEW_ROLES)
  overview(@Param('animalId', ParseUUIDPipe) animalId: string): Promise<CustodyOverview> {
    return this.records.overview(animalId);
  }

  @Get('animals/:animalId/timeline')
  @Roles(...VIEW_ROLES)
  timeline(@Param('animalId', ParseUUIDPipe) animalId: string): Promise<CustodyEvent[]> {
    return this.records.timeline(animalId);
  }

  @Get('animals/:animalId/documents')
  @Roles(...VIEW_ROLES)
  documents(@Param('animalId', ParseUUIDPipe) animalId: string): Promise<CustodyDocument[]> {
    return this.records.listDocuments(animalId);
  }

  @Post('animals/:animalId/documents')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Body(new ZodValidationPipe(uploadDocumentSchema)) dto: UploadDocumentDto,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<CustodyDocument> {
    return this.records.uploadDocument(actor.id, animalId, dto, file);
  }

  @Get('animals/:animalId/intakes')
  @Roles(...VIEW_ROLES)
  intakes(@Param('animalId', ParseUUIDPipe) animalId: string): Promise<CustodyIntake[]> {
    return this.records.listIntakes(animalId);
  }

  @Post('animals/:animalId/intakes')
  @Roles(...WRITE_ROLES)
  createIntake(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Body(new ZodValidationPipe(intakeSchema)) dto: IntakeDto,
  ): Promise<CustodyIntake> {
    return this.records.createIntake(actor.id, animalId, dto);
  }

  /**
   * Acta de salida: devolver el animal a su responsable, darlo en adopción o
   * trasladarlo es operación diaria. Nunca consulta la cuenta.
   */
  @Post('animals/:animalId/releases')
  @Roles(...WRITE_ROLES)
  createRelease(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Body(new ZodValidationPipe(releaseSchema)) dto: ReleaseDto,
  ): Promise<{ release: CustodyRelease; document: CustodyDocument }> {
    if (dto.releaseType === 'handover_to_authority') {
      throw new ForbiddenException(
        'Entregar un animal a una autoridad es una decisión de quien administra la organización.',
      );
    }
    return this.records.createRelease(actor.id, animalId, dto);
  }

  /**
   * Entrega a una autoridad competente: solo quien administra, y solo después
   * de confirmar que una persona revisó el caso (lo exige el esquema).
   */
  @Post('animals/:animalId/authority-handover')
  @Roles(...MANAGE_ROLES)
  createAuthorityHandover(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Body(new ZodValidationPipe(releaseSchema)) dto: ReleaseDto,
  ): Promise<{ release: CustodyRelease; document: CustodyDocument }> {
    if (dto.releaseType !== 'handover_to_authority') {
      throw new BadRequestException('Esta ruta solo registra entregas a una autoridad.');
    }
    return this.records.createRelease(actor.id, animalId, dto);
  }

  @Post('animals/:animalId/events')
  @Roles(...WRITE_ROLES)
  createEvent(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
    @Body(new ZodValidationPipe(eventSchema)) dto: EventDto,
  ): Promise<CustodyEvent> {
    return this.records.createEvent(actor.id, animalId, dto);
  }

  @Get('animals/:animalId/contract-prefill')
  @Roles(...VIEW_ROLES)
  prefill(@Param('animalId', ParseUUIDPipe) animalId: string): Promise<CustodyContractPrefill> {
    return this.contracts.prefill(animalId);
  }

  /** Genera el reporte individual y lo deja en el historial del animal. */
  @Post('animals/:animalId/report')
  @Roles(...WRITE_ROLES)
  async individualReport(
    @CurrentUser() actor: RequestUser,
    @Param('animalId', ParseUUIDPipe) animalId: string,
  ): Promise<CustodyDocument> {
    return (await this.reports.individual(actor.id, animalId)).document;
  }

  // --- Ingresos --------------------------------------------------------------

  @Put('intakes/:id')
  @Roles(...WRITE_ROLES)
  updateIntake(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(intakeSchema)) dto: IntakeDto,
  ): Promise<CustodyIntake> {
    return this.records.updateIntake(actor.id, id, dto);
  }

  @Post('intakes/:id/photos')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file'))
  addIntakePhoto(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body('caption') caption?: string,
  ): Promise<CustodyDocument> {
    return this.records.addIntakePhoto(actor.id, id, file, caption);
  }

  @Post('intakes/:id/finalize')
  @HttpCode(200)
  @Roles(...WRITE_ROLES)
  finalizeIntake(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ intake: CustodyIntake; document: CustodyDocument }> {
    return this.records.finalizeIntake(actor.id, id);
  }

  // --- Documentos ------------------------------------------------------------

  @Get('documents/:id/file')
  @Roles(...VIEW_ROLES)
  async downloadDocument(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.records.downloadDocument(actor.id, id);
    // Tipo real por los bytes, en línea si es PDF o imagen, aislado con `sandbox`.
    setServeHeaders(res, file.filename, file.data);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.data);
  }

  // --- Plantillas de contrato ------------------------------------------------

  @Get('contract-templates')
  @Roles(...VIEW_ROLES)
  listTemplates(): Promise<CustodyContractTemplate[]> {
    return this.contracts.listTemplates();
  }

  @Get('contract-templates/:key/versions')
  @Roles(...VIEW_ROLES)
  templateVersions(@Param('key') key: string): Promise<CustodyContractTemplate[]> {
    return this.contracts.templateVersions(key);
  }

  @Post('contract-templates')
  @Roles(...MANAGE_ROLES)
  createTemplate(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(contractTemplateSchema)) dto: SaveCustodyContractTemplateInput,
  ): Promise<CustodyContractTemplate> {
    return this.contracts.createTemplate(actor.id, dto);
  }

  @Put('contract-templates/:key')
  @Roles(...MANAGE_ROLES)
  updateTemplate(
    @CurrentUser() actor: RequestUser,
    @Param('key') key: string,
    @Body(new ZodValidationPipe(contractTemplateSchema)) dto: SaveCustodyContractTemplateInput,
  ): Promise<CustodyContractTemplate> {
    return this.contracts.updateTemplate(actor.id, key, dto);
  }

  @Post('contract-templates/:key/archive')
  @HttpCode(204)
  @Roles(...MANAGE_ROLES)
  archiveTemplate(@CurrentUser() actor: RequestUser, @Param('key') key: string): Promise<void> {
    return this.contracts.archiveTemplate(actor.id, key);
  }

  // --- Contratos -------------------------------------------------------------

  @Get('contracts')
  @Roles(...VIEW_ROLES)
  listContracts(@Query('animalId') animalId?: string): Promise<CustodyContract[]> {
    return this.contracts.listContracts({ animalId: uuidOrUndefined(animalId, 'animalId') });
  }

  @Get('contracts/:id')
  @Roles(...VIEW_ROLES)
  getContract(@Param('id', ParseUUIDPipe) id: string): Promise<CustodyContract> {
    return this.contracts.getContract(id);
  }

  @Post('contracts')
  @Roles(...WRITE_ROLES)
  createContract(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(contractSchema)) dto: ContractDto,
  ): Promise<CustodyContract> {
    return this.contracts.createDraft(actor.id, dto);
  }

  @Put('contracts/:id')
  @Roles(...WRITE_ROLES)
  updateContract(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(contractSchema)) dto: ContractDto,
  ): Promise<CustodyContract> {
    return this.contracts.updateDraft(actor.id, id, dto);
  }

  /** Vista previa (con marca de BORRADOR mientras no se emita). */
  @Get('contracts/:id/preview')
  @Roles(...VIEW_ROLES)
  async previewContract(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendPdf(res, 'contrato-vista-previa.pdf', await this.contracts.previewPdf(id));
  }

  @Post('contracts/:id/issue')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  issueContract(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(issueContractSchema)) _dto: { confirm: true },
  ): Promise<{ contract: CustodyContract; document: CustodyDocument }> {
    return this.contracts.issue(actor.id, id);
  }

  @Post('contracts/:id/end')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  endContract(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(endContractSchema)) dto: { reason: string },
  ): Promise<CustodyContract> {
    return this.contracts.end(actor.id, id, dto.reason);
  }

  @Post('contracts/:id/cancel')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  cancelContract(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(endContractSchema)) dto: { reason: string },
  ): Promise<CustodyContract> {
    return this.contracts.cancel(actor.id, id, dto.reason);
  }

  // --- Cuenta ----------------------------------------------------------------

  @Get('account/summary')
  @Roles(...VIEW_ROLES)
  summary(): Promise<CustodyAccountSummary> {
    return this.billing.summary();
  }

  @Get('charges')
  @Roles(...VIEW_ROLES)
  listCharges(
    @Query('animalId') animalId?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('status') status?: string,
  ): Promise<CustodyCharge[]> {
    if (status && !['pending', 'paid', 'cancelled'].includes(status)) {
      throw new BadRequestException('status: valor no válido.');
    }
    return this.billing.listCharges({
      animalId: uuidOrUndefined(animalId, 'animalId'),
      responsibleId: uuidOrUndefined(responsibleId, 'responsibleId'),
      status: (status || undefined) as CustodyChargeStatus | undefined,
    });
  }

  /** JSON o multipart (soporte opcional en el campo `file`). */
  @Post('charges')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file'))
  createCharge(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(chargeSchema)) dto: ChargeDto,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<CustodyCharge> {
    return this.billing.createCharge(actor.id, dto, file);
  }

  @Post('charges/:id/cancel')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  cancelCharge(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reasonSchema)) dto: { reason: string },
  ): Promise<CustodyCharge> {
    return this.billing.cancelCharge(actor.id, id, dto.reason);
  }

  /** La prórroga la concede quien administra: queda con su nombre. */
  @Post('charges/:id/extensions')
  @Roles(...MANAGE_ROLES)
  grantExtension(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(extensionSchema))
    dto: { newDueDate: string; reason: string; requestedBy?: string },
  ): Promise<CustodyCharge> {
    return this.billing.grantExtension(actor.id, id, dto);
  }

  /** JSON o multipart (comprobante opcional en el campo `file`). */
  @Post('charges/:id/payments')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file'))
  registerPayment(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(paymentSchema)) dto: PaymentDto,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<CustodyCharge> {
    return this.billing.registerPayment(actor.id, id, dto, file);
  }

  /**
   * Una persona con rol de administración revisó el caso y decide iniciar el
   * procedimiento de cobro. Es un registro: no afecta la custodia del animal.
   */
  @Post('charges/:id/collection')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  startCollection(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(collectionSchema)) dto: { note: string },
  ): Promise<CustodyCharge> {
    return this.billing.startCollection(actor.id, id, dto.note);
  }

  @Post('payments/:id/void')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  voidPayment(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reasonSchema)) dto: { reason: string },
  ): Promise<CustodyCharge> {
    return this.billing.voidPayment(actor.id, id, dto.reason);
  }

  // --- Reportes de animales --------------------------------------------------

  @Get('reports/animals')
  @Roles(...VIEW_ROLES)
  reportPreview(
    @Query(new ZodValidationPipe(reportFiltersSchema)) filters: ReportFiltersDto,
  ): Promise<AnimalReportPreview> {
    return this.reports.preview(filters);
  }

  @Get('reports/animals/pdf')
  @Roles(...VIEW_ROLES)
  async reportPdf(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(reportFiltersSchema)) filters: ReportFiltersDto,
    @Res() res: Response,
  ): Promise<void> {
    sendPdf(res, 'reporte-de-animales.pdf', await this.reports.consolidatedPdf(actor.id, filters));
  }

  @Get('reports/animals/csv')
  @Roles(...VIEW_ROLES)
  async reportCsv(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(reportFiltersSchema)) filters: ReportFiltersDto,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.reports.csv(actor.id, filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-de-animales.csv"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(data);
  }

  @Get('reports/animals/xlsx')
  @Roles(...VIEW_ROLES)
  async reportXlsx(
    @CurrentUser() actor: RequestUser,
    @Query(new ZodValidationPipe(reportFiltersSchema)) filters: ReportFiltersDto,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.reports.xlsx(actor.id, filters);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-de-animales.xlsx"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(data);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidOrUndefined(value: string | undefined, name: string): string | undefined {
  if (!value) return undefined;
  if (!UUID.test(value)) throw new BadRequestException(`${name}: identificador no válido.`);
  return value;
}
