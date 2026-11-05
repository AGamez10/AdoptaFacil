import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import { S3StorageAdapter } from './s3-storage.adapter';

const ORG = '6f9619ff-8b86-d011-b42d-00cf4fc964ff';

/**
 * The signatures below were computed independently with botocore
 * (`S3SigV4Auth`, region `auto`, 2026-10-17T11:00:07Z, same credentials), so
 * the hand-written SigV4 matches what R2/B2/S3 verify.
 */
function setup(responses: Array<() => Response>) {
  const values: Record<string, unknown> = {
    S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
    S3_REGION: 'auto',
    S3_BUCKET: 'media',
    S3_ACCESS_KEY_ID: 'AKIDEXAMPLE',
    S3_SECRET_ACCESS_KEY: 'secretEXAMPLE',
    STORAGE_MAX_FILE_MB: 1,
    STORAGE_PUBLIC_BASE_URL: 'http://localhost:3000',
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    return next ? next() : new Response(null, { status: 500 });
  }) as unknown as typeof fetch;
  const adapter = new S3StorageAdapter(
    config,
    fetchImpl,
    () => new Date('2026-10-17T11:00:07.000Z'),
  );
  return { adapter, calls };
}

const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe('S3StorageAdapter (Cloudflare R2 / Backblaze B2 / S3)', () => {
  it('signs a PUT exactly like botocore', async () => {
    const { adapter, calls } = setup([() => new Response(null, { status: 200 })]);
    await adapter.saveObject(`public/${ORG}/a1-foto perro.jpg`, Buffer.from('hello'), 'image/jpeg');
    expect(calls[0].url).toBe(
      `https://acc.r2.cloudflarestorage.com/media/public/${ORG}/a1-foto%20perro.jpg`,
    );
    expect(calls[0].init.method).toBe('PUT');
    expect(header(calls[0].init, 'authorization')).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261017/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=bce0c95f19aff12514d62e3a3c2f8c76a7cdee87ab444f00d61f655414532945',
    );
  });

  it('sums an org listing across pages and signs the query like botocore', async () => {
    const page = (sizes: number[], token?: string) => () =>
      new Response(
        `<ListBucketResult>${sizes.map((s) => `<Contents><Size>${s}</Size></Contents>`).join('')}` +
          `<IsTruncated>${token ? 'true' : 'false'}</IsTruncated>` +
          (token ? `<NextContinuationToken>${token}</NextContinuationToken>` : '') +
          '</ListBucketResult>',
      );
    const { adapter, calls } = setup([page([100]), page([20, 5], 'abc+='), page([1])]);
    expect(await adapter.measureOrganizationUsage(ORG)).toBe(126);
    expect(calls).toHaveLength(3);
    expect(calls[2].url).toBe(
      `https://acc.r2.cloudflarestorage.com/media?continuation-token=abc%2B%3D&list-type=2&prefix=private%2F${ORG}%2F`,
    );
    expect(header(calls[2].init, 'authorization')).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261017/auto/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=62c37bb0da65cdfeef6eead3b36617f6eb6c3d517517aed4afa4ff5ea289ec70',
    );
    // A second measure within the cache window does not list again.
    expect(await adapter.measureOrganizationUsage(ORG)).toBe(126);
    expect(calls).toHaveLength(3);
  });

  it('reads bytes back, answers null on 404 and refuses oversize or unsafe keys', async () => {
    const { adapter } = setup([
      () => new Response(Buffer.from('bytes')),
      () => new Response(null, { status: 404 }),
    ]);
    const found = await adapter.readObject(`private/${ORG}/a-acta.pdf`);
    expect(found?.data.toString()).toBe('bytes');
    expect(found?.contentType).toBe('application/pdf');
    expect(await adapter.readObject(`private/${ORG}/missing.pdf`)).toBeNull();
    await expect(
      adapter.saveObject(`public/${ORG}/big.jpg`, Buffer.alloc(2 * 1024 * 1024)),
    ).rejects.toThrow('maximum size');
    await expect(adapter.readObject('../etc/passwd')).rejects.toThrow();
  });

  it('deletes a key with a signed DELETE, accepts a missing key and fails on errors', async () => {
    const { adapter, calls } = setup([
      () => new Response(null, { status: 204 }),
      () => new Response(null, { status: 404 }),
      () => new Response(null, { status: 403 }),
    ]);
    await adapter.deleteObject(`public/${ORG}/a1-producto.webp`);
    expect(calls[0].init.method).toBe('DELETE');
    expect(calls[0].url).toBe(
      `https://acc.r2.cloudflarestorage.com/media/public/${ORG}/a1-producto.webp`,
    );
    expect(header(calls[0].init, 'authorization')).toMatch(/^AWS4-HMAC-SHA256 /);
    await expect(adapter.deleteObject(`public/${ORG}/gone.webp`)).resolves.toBeUndefined();
    await expect(adapter.deleteObject(`public/${ORG}/x.webp`)).rejects.toThrow('403');
    await expect(adapter.deleteObject('../etc/passwd')).rejects.toThrow();
  });

  it('serves through the API, never a bucket URL', async () => {
    const { adapter } = setup([]);
    const target = await adapter.createUploadTarget({ organizationId: ORG, filename: 'x.jpg' });
    expect(target.url).toContain('http://localhost:3000/storage/upload?key=');
    expect(adapter.resolvePublicUrl(`public/${ORG}/a.jpg`)).toContain('/storage/public?key=');
  });
});
