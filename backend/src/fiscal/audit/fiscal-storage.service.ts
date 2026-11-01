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
  private readonly baseDir = process.env.FISCAL_STORAGE_PATH || '/app/uploads/fiscal';

  saveXml(chave: string, xmlContent: string): StorageResult {
    const now  = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');

    const dir = path.join(this.baseDir, year, month);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `${chave}.xml`;
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
    const fullPath = path.join('/app/uploads', xmlPath);
    if (!fs.existsSync(fullPath)) {
      this.logger.warn(`XML não encontrado: ${fullPath}`);
      return null;
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  verifyIntegrity(xmlPath: string, expectedHash: string): boolean {
    const content = this.readXml(xmlPath);
    if (!content) return false;
    const actualHash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
    return actualHash === expectedHash;
  }

  deleteXml(xmlPath: string): boolean {
    const fullPath = path.join('/app/uploads', xmlPath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        this.logger.log(`XML excluido do disco: ${fullPath}`);
        return true;
      } catch (err: any) {
        this.logger.error(`Falha ao excluir XML: ${fullPath} | ${err.message}`);
        return false;
      }
    }
    return false;
  }
}
