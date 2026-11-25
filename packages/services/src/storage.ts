import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Armazenamento de arquivos (extratos, relatórios). Chaves sempre prefixadas pela organização. */
export interface Storage {
  put(key: string, bytes: Uint8Array, mime?: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function localStorage(dir = process.env.STORAGE_LOCAL_DIR ? resolve(REPO_ROOT, process.env.STORAGE_LOCAL_DIR) : join(REPO_ROOT, "storage")): Storage {
  const safe = (key: string) => {
    if (key.includes("..")) throw new Error("Chave inválida");
    return join(dir, key);
  };
  return {
    async put(key, bytes) {
      await mkdir(dirname(safe(key)), { recursive: true });
      await writeFile(safe(key), bytes);
    },
    async get(key) {
      return new Uint8Array(await readFile(safe(key)));
    },
    async delete(key) {
      await rm(safe(key), { force: true });
    },
  };
}

export async function s3Storage(): Promise<Storage> {
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.S3_REGION ?? "sa-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: process.env.S3_ACCESS_KEY_ID ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" } : undefined,
  });
  const Bucket = process.env.S3_BUCKET!;
  return {
    async put(key, bytes, mime) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: mime, ServerSideEncryption: "AES256" }));
    },
    async get(key) {
      const r = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return new Uint8Array(await r.Body!.transformToByteArray());
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}

let cached: Promise<Storage> | undefined;
export function getStorage(): Promise<Storage> {
  if (!cached) cached = process.env.STORAGE_DRIVER === "s3" ? s3Storage() : Promise.resolve(localStorage());
  return cached;
}

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
