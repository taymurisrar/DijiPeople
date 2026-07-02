import {
  NOTIFICATION_EVENT_CATALOG,
  SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS,
} from './notification-events.catalog';

describe('loan notification event seed catalog', () => {
  it('contains unique configured loan event keys', () => {
    const codes = NOTIFICATION_EVENT_CATALOG.map((event) => event.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(
      expect.arrayContaining([
        'LOAN_APPROVAL_REQUESTED',
        'LOAN_APPROVED',
        'LOAN_REJECTED',
        'CLAIM_APPROVAL_REQUESTED',
        'CLAIM_APPROVED',
        'CLAIM_REJECTED',
      ]),
    );
  });

  it('does not create unusable system email placeholders without templates', () => {
    const templateEvents = SYSTEM_EMAIL_TEMPLATE_PLACEHOLDERS.map(
      (template) => template.eventCode,
    );
    expect(templateEvents).not.toContain('LOAN_APPROVAL_REQUESTED');
    expect(templateEvents).not.toContain('LOAN_APPROVED');
    expect(templateEvents).not.toContain('LOAN_REJECTED');
    expect(templateEvents).not.toContain('CLAIM_APPROVAL_REQUESTED');
    expect(templateEvents).not.toContain('CLAIM_APPROVED');
    expect(templateEvents).not.toContain('CLAIM_REJECTED');
  });
});
