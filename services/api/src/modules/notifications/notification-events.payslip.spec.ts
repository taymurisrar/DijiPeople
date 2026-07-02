import {
  NOTIFICATION_EVENT_CATALOG,
  SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS,
} from './notification-events.catalog';

describe('payslip notification catalog', () => {
  it('seeds the payslip delivery event and its fallback system template', () => {
    expect(NOTIFICATION_EVENT_CATALOG).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PAYSLIP_AVAILABLE',
          systemTemplateKey: 'PAYSLIP_AVAILABLE',
        }),
      ]),
    );
    expect(SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ templateKey: 'PAYSLIP_AVAILABLE' }),
      ]),
    );
  });
});
