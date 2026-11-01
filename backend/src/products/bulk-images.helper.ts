import { BadRequestException } from '@nestjs/common';

export const BULK_IMAGE_MAX_FILES = 10;
export const BULK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export interface BulkImageIdentity { fileId?: string; fileName: string }

// Compatibility with older clients: Multer reads unlabelled filename parameters
// as Latin-1. Only undo that interpretation when the byte sequence is valid UTF-8.
export function decodeLegacyImageName(name: string): string {
  if ([...name].some(char => char.charCodeAt(0) > 255)) return name;
  const bytes = Buffer.from(name, 'latin1');
  const decoded = bytes.toString('utf8');
  return Buffer.from(decoded, 'utf8').equals(bytes) ? decoded : name;
}

export function bulkImageIdentities(files: Express.Multer.File[], manifest?: string): BulkImageIdentity[] {
  if (!files.length || files.length > BULK_IMAGE_MAX_FILES ||
      files.reduce((sum, file) => sum + file.size, 0) > BULK_IMAGE_MAX_BYTES) {
    throw new BadRequestException('Envie lotes de até 10 imagens e 5 MB no total.');
  }
  if (files.some(file => !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype))) {
    throw new BadRequestException('Use somente imagens JPG, PNG, WEBP ou GIF.');
  }
  if (manifest === undefined) return files.map(file => ({ fileName: decodeLegacyImageName(file.originalname) }));
  let entries: any;
  try { entries = JSON.parse(manifest); } catch { throw new BadRequestException('Lista de imagens inválida.'); }
  const ids = new Set<string>();
  if (!Array.isArray(entries) || entries.length !== files.length || entries.some((entry, index) => {
    if (!entry || typeof entry.fileId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(entry.fileId) ||
        ids.has(entry.fileId) || typeof entry.fileName !== 'string' || !entry.fileName.trim() ||
        entry.fileName.length > 255 || /[\\/\u0000-\u001f]/.test(entry.fileName) ||
        files[index].originalname !== entry.fileId) return true;
    ids.add(entry.fileId);
    return false;
  })) throw new BadRequestException('Lista de imagens inválida ou fora de ordem.');
  return entries.map(({ fileId, fileName }) => ({ fileId, fileName }));
}
