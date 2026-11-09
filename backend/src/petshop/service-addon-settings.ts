import { BadRequestException } from '@nestjs/common';

export type ServiceAddonSettings = {
  trackAddedBy: boolean;
  commissionOnAdd: boolean;
  commissionPercent: number;
};

export const addonSettingsId = (serviceId: string) => `petshop_addon:${serviceId}`;

export function parseAddonSettings(value: unknown): ServiceAddonSettings {
  const config = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const commissionOnAdd = config.commissionOnAdd === true;
  const percent = Number(config.commissionPercent ?? 0);
  return {
    trackAddedBy: commissionOnAdd || config.trackAddedBy === true,
    commissionOnAdd,
    commissionPercent: Number.isFinite(percent) ? percent : 0,
  };
}

export function validateAddonSettings(data: any, current?: ServiceAddonSettings): ServiceAddonSettings {
  const settings = parseAddonSettings({
    trackAddedBy: data.trackAddedBy ?? current?.trackAddedBy ?? false,
    commissionOnAdd: data.commissionOnAdd ?? current?.commissionOnAdd ?? false,
    commissionPercent: data.commissionPercent ?? current?.commissionPercent ?? 0,
  });
  if (settings.commissionPercent < 0 || settings.commissionPercent > 100 ||
      !/^\d+(\.\d{1,4})?$/.test(String(settings.commissionPercent))) {
    throw new BadRequestException('Percentual de comissão inválido (0 a 100, até quatro casas).');
  }
  if (settings.commissionOnAdd && settings.commissionPercent <= 0) {
    throw new BadRequestException('Informe um percentual maior que zero para comissionar a inclusão do serviço.');
  }
  return settings;
}
