import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { DocumentType } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import type { PlansService } from '../../core/plans/plans.service';
import type { TenantContextService } from '../../core/tenant/tenant-context.service';
import { LocalStubStorageAdapter } from '../../core/storage/local-stub-storage.adapter';
import { DocumentUploadService } from './document-upload.service';
import type { DocumentsService } from './documents.service';
import type { DocumentTextPort } from './document-verification/document-text.port';
import { nitCheckDigit } from './document-verification/nit';

const ORG = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';
const NIT = '900123456';
const DV = String(nitCheckDigit(NIT));
const RUT_TEXT = `Formulario del Registro Único Tributario Hoja Principal 001
5. Número de Identificación Tributaria (NIT) 6. DV
${NIT.split('').join(' ')} ${DV}
35. Razón social FUNDACION HUELLITAS DEL VALLE`;
const CERL_TEXT = `CAMARA DE COMERCIO DE CALI
CERTIFICADO DE EXISTENCIA Y REPRESENTACIÓN LEGAL
Nombre: FUNDACIÓN HUELLITAS DEL VALLE`;

function setup(text: string | null) {
  const storage = new LocalStubStorageAdapter();
  const documents = {
    upload: jest.fn(
      async (_actor: string, input: { type: DocumentType }, reserved: { key: string }) => ({
        document: { id: 'doc-1', organizationId: ORG, type: input.type, storageRef: reserved.key },
        upload: reserved,
      }),
    ),
  };
  const reader: DocumentTextPort = { extractText: jest.fn(async () => text) };
  const plans = { assertStorageAvailable: jest.fn(async () => undefined) };
  const service = new DocumentUploadService(
    documents as unknown as DocumentsService,
    { getOrganizationId: () => ORG } as unknown as TenantContextService,
    plans as unknown as PlansService,
    storage,
    reader,
    { get: () => 15 } as unknown as ConfigService<Env, true>,
  );
  return { service, storage, documents, reader };
}

const file = (buffer: Buffer, originalname = 'rut.pdf') => ({
  buffer,
  originalname,
  size: buffer.length,
});
const PDF = Buffer.from('%PDF-1.7 contenido');

describe('DocumentUploadService: subir un documento legal validado en el servidor', () => {
  it('guarda un RUT legible, lo confirma y ofrece llenar el perfil', async () => {
    const { service, storage, documents } = setup(RUT_TEXT);
    const result = await service.upload('user-1', { type: DocumentType.Rut }, file(PDF));
    expect(result.check.result).toBe('match');
    expect(result.prefill).toMatchObject({
      nit: `${NIT}-${DV}`,
      legalName: 'FUNDACION HUELLITAS DEL VALLE',
    });
    const key = documents.upload.mock.calls[0][2].key;
    expect(key.startsWith(`private/${ORG}/`)).toBe(true);
    expect((await storage.readObject(key))?.data.equals(PDF)).toBe(true);
  });

  it('rechaza (422) un certificado de Cámara subido como RUT, sin crear la versión', async () => {
    const { service, documents } = setup(CERL_TEXT);
    const error = await service
      .upload('user-1', { type: DocumentType.Rut }, file(PDF))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
      error: 'document_kind_mismatch',
      looksLike: DocumentType.ExistenceRepresentationCertificate,
    });
    expect(documents.upload).not.toHaveBeenCalled();
  });

  it('rechaza un archivo que no es PDF ni imagen aunque se llame .pdf', async () => {
    const { service, documents } = setup(null);
    await expect(
      service.upload(
        'user-1',
        { type: DocumentType.Rut },
        file(Buffer.from('<html><script>alert(1)</script></html>'), 'rut.pdf'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(documents.upload).not.toHaveBeenCalled();
  });

  it('acepta una foto del RUT, sin leerla, y avisa que la revisión es manual', async () => {
    const { service, reader } = setup(null);
    const photo = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const result = await service.upload(
      'user-1',
      { type: DocumentType.Rut },
      file(photo, 'rut.jpg'),
    );
    expect(result.check.result).toBe('unreadable');
    expect(result.prefill).toBeUndefined();
    expect(reader.extractText).not.toHaveBeenCalled();
  });

  it('pide el archivo cuando no viene', async () => {
    const { service } = setup(null);
    await expect(
      service.upload('user-1', { type: DocumentType.Rut }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
