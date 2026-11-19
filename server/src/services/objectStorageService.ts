import type {SourceObjectReceipt} from '../shared/sourceObjectReceipt.js';
import crypto from 'node:crypto';
import { createWriteStream,createReadStream } from 'node:fs';
import { open,stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable,Transform } from 'node:stream';
import {
  DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command,
  PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';
import { AppError, isValidUUID } from '../types/index.js';
import { logger } from '../utils/logger.js';

export type ObjectBucket = 'source' | 'clips';

/** Extension point for videos larger than the initial signed single PUT workflow. */
export interface MultipartUploadCapability {
  createMultipartUpload(bucket: ObjectBucket, key: string, contentType: string): Promise<{ uploadId: string }>;
  signPart(bucket: ObjectBucket, key: string, uploadId: string, partNumber: number): Promise<string>;
  completeMultipartUpload(bucket: ObjectBucket, key: string, uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>): Promise<void>;
  abortMultipartUpload(bucket: ObjectBucket, key: string, uploadId: string): Promise<void>;
}

let client: S3Client | undefined;

function storageClient(): S3Client {
  if (!config.r2AccountId || !config.r2AccessKeyId || !config.r2SecretAccessKey) {
    throw new AppError('Storage is unavailable.', 503, 'STORAGE_UNAVAILABLE');
  }
  client ??= new S3Client({
    region: 'auto',
    endpoint: config.r2Endpoint || `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId: config.r2AccessKeyId, secretAccessKey: config.r2SecretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return client;
}

function bucketName(bucket: ObjectBucket): string {
  return bucket === 'source' ? config.r2SourceBucket : config.r2ClipsBucket;
}

function assertUUID(value: string): void {
  if (!isValidUUID(value)) throw new AppError('Invalid resource ID.', 400, 'INVALID_UUID');
}

export function safeFilename(filename: string): string {
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new AppError('Unsafe filename.', 400, 'INVALID_FILENAME');
  }
  const safe = filename.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120);
  if (!safe || safe === '.' || safe === '..') throw new AppError('Unsafe filename.', 400, 'INVALID_FILENAME');
  return safe;
}

export function sourceObjectKey(userId: string, projectId: string, filename: string): string {
  assertUUID(userId); assertUUID(projectId);
  return `users/${userId}/projects/${projectId}/source/${crypto.randomUUID()}-${safeFilename(filename)}`;
}

export function renderObjectKey(userId: string, projectId: string, clipId: string, version: number): string {
  assertUUID(userId); assertUUID(projectId); assertUUID(clipId);
  if (!Number.isSafeInteger(version) || version < 1) throw new AppError('Invalid render version.', 400, 'INVALID_RENDER_VERSION');
  return `users/${userId}/projects/${projectId}/clips/${clipId}/v${version}/render.mp4`;
}

export function renderAttemptObjectKey(userId:string,projectId:string,clipId:string,version:number,attemptId:string):string{
  assertUUID(attemptId);
  return renderObjectKey(userId,projectId,clipId,version).replace(/render\.mp4$/,`attempts/${attemptId}/render.mp4`);
}

export function projectObjectPrefix(userId: string, projectId: string): string {
  assertUUID(userId); assertUUID(projectId);
  return `users/${userId}/projects/${projectId}/`;
}

export function clipObjectPrefix(userId: string, projectId: string, clipId: string): string {
  assertUUID(clipId);
  return `${projectObjectPrefix(userId, projectId)}clips/${clipId}/`;
}

export async function signSourceUpload(key: string, contentType: string): Promise<string> {
  return getSignedUrl(storageClient(), new PutObjectCommand({
    Bucket: bucketName('source'), Key: key, ContentType: contentType,
  }), { expiresIn: 900 });
}

export async function headObject(bucket: ObjectBucket, key: string): Promise<{ size: number; contentType: string; etag?: string; versionId?: string }> {
  try {
    const result = await storageClient().send(new HeadObjectCommand({ Bucket: bucketName(bucket), Key: key }));
    return { size: result.ContentLength ?? 0, contentType: result.ContentType ?? '', etag: result.ETag, versionId: result.VersionId };
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchKey') {
      throw new AppError('Uploaded object was not found.', 404, 'UPLOAD_NOT_FOUND');
    }
    throw new AppError('Storage is unavailable.', 503, 'STORAGE_UNAVAILABLE');
  }
}

export async function signObjectGet(bucket: ObjectBucket, key: string, filename?: string, options?:{versionId?:string}): Promise<string> {
  return getSignedUrl(storageClient(), new GetObjectCommand({
    Bucket: bucketName(bucket), Key: key,
    ...(options?.versionId?{VersionId:options.versionId}:{}),
    ...(filename ? { ResponseContentDisposition: `attachment; filename="${safeFilename(filename)}"` } : {}),
  }), { expiresIn: 300 });
}

/** Objects at least this big are fetched as parallel byte ranges instead of one stream. */
const PARALLEL_DOWNLOAD_MIN_BYTES = 24 * 1024 * 1024;
const DOWNLOAD_PART_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 8;
/** Slowest throughput a healthy download is allowed before the timeout fires (1 MB/s). */
const MIN_DOWNLOAD_BYTES_PER_MS = 1024 * 1024 / 1000;
const MAX_DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

class RangeNotHonoredError extends Error {}

/** A fixed timeout either kills big downloads or never fires on small ones, so the budget scales with size. */
export function downloadTimeoutForSize(sizeBytes: number, minimumMs: number): number {
  const sizeBudget = 30000 + Math.ceil(sizeBytes / MIN_DOWNLOAD_BYTES_PER_MS);
  return Math.max(minimumMs, Math.min(sizeBudget, MAX_DOWNLOAD_TIMEOUT_MS));
}

async function streamObjectToFile(
  bucket: ObjectBucket,
  key: string,
  path: string,
  signal: AbortSignal,
  expected?: {size:number;etag?:string}
): Promise<{ sizeBytes: number; sha256: string }> {
  const result = await storageClient().send(
    new GetObjectCommand({ Bucket: bucketName(bucket), Key: key, IfMatch: expected?.etag }),
    { abortSignal: signal }
  );
  if (!result.Body) throw new Error('Empty object body');
  const hasher = crypto.createHash('sha256');
  let totalBytes = 0;
  const bodyStream = result.Body as Readable;
  bodyStream.on('data', (chunk) => {
    hasher.update(chunk);
    totalBytes += chunk.length;
  });
  await pipeline(bodyStream, createWriteStream(path, { flags: 'w' }), { signal });
  if (expected && totalBytes !== expected.size) throw new Error('Source object length changed during download.');
  return { sizeBytes: totalBytes, sha256: hasher.digest('hex') };
}

/**
 * Same bytes as streamObjectToFile, fetched as DOWNLOAD_CONCURRENCY concurrent ranged GETs written at their
 * offsets (what `aws s3 cp` does). One TCP stream from R2 tops out far below the link speed; eight don't.
 */
async function rangedObjectToFile(
  bucket: ObjectBucket, key: string, path: string, size: number, etag: string | undefined, signal: AbortSignal
): Promise<void> {
  const handle = await open(path, 'w');
  // The first failed part stops the rest, and every worker settles before the handle closes.
  const parts = new AbortController();
  const stopParts = () => parts.abort(signal.reason);
  signal.addEventListener('abort', stopParts, { once: true });
  let firstError: unknown = null;
  try {
    let nextOffset = 0;
    const fetchPart = async (start: number, end: number): Promise<void> => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const result = await storageClient().send(
            new GetObjectCommand({ Bucket: bucketName(bucket), Key: key, Range: `bytes=${start}-${end}`, IfMatch: etag }),
            { abortSignal: parts.signal }
          );
          if (!result.Body) throw new Error('Empty object body');
          if (!result.ContentRange || Number(result.ContentLength) !== end - start + 1) {
            throw new RangeNotHonoredError('Storage ignored the Range header');
          }
          let position = start;
          for await (const chunk of result.Body as Readable) {
            const buffer = chunk as Buffer;
            await handle.write(buffer, 0, buffer.length, position);
            position += buffer.length;
          }
          if (position !== end + 1) throw new Error(`Short ranged read at ${start}`);
          return;
        } catch (err) {
          if (parts.signal.aborted || err instanceof RangeNotHonoredError || attempt >= 3) throw err;
        }
      }
    };
    const worker = async (): Promise<void> => {
      while (nextOffset < size && !parts.signal.aborted) {
        const start = nextOffset;
        const end = Math.min(size, start + DOWNLOAD_PART_BYTES) - 1;
        nextOffset = end + 1;
        try {
          await fetchPart(start, end);
        } catch (err) {
          firstError ??= err;
          parts.abort(err);
        }
      }
    };
    await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));
    if (firstError) throw firstError;
  } finally {
    signal.removeEventListener('abort', stopParts);
    await handle.close();
  }
}

/** Streams any local file into crypto SHA-256 in 4MB chunks without loading full buffer into memory. */
export async function computeFileStreamSha256(filePath: string): Promise<string> {
  const { createReadStream } = await import('node:fs');
  return new Promise((resolve, reject) => {
    const hasher = crypto.createHash('sha256');
    const stream = createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
    stream.on('data', (chunk) => hasher.update(chunk));
    stream.on('end', () => resolve(hasher.digest('hex')));
    stream.on('error', reject);
  });
}

/** Download to a unique caller-owned temp path with timeout protection and streaming full-content SHA-256. The caller removes the file. */
export async function downloadObjectToFile(
  bucket: ObjectBucket,
  key: string,
  path: string,
  options?: { timeoutMs?: number; requireStreamingSha256?: boolean; requireSnapshotReceipt?: boolean; expectedObject?:{size:number;etag:string;versionId?:string|null} }
): Promise<{ sizeBytes: number; sha256: string; sourceReceipt?:SourceObjectReceipt }> {
  let timeoutMs = options?.timeoutMs || 60000;
  const controller = new AbortController();
  const armTimer = (ms: number) => {
    const timer = setTimeout(() => {
      controller.abort(new Error(`Download timed out after ${ms}ms`));
    }, ms);
    timer.unref();
    return timer;
  };
  let timer = armTimer(timeoutMs);

  try {
    const head = await storageClient().send(
      new HeadObjectCommand({ Bucket: bucketName(bucket), Key: key }),
      { abortSignal: controller.signal }
    );
    const expectedObject=options?.expectedObject;
    if(expectedObject&&(head.ContentLength!==expectedObject.size||head.ETag!==expectedObject.etag||(expectedObject.versionId!=null&&head.VersionId!==expectedObject.versionId)))throw new AppError('Selected output object changed before download.',409,'SOURCE_VERSION_CHANGED');
    const size = Number(head.ContentLength || 0);
    const sizedTimeout = downloadTimeoutForSize(size, timeoutMs);
    if (sizedTimeout > timeoutMs) {
      clearTimeout(timer);
      timeoutMs = sizedTimeout;
      timer = armTimer(timeoutMs);
    }

    const complete = async (download:{sizeBytes:number;sha256:string}) => {
      if(!options?.requireSnapshotReceipt) return download;
      if(!head.ETag || head.ETag.startsWith('W/')) return download;
      const after=await storageClient().send(new HeadObjectCommand({Bucket:bucketName(bucket),Key:key}),{abortSignal:controller.signal});
      if(after.ETag!==head.ETag||after.ContentLength!==head.ContentLength||after.VersionId!==head.VersionId)throw new AppError('Source object changed during download.',409,'SOURCE_VERSION_CHANGED');
      return {...download,sourceReceipt:{key,size:download.sizeBytes,etag:head.ETag,sha256:download.sha256}};
    };

    // Default to wire-speed single stream hashing to avoid a second disk read
    if (size >= PARALLEL_DOWNLOAD_MIN_BYTES && !options?.requireStreamingSha256) {
      try {
        await rangedObjectToFile(bucket, key, path, size, head.ETag, controller.signal);
        const sha256 = await computeFileStreamSha256(path);
        return await complete({ sizeBytes: size, sha256 });
      } catch (err) {
        if (!(err instanceof RangeNotHonoredError)) throw err;
      }
    }
    return await complete(await streamObjectToFile(bucket, key, path, controller.signal, {size,etag:head.ETag}));
  } catch (err: any) {
    if (controller.signal.aborted || err?.name === 'AbortError') {
      throw new AppError(`Source object download timed out after ${timeoutMs / 1000}s.`, 504, 'DOWNLOAD_TIMEOUT');
    }
    if(err?.code==='SOURCE_VERSION_CHANGED')throw err;
    throw new AppError('Source object is unavailable.', 503, 'STORAGE_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadFile(
  bucket: ObjectBucket,
  key: string,
  path: string,
  size: number,
  contentType: string
): Promise<{ sha256: string }> {
  let source:ReturnType<typeof createReadStream>|undefined;
  let body:Transform|undefined;
  const abort=new AbortController();
  try {
    const metadata=await stat(path);
    if(!metadata.isFile()||!Number.isSafeInteger(size)||size<0||metadata.size!==size)throw new Error('Upload file length does not match its declared size.');
    const hash=crypto.createHash('sha256');let bytes=0;
    source=createReadStream(path,{highWaterMark:64*1024});
    body=new Transform({highWaterMark:64*1024,transform(chunk,_encoding,callback){
      bytes+=chunk.length;
      if(bytes>size){callback(new Error('Upload file grew during streaming.'));return;}
      hash.update(chunk);callback(null,chunk);
    },flush(callback){callback(bytes===size?undefined:new Error('Upload file ended before its declared length.'));}});
    const pumping=pipeline(source,body);
    const sending=Promise.resolve().then(()=>storageClient().send(new PutObjectCommand({Bucket:bucketName(bucket),Key:key,Body:body,ContentLength:size,ContentType:contentType}),{abortSignal:abort.signal}));
    await Promise.all([pumping,sending]);
    return {sha256:hash.digest('hex')};
  } catch (err: any) {
    abort.abort();source?.destroy();body?.destroy();
    logger.error('Rendered object upload failed in storageClient', {
      bucket,
      key,
      path,
      size,
      errorName: err?.name,
      errorMessage: err?.message,
      errorCode: err?.Code || err?.code,
      statusCode: err?.$metadata?.httpStatusCode,
    });
    throw new AppError('Rendered object upload failed.', 503, 'STORAGE_UNAVAILABLE');
  }
}

export async function listObjects(
  bucket: ObjectBucket,
  prefix: string,
  options?: { maxKeys?: number; continuationToken?: string }
): Promise<{ keys: Array<{ key: string; size: number; lastModified?: Date }>; nextContinuationToken?: string }> {
  const listed = await storageClient().send(
    new ListObjectsV2Command({
      Bucket: bucketName(bucket),
      Prefix: prefix,
      MaxKeys: options?.maxKeys || 1000,
      ContinuationToken: options?.continuationToken,
    })
  );

  const keys = (listed.Contents || []).flatMap((item) =>
    item.Key ? [{ key: item.Key, size: item.Size || 0, lastModified: item.LastModified }] : []
  );

  return {
    keys,
    nextContinuationToken: listed.NextContinuationToken,
  };
}

export async function deleteObject(bucket: ObjectBucket, key: string): Promise<void> {
  await storageClient().send(new DeleteObjectsCommand({
    Bucket: bucketName(bucket), Delete: { Objects: [{ Key: key }], Quiet: true },
  }));
}

export async function deletePrefix(bucket: ObjectBucket, prefix: string): Promise<void> {
  let continuationToken: string | undefined;
  const keys: string[] = [];
  do {
    const listed = await storageClient().send(new ListObjectsV2Command({
      Bucket: bucketName(bucket), Prefix: prefix, ContinuationToken: continuationToken,
    }));
    keys.push(...(listed.Contents || []).flatMap((item) => item.Key ? [item.Key] : []));
    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
  for (let i = 0; i < keys.length; i += 1000) {
    await storageClient().send(new DeleteObjectsCommand({
      Bucket: bucketName(bucket), Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
    }));
  }
}
