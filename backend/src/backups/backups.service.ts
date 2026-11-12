import { Injectable, Logger, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import archiver = require('archiver');
import { HeartPrismaService } from '../prisma/heart-prisma.service';
import { google } from 'googleapis';

/**
 * Executa mysqldump usando spawn (sem shell) e escreve o stdout direto em arquivo.
 * Evita problemas de quoting/escaping com caracteres especiais (@, #, etc.) na senha.
 */
function runMysqldump(args: string[], filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('mysqldump', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = fs.createWriteStream(filepath);
    child.stdout.pipe(out);

    let stderrBuf = '';
    child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

    child.on('close', (code) => {
      out.close();
      if (code === 0) {
        resolve();
      } else {
        // Remove arquivo vazio em caso de falha
        try { fs.unlinkSync(filepath); } catch {}
        reject(new Error(stderrBuf.trim() || `mysqldump saiu com código ${code}`));
      }
    });

    child.on('error', (err) => {
      out.close();
      try { fs.unlinkSync(filepath); } catch {}
      reject(err);
    });
  });
}

/**
 * Restaura um backup usando mysql sem shell — lê o arquivo e passa via stdin.
 */
function runMysqlRestore(args: string[], filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('mysql', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    const input = fs.createReadStream(filepath);
    input.pipe(child.stdin);

    let stderrBuf = '';
    child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderrBuf.trim() || `mysql saiu com código ${code}`));
      }
    });

    child.on('error', reject);
  });
}

export interface BackupGroup {
  folderName: string;
  isHeart: boolean;
  tenantName: string | null;
  files: {
    filename: string;
    sizeBytes: number;
    createdAt: Date;
    path: string;
  }[];
}

@Injectable()
export class BackupsService implements OnModuleInit {
  private readonly logger = new Logger(BackupsService.name);
  private readonly backupDir = path.join(process.cwd(), 'backups');
  private readonly configPath = path.join(process.cwd(), 'backups', 'schedule.json');
  private lastScheduledBackupDate: string | null = null;
  private driveFolderCache: { dateStr: string, folderId: string } | null = null;

  constructor(private heartPrisma: HeartPrismaService) {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async onModuleInit() {
    try {
      this.logger.log('Ajustando autenticação do usuário root no MySQL para suportar mysqldump (mysql_native_password)...');
      const heartConfig = this.getDbConfig(process.env.DATABASE_URL_HEART!);
      // Escapa a senha para literal SQL (a senha vem do ambiente, nunca do usuário).
      const pwd = String(heartConfig.password ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''");
      await this.heartPrisma.$executeRawUnsafe(`ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY '${pwd}';`);
      await this.heartPrisma.$executeRawUnsafe(`ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${pwd}';`);
      await this.heartPrisma.$executeRawUnsafe(`FLUSH PRIVILEGES;`);
      this.logger.log('Autenticação do usuário root ajustada com sucesso.');
    } catch (e: any) {
      this.logger.error(`Não foi possível ajustar o usuário root no MySQL (pode já estar configurado): ${e.message}`);
    }
  }

  private async uploadToGoogleDrive(filepath: string, filename: string, driveFilename?: string) {
    try {
      const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
      const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

      if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('As credenciais do Google Drive OAuth2 não estão configuradas nas variáveis de ambiente.');
      }

      const auth = new google.auth.OAuth2(clientId, clientSecret);
      auth.setCredentials({ refresh_token: refreshToken });

      const drive = google.drive({ version: 'v3', auth });

      // Procurar pasta "backups" (case-insensitive via JavaScript para evitar problemas)
      const res = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      let parentFolderId = res.data.files?.find(f => f.name && f.name.toLowerCase().includes('backup'))?.id;

      if (!parentFolderId) {
         this.logger.warn('Pasta "backups" não encontrada no Google Drive da conta de serviço. O arquivo será salvo na raiz do Drive da conta de serviço.');
      }

      let targetFolderId = parentFolderId;

      if (parentFolderId) {
        // Obter data atual no formato DD-MM-YYYY
        const dateStr = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '-');

        if (this.driveFolderCache && this.driveFolderCache.dateStr === dateStr) {
           targetFolderId = this.driveFolderCache.folderId;
        } else {
          // Verificar se a pasta com a data já existe dentro do parentFolderId
          const dateFolderRes = await drive.files.list({
            q: `mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and name='${dateStr}' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive',
          });

          let dateFolderId = dateFolderRes.data.files?.[0]?.id;

          if (!dateFolderId) {
            // Criar pasta da data
            const folderMetadata = {
              name: dateStr,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [parentFolderId]
            };
            const folder = await drive.files.create({
              requestBody: folderMetadata,
              fields: 'id'
            });
            dateFolderId = folder.data.id;
          }

          targetFolderId = dateFolderId;
          this.driveFolderCache = { dateStr, folderId: targetFolderId as string };
        }
      }

      const finalName = driveFilename || filename;

      const fileMetadata: any = {
        name: finalName,
      };
      if (targetFolderId) {
        fileMetadata.parents = [targetFolderId];
      }

      const media = {
        mimeType: finalName.endsWith('.zip') ? 'application/zip' : 'application/sql',
        body: fs.createReadStream(filepath),
      };

      const file = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id',
      });

      this.logger.log(`Backup enviado para o Google Drive com sucesso. File Id: ${file.data.id}`);

    } catch (e: any) {
      this.logger.error(`Falha ao enviar backup para o Google Drive: ${e.message}`);
    }
  }

  private getDbConfig(url: string) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || '3306',
      user: parsed.username,
      password: decodeURIComponent(parsed.password),
      db: parsed.pathname.slice(1)
    };
  }

  private async cleanOldBackups() {
    try {
      if (!fs.existsSync(this.backupDir)) return;
      const dirs = fs.readdirSync(this.backupDir, { withFileTypes: true });

      for (const dirent of dirs) {
        if (dirent.isDirectory()) {
          const folderPath = path.join(this.backupDir, dirent.name);
          const files = fs.readdirSync(folderPath);

          const backupFiles = files
            .filter(file => file.endsWith('.sql') || file.endsWith('.sql.gz'))
            .map(file => {
              const filePath = path.join(folderPath, file);
              const stats = fs.statSync(filePath);
              return { file, filePath, mtimeMs: stats.mtimeMs };
            })
            .sort((a, b) => b.mtimeMs - a.mtimeMs); // Ordenar por data decrescente (mais novos primeiro)

          // Manter apenas os 7 mais recentes
          const filesToDelete = backupFiles.slice(7);

          for (const { file, filePath } of filesToDelete) {
            fs.unlinkSync(filePath);
            this.logger.log(`Backup removido (excedeu limite de 7 por banco): ${folderPath}/${file}`);
          }
        }
      }
    } catch (e: any) {
      this.logger.error(`Erro ao limpar backups antigos: ${e.message}`);
    }
  }

  async listBackups(): Promise<BackupGroup[]> {
    await this.cleanOldBackups();
    if (!fs.existsSync(this.backupDir)) return [];

    const dirs = fs.readdirSync(this.backupDir, { withFileTypes: true });
    const groups: BackupGroup[] = [];

    for (const dirent of dirs) {
      if (!dirent.isDirectory()) continue;

      const folderPath = path.join(this.backupDir, dirent.name);
      const isHeart = dirent.name === 'heart';
      const tenantName = dirent.name.startsWith('tenant_') ? dirent.name.replace('tenant_', '') : null;

      const filesInDir = fs.readdirSync(folderPath);
      const files = filesInDir
        .filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz'))
        .map(file => {
          const stats = fs.statSync(path.join(folderPath, file));
          return {
            filename: file,
            sizeBytes: stats.size,
            createdAt: stats.mtime,
            path: `${dirent.name}/${file}`
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      if (files.length > 0) {
        groups.push({
          folderName: dirent.name,
          isHeart,
          tenantName,
          files
        });
      }
    }

    // Ordenar para que "heart" venha primeiro
    groups.sort((a, b) => {
      if (a.isHeart) return -1;
      if (b.isHeart) return 1;
      return a.folderName.localeCompare(b.folderName);
    });

    return groups;
  }

  async createBackup(type: 'heart' | 'tenant' | 'all', tenantId?: string) {
    await this.cleanOldBackups();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const heartConfig = this.getDbConfig(process.env.DATABASE_URL_HEART!);

    if (type === 'heart' || type === 'all') {
      const folderPath = path.join(this.backupDir, 'heart');
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      const filename = `backup_heart_${timestamp}.sql`;
      const filepath = path.join(folderPath, filename);
      const args = [
        '--skip-ssl-verify-server-cert',
        '--default-auth=mysql_native_password',
        `-h${heartConfig.host}`,
        `-P${heartConfig.port}`,
        `-u${heartConfig.user}`,
        `-p${heartConfig.password}`,
        heartConfig.db,
      ];

      try {
        await runMysqldump(args, filepath);
        this.logger.log(`Backup do Heart criado em: heart/${filename}`);
        await this.uploadToGoogleDrive(filepath, filename, 'heart.sql');
      } catch (e: any) {
        this.logger.error(`Falha no backup do Heart: ${e.message}`);
        throw new BadRequestException('Falha ao criar backup do Heart: ' + e.message);
      }
    }

    if (type === 'tenant' && tenantId) {
      const tenant = await this.heartPrisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException('Tenant não encontrado');

      const tConfig = this.getDbConfig(tenant.databaseUrl);
      const slug = tenant.razaoSocial ? tenant.razaoSocial.replace(/[^a-zA-Z0-9]/g, '_') : tenant.name;
      const folderName = `tenant_${slug}`;
      const folderPath = path.join(this.backupDir, folderName);
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      const filename = `backup_tenant_${slug}_${timestamp}.sql`;
      const filepath = path.join(folderPath, filename);
      const args = [
        '--skip-ssl-verify-server-cert',
        '--default-auth=mysql_native_password',
        `-h${tConfig.host}`,
        `-P${tConfig.port}`,
        `-u${tConfig.user}`,
        `-p${tConfig.password}`,
        tConfig.db,
      ];

      try {
        await runMysqldump(args, filepath);
        this.logger.log(`Backup do Tenant ${tenant.name} criado em: ${folderName}/${filename}`);
        await this.uploadToGoogleDrive(filepath, filename, `tenant_${slug}.sql`);
      } catch (e: any) {
        this.logger.error(`Falha no backup do Tenant ${tenant.name}: ${e.message}`);
        throw new BadRequestException('Falha ao criar backup do Tenant: ' + e.message);
      }
    }

    if (type === 'all') {
      const tenants = await this.heartPrisma.tenant.findMany();
      for (const tenant of tenants) {
        const tConfig = this.getDbConfig(tenant.databaseUrl);
        const slug = tenant.razaoSocial ? tenant.razaoSocial.replace(/[^a-zA-Z0-9]/g, '_') : tenant.name;
        const folderName = `tenant_${slug}`;
        const folderPath = path.join(this.backupDir, folderName);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

        const filename = `backup_tenant_${slug}_${timestamp}.sql`;
        const filepath = path.join(folderPath, filename);
        const args = [
          '--skip-ssl-verify-server-cert',
          '--default-auth=mysql_native_password',
          `-h${tConfig.host}`,
          `-P${tConfig.port}`,
          `-u${tConfig.user}`,
          `-p${tConfig.password}`,
          tConfig.db,
        ];

        try {
          await runMysqldump(args, filepath);
          this.logger.log(`Backup do Tenant ${tenant.name} criado em: ${folderName}/${filename}`);
          await this.uploadToGoogleDrive(filepath, filename, `tenant_${slug}.sql`);
        } catch (e: any) {
          this.logger.error(`Falha no backup do Tenant ${tenant.name}: ${e.message}`);
        }
      }
    }

    return { success: true, message: 'Backup concluído com sucesso' };
  }

  async deleteBackup(folder: string, filename: string) {
    const filepath = path.join(this.backupDir, folder, filename);
    if (!fs.existsSync(filepath)) throw new NotFoundException('Arquivo de backup não encontrado');
    fs.unlinkSync(filepath);
    return { success: true };
  }

  async restoreBackup(folder: string, filename: string) {
    const filepath = path.join(this.backupDir, folder, filename);
    if (!fs.existsSync(filepath)) throw new NotFoundException('Arquivo de backup não encontrado');

    const heartConfig = this.getDbConfig(process.env.DATABASE_URL_HEART!);

    let dbConfig = heartConfig;
    if (folder === 'heart') {
      // Mantém dbConfig = heartConfig
    } else if (folder.startsWith('tenant_')) {
      const tenants = await this.heartPrisma.tenant.findMany();
      const tenant = tenants.find(t => {
        const slug = t.razaoSocial ? t.razaoSocial.replace(/[^a-zA-Z0-9]/g, '_') : t.name;
        return `tenant_${slug}` === folder;
      });
      if (!tenant) throw new NotFoundException('Tenant referente a este backup não foi encontrado no banco de dados principal.');

      dbConfig = this.getDbConfig(tenant.databaseUrl);
    } else {
       throw new BadRequestException('Formato de arquivo não reconhecido.');
    }

    const restoreArgs = [
      '--skip-ssl-verify-server-cert',
      '--default-auth=mysql_native_password',
      `-h${dbConfig.host}`,
      `-P${dbConfig.port}`,
      `-u${dbConfig.user}`,
      `-p${dbConfig.password}`,
      dbConfig.db,
    ];
    try {
      await runMysqlRestore(restoreArgs, filepath);
      this.logger.log(`Backup restaurado: ${folder}/${filename}`);
      return { success: true };
    } catch (e: any) {
      this.logger.error(`Falha ao restaurar backup: ${e.message}`);
      throw new BadRequestException('Falha ao restaurar backup: ' + e.message);
    }
  }

  getBackupFilePath(folder: string, filename: string) {
    const filepath = path.join(this.backupDir, folder, filename);
    if (!fs.existsSync(filepath)) throw new NotFoundException('Arquivo não encontrado');
    return filepath;
  }

  getSchedule() {
    if (fs.existsSync(this.configPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      } catch {
        return { enabled: false, time: '02:00' };
      }
    }
    return { enabled: false, time: '02:00' };
  }

  setSchedule(config: { enabled: boolean; time: string }) {
    fs.writeFileSync(this.configPath, JSON.stringify(config));
    return config;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    const config = this.getSchedule();
    if (!config.enabled) return;

    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${mins}`;

    if (currentTime === config.time) {
      const today = now.toISOString().split('T')[0];
      if (this.lastScheduledBackupDate !== today) {
        this.lastScheduledBackupDate = today;
        this.logger.log(`Disparando backup agendado para ${config.time}...`);
        await this.createBackup('all');
      }
    }
  }

  async downloadAll(res: any) {
    if (!fs.existsSync(this.backupDir)) throw new NotFoundException('Nenhum backup disponível');

    const archive = archiver('zip', { zlib: { level: 9 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="Backups_PDV_Geral_${new Date().toISOString().replace(/[:.]/g, '-')}.zip"`);

    archive.on('error', (err: any) => {
      this.logger.error(`Erro ao criar ZIP: ${err.message}`);
      res.status(500).send({ error: err.message });
    });

    const groups = await this.listBackups();
    for (const group of groups) {
      if (group.files.length > 0) {
        const mostRecentFile = group.files[0];
        const filepath = path.join(this.backupDir, mostRecentFile.path);
        archive.file(filepath, { name: `backups/${mostRecentFile.path}` });
      }
    }

    archive.pipe(res);
    await archive.finalize();
  }
}
