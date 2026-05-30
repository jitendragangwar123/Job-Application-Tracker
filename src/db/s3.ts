import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

declare global {
  // eslint-disable-next-line no-var
  var __s3: S3Client | undefined;
}

export const s3 =
  global.__s3 ??
  new S3Client({
    endpoint: env.s3.endpoint,
    region: env.s3.region,
    credentials: {
      accessKeyId: env.s3.accessKey,
      secretAccessKey: env.s3.secretKey,
    },
    forcePathStyle: env.s3.forcePathStyle,
  });

if (env.nodeEnv !== 'production') {
  global.__s3 = s3;
}

const BUCKET = env.s3.bucket;

export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || status === 301) {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    } else {
      throw err;
    }
  }
}

export interface PutOpts {
  key: string;
  body: Buffer;
  contentType: string;
}

export async function putObject({ key, body, contentType }: PutOpts): Promise<void> {
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function getSignedDownloadUrl(
  key: string,
  filename: string,
  expiresInSeconds = 15 * 60,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    }),
    { expiresIn: expiresInSeconds },
  );
}
