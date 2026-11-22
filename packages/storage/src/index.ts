import type { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { StorageEnv } from "@shuki/config";

export type PutObjectInput = {
  key: string;
  body: Readable | ReadableStream | Uint8Array;
  contentType: string;
};

export type StoredObject = {
  body: ReadableStream<Uint8Array>;
  contentType: string | undefined;
  contentLength: number | undefined;
};

export class Storage {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(env: StorageEnv) {
    this.#bucket = env.S3_BUCKET;
    this.#client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  /** Creates the bucket if it does not exist yet. */
  async ensureBucket(): Promise<void> {
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        await this.#client.send(new CreateBucketCommand({ Bucket: this.#bucket }));
        return;
      }
      throw error;
    }
  }

  /** Lightweight reachability check for health endpoints. */
  async ping(): Promise<boolean> {
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
      return true;
    } catch {
      return false;
    }
  }

  /** Streams an object to S3 (multipart upload for large bodies). */
  async put({ key, body, contentType }: PutObjectInput): Promise<void> {
    const upload = new Upload({
      client: this.#client,
      params: { Bucket: this.#bucket, Key: key, Body: body, ContentType: contentType },
    });
    await upload.done();
  }

  async get(key: string): Promise<StoredObject> {
    const result = await this.#client.send(
      new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
    );
    if (!result.Body) throw new Error(`Object ${key} has no body`);
    return {
      body: result.Body.transformToWebStream(),
      contentType: result.ContentType,
      contentLength: result.ContentLength,
    };
  }

  async delete(key: string): Promise<void> {
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
  }
}

/** Key conventions – everything is namespaced per user. */
export const storageKeys = {
  paperFile: (userId: string, paperId: string, fileId: string) =>
    `users/${userId}/papers/${paperId}/${fileId}`,
  /** Preview image of a paper (first PDF page or the website's image). */
  paperThumbnail: (userId: string, paperId: string) =>
    `users/${userId}/papers/${paperId}/thumbnail`,
};
