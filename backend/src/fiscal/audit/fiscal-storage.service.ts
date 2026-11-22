import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface StorageResult {
  xmlPath: string;
  xmlHash: string;
  xmlSize: number;
}

/**
 * FiscalStorageService — Salva XMLs fiscais no sistema de arquivos local.
 *
 * Organização: /uploads/fiscal/YYYY/MM/<chave>.xml
 *
 * Em uma evolução futura (V2), basta trocar a implementação desta classe
 * para salvar no S3/MinIO/Cloudflare R2 sem alterar nenhum chamador.
 */
@Injectable()
export class FiscalStorageService {
  private readonly logger = new Logger(FiscalStorageService.name);
  private readonly baseDir = process.env.FISCAL_STORAGE_PATH || path.resolve(process.cwd(), 'private-data', 'fiscal');
  private readonly legacyBaseDir = path.resolve(process.cwd(), 'uploads', 'fiscal');

  private resolveSafeXmlPath(xmlPath: string, rootDir: string): string | null {
    if (!xmlPath || typeof xmlPath !== 'string' || path.isAbsolute(xmlPath)) return null;
    const normalized = xmlPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const stripped = normalized.startsWith('fiscal/') ? normalized.slice('fiscal/'.length) : normalized;
    if (!stripped) return null;
    const base = path.resolve(rootDir);
    const resolved = path.resolve(base, stripped);
    if (!resolved.startsWith(base + path.sep)) return null;
    return resolved;
  }

  saveXml(chave: string, xmlContent: string): StorageResult {
    const safeChave = String(chave || '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeChave) {
      throw new Error('Chave fiscal inválida para armazenamento.');
    }
    const now  = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    const dir = path.join(this.baseDir, year, month);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `${safeChave}.xml`;
    const fullPath = path.join(dir, filename);
    const relativePath = path.join('fiscal', year, month, filename);

    fs.writeFileSync(fullPath, xmlContent, 'utf-8');

    const xmlHash = crypto.createHash('sha256').update(xmlContent, 'utf-8').digest('hex');
    const xmlSize = Buffer.byteLength(xmlContent, 'utf-8');

    this.logger.log(`XML salvo: ${relativePath} | SHA-256: ${xmlHash.substring(0, 12)}... | ${xmlSize} bytes`);

    return {
      xmlPath: relativePath,
      xmlHash,
      xmlSize,
    };
  }

  readXml(xmlPath: string): string | null {
    const candidates = [
      this.resolveSafeXmlPath(xmlPath, this.baseDir),
      this.resolveSafeXmlPath(xmlPath, this.legacyBaseDir),
    ].filter((p): p is string => Boolean(p));

    for (const fullPath of candidates) {
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf-8');
      }
    }

    this.logger.warn(`XML não encontrado: ${xmlPath}`);
    return null;
  }

  verifyIntegrity(xmlPath: string, expectedHash: string): boolean {
    const content = this.readXml(xmlPath);
    if (!content) return false;
    const actualHash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
    return actualHash === expectedHash;
  }

  deleteXml(xmlPath: string): boolean {
    const candidates = [
      this.resolveSafeXmlPath(xmlPath, this.baseDir),
      this.resolveSafeXmlPath(xmlPath, this.legacyBaseDir),
    ].filter((p): p is string => Boolean(p));

    let deleted = false;
    for (const fullPath of candidates) {
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
          this.logger.log(`XML excluido do disco: ${fullPath}`);
          deleted = true;
        } catch (err: any) {
          this.logger.error(`Falha ao excluir XML: ${fullPath} | ${err.message}`);
        }
      }
    }
    return deleted;
  }
}
