import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter | null = null;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    if (!host || !user || !pass) {
      this.logger.warn(
        'Serviço de e-mail não configurado. SMTP_HOST, SMTP_USER, SMTP_PASS são obrigatórios no arquivo .env.',
      );
      this.transporter = null;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html: string,
    attachments?: any[],
  ): Promise<boolean> {
    // Re-verify configuration on send call in case environment variables were added dynamically
    if (!this.transporter) {
      this.initTransporter();
    }

    if (!this.transporter) {
      this.logger.error('Transporter de e-mail não inicializado. SMTP não configurado.');
      throw new BadRequestException(
        'Serviço de e-mail não configurado no servidor. Configure as variáveis SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) no arquivo .env e reinicie o container.',
      );
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || `"7bar" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
      attachments,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`E-mail enviado com sucesso: ${info.messageId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Falha ao enviar e-mail: ${error.message}`, error.stack);
      throw new BadRequestException(`Falha no envio do e-mail. Verifique suas credenciais SMTP no .env. Erro: ${error.message}`);
    }
  }
}
