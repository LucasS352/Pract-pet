import { BadRequestException } from '@nestjs/common';
import { parseAddonSettings, validateAddonSettings } from './service-addon-settings';

describe('service addon settings', () => {
  it('tracks a service without creating a commission', () => {
    expect(validateAddonSettings({ trackAddedBy: true, commissionOnAdd: false })).toEqual({
      trackAddedBy: true, commissionOnAdd: false, commissionAmount: 0,
    });
  });

  it('forces tracking when commission is enabled and requires a rate', () => {
    expect(validateAddonSettings({ trackAddedBy: false, commissionOnAdd: true, commissionAmount: 10 })).toEqual({
      trackAddedBy: true, commissionOnAdd: true, commissionAmount: 10,
    });
    expect(() => validateAddonSettings({ commissionOnAdd: true, commissionAmount: 0 })).toThrow(BadRequestException);
  });

  it('treats old services as neither tracked nor commissioned', () => {
    expect(parseAddonSettings(null)).toEqual({ trackAddedBy: false, commissionOnAdd: false, commissionAmount: 0 });
  });

  it('recognizes the old percentage without treating it as reais', () => {
    expect(parseAddonSettings({ trackAddedBy: true, commissionOnAdd: true, commissionPercent: 10 })).toEqual({
      trackAddedBy: true, commissionOnAdd: true, commissionAmount: 0, legacyCommissionPercent: 10,
    });
  });
});
