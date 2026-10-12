import fs from "fs/promises";
import path from "path";

export interface StoredFileResult {
  fileName: string;
  filePath: string;
  fileSize: number;
}

export async function saveUploadedFile(
  fileBuffer: Buffer,
  originalName: string
): Promise<StoredFileResult> {
  const uploadDir = process.env.STORAGE_LOCAL_DIR || "./public/uploads";
  const absoluteDir = path.resolve(process.cwd(), uploadDir);

  // Ensure upload directory exists
  await fs.mkdir(absoluteDir, { recursive: true });

  const timestamp = Date.now();
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uniqueFileName = `${timestamp}_${sanitizedName}`;
  const targetPath = path.join(absoluteDir, uniqueFileName);

  await fs.writeFile(targetPath, fileBuffer);

  return {
    fileName: originalName,
    filePath: path.relative(process.cwd(), targetPath).replace(/\\/g, "/"),
    fileSize: fileBuffer.length,
  };
}

export async function readUploadedFile(filePath: string): Promise<Buffer> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  return await fs.readFile(absolutePath);
}

export async function deleteUploadedFile(filePath?: string | null): Promise<void> {
  if (!filePath) return;
  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    await fs.unlink(absolutePath);
  } catch {
    // Ignore file deletion error if file does not exist
  }
}
