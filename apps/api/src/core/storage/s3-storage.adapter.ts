import { createHash, createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import type {
  CreateUploadInput,
  SaveObjectOptions,
  StoragePort,
  StoredObject,
  StoredObjectData,
} from './storage.port';
import {
  assertSafeRelativeKey,
  buildStorageKey,
  contentTypeFromKey,
  parseStorageKey,
  resolveServeUrl,
} from './storage-keys';

/** How long a measured org total is reused before listing the bucket again. */
const USAGE_CACHE_MS = 5 * 60 * 1000;

type FetchLike = typeof fetch;

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) =>
  createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding as SigV4 expects (keeps `/` only where told to). */
function encode(value: string, keepSlash = false): string {
  const out = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return keepSlash ? out.replace(/%2F/g, '/') : out;
}

/**
 * StoragePort over any S3-compatible bucket (Cloudflare R2, Backblaze B2, AWS
 * S3), selected with STORAGE_DRIVER=s3. Same key layout and same access control
 * as the disk adapter: the bucket stays private and the API's storage endpoints
 * serve the bytes. Requests are signed with AWS Signature V4 by hand (path-style
 * URLs), so no SDK dependency is added.
 */
@Injectable()
export class S3StorageAdapter implements StoragePort {
  private readonly endpoint: URL;
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly maxBytes: number;
  private readonly publicBaseUrl: string;
  private readonly cdnBaseUrl: string | undefined;
  private readonly usageCache = new Map<string, { bytes: number; at: number }>();

  constructor(
    config: ConfigService<Env, true>,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.endpoint = new URL(config.get('S3_ENDPOINT', { infer: true }) as string);
    this.region = config.get('S3_REGION', { infer: true }) ?? 'auto';
    this.bucket = config.get('S3_BUCKET', { infer: true }) as string;
    this.accessKeyId = config.get('S3_ACCESS_KEY_ID', { infer: true }) as string;
    this.secretAccessKey = config.get('S3_SECRET_ACCESS_KEY', { infer: true }) as string;
    this.maxBytes = config.get('STORAGE_MAX_FILE_MB', { infer: true }) * 1024 * 1024;
    this.publicBaseUrl = config.get('STORAGE_PUBLIC_BASE_URL', { infer: true }).replace(/\/+$/, '');
    this.cdnBaseUrl = config.get('STORAGE_PUBLIC_CDN_BASE_URL', { infer: true })?.replace(/\/+$/, '');
  }

  async createUploadTarget(input: CreateUploadInput): Promise<StoredObject> {
    const key = buildStorageKey(
      input.visibility ?? 'private',
      input.organizationId,
      input.filename,
    );
    return { key, url: `${this.publicBaseUrl}/storage/upload?key=${encodeURIComponent(key)}` };
  }

  resolvePublicUrl(key: string): string {
    return resolveServeUrl(this.publicBaseUrl, this.cdnBaseUrl, key);
  }

  async saveObject(
    key: string,
    data: Buffer,
    contentType?: string,
    options?: SaveObjectOptions,
  ): Promise<void> {
    const maxBytes = options?.maxBytes ?? this.maxBytes;
    if (data.length > maxBytes) {
      throw new Error(`File exceeds the maximum size of ${maxBytes} bytes`);
    }
    assertSafeRelativeKey(key);
    const res = await this.send('PUT', key, {}, data, {
      'content-type': contentType ?? contentTypeFromKey(key),
    });
    if (!res.ok) {
      throw new Error(`Storage upload failed with status ${res.status}`);
    }
    const org = parseStorageKey(key)?.organizationId;
    const cached = org ? this.usageCache.get(org) : undefined;
    if (cached) cached.bytes += data.length;
  }

  async readObject(key: string): Promise<StoredObjectData | null> {
    assertSafeRelativeKey(key);
    const res = await this.send('GET', key);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Storage read failed with status ${res.status}`);
    }
    return {
      data: Buffer.from(await res.arrayBuffer()),
      contentType: contentTypeFromKey(key),
    };
  }

  async measureOrganizationUsage(organizationId: string): Promise<number> {
    const cached = this.usageCache.get(organizationId);
    if (cached && Date.now() - cached.at < USAGE_CACHE_MS) {
      return cached.bytes;
    }
    let bytes = 0;
    for (const visibility of ['public', 'private']) {
      let token: string | undefined;
      do {
        const query: Record<string, string> = {
          'list-type': '2',
          prefix: `${visibility}/${organizationId}/`,
        };
        if (token) query['continuation-token'] = token;
        const res = await this.send('GET', '', query);
        if (!res.ok) {
          throw new Error(`Storage listing failed with status ${res.status}`);
        }
        const xml = await res.text();
        for (const match of xml.matchAll(/<Size>(\d+)<\/Size>/g)) bytes += Number(match[1]);
        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
          ? xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
          : undefined;
      } while (token);
    }
    this.usageCache.set(organizationId, { bytes, at: Date.now() });
    return bytes;
  }

  /** One signed request against `<endpoint>/<bucket>/<key>`. */
  private send(
    method: 'GET' | 'PUT',
    key: string,
    query: Record<string, string> = {},
    body?: Buffer,
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const basePath = this.endpoint.pathname.replace(/\/+$/, '');
    const path = `${basePath}/${encode(this.bucket)}${key ? `/${encode(key, true)}` : ''}`;
    const canonicalQuery = Object.keys(query)
      .sort()
      .map((k) => `${encode(k)}=${encode(query[k])}`)
      .join('&');
    const amzDate = this.now()
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '');
    const day = amzDate.slice(0, 8);
    const payloadHash = sha256(body ?? '');
    const headers: Record<string, string> = {
      host: this.endpoint.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...extraHeaders,
    };
    const signedNames = Object.keys(headers).sort();
    const canonicalRequest = [
      method,
      path,
      canonicalQuery,
      signedNames.map((name) => `${name}:${headers[name].trim()}\n`).join(''),
      signedNames.join(';'),
      payloadHash,
    ].join('\n');
    const scope = `${day}/${this.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.secretAccessKey}`, day), this.region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const { host: _host, ...sendHeaders } = headers;
    void _host; // fetch sets Host itself
    return this.fetchImpl(
      `${this.endpoint.origin}${path}${canonicalQuery ? `?${canonicalQuery}` : ''}`,
      {
        method,
        headers: {
          ...sendHeaders,
          authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedNames.join(';')}, Signature=${signature}`,
        },
        body,
      },
    );
  }
}
