import { BackupsService } from './backups.service';

describe('integridade do resultado de backup', () => {
  it('não declara envio remoto concluído quando faltam credenciais do Drive', async () => {
    const keys = ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN'] as const;
    const previous = keys.map(key => process.env[key]);
    try {
      keys.forEach(key => delete process.env[key]);
      const service = new BackupsService({} as any);
      await expect((service as any).uploadToGoogleDrive('backup.sql', 'backup.sql'))
        .rejects.toThrow('credenciais do Google Drive');
    } finally {
      keys.forEach((key, index) => {
        if (previous[index] === undefined) delete process.env[key];
        else process.env[key] = previous[index];
      });
    }
  });
});
