import { BadRequestException } from '@nestjs/common';

export type ServiceAddonSettings = {
  trackAddedBy: boolean;
  commissionOnAdd: boolean;
  commissionAmount: number;
  legacyCommissionPercent?: number;
};

export const addonSettingsId = (serviceId: string) => `petshop_addon:${serviceId}`;

export function parseAddonSettings(value: unknown): ServiceAddonSettings {
  const config = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const commissionOnAdd = config.commissionOnAdd === true;
  const amount = Number(config.commissionAmount ?? 0);
  const legacyPercent = config.commissionAmount === undefined ? Number(config.commissionPercent ?? 0) : 0;
  return {
    trackAddedBy: commissionOnAdd || config.trackAddedBy === true,
    commissionOnAdd,
    commissionAmount: Number.isFinite(amount) ? amount : 0,
    ...(commissionOnAdd && legacyPercent > 0 && Number.isFinite(legacyPercent) ? { legacyCommissionPercent: legacyPercent } : {}),
  };
}

export function validateAddonSettings(data: any, current?: ServiceAddonSettings): ServiceAddonSettings {
  const settings = parseAddonSettings({
    trackAddedBy: data.trackAddedBy ?? current?.trackAddedBy ?? false,
    commissionOnAdd: data.commissionOnAdd ?? current?.commissionOnAdd ?? false,
    commissionAmount: data.commissionAmount ?? current?.commissionAmount ?? 0,
  });
  if (settings.commissionAmount < 0 || settings.commissionAmount > 999999.99 ||
      !/^\d+(\.\d{1,2})?$/.test(String(settings.commissionAmount))) {
    throw new BadRequestException('Valor fixo de comissão inválido (até duas casas decimais).');
  }
  if (settings.commissionOnAdd && settings.commissionAmount <= 0) {
    throw new BadRequestException('Informe um valor fixo maior que zero para comissionar a inclusão do serviço.');
  }
  return settings;
}
