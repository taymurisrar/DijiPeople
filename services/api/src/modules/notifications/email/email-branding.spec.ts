import {
  DEFAULT_EMAIL_ACCENT,
  applyEmailBranding,
  resolveEmailAccent,
} from './email-branding';

const BODY =
  '<div style="background-color:#f5f6f8;"><a href="https://x.test/activate?token=SECRET" style="background-color:#0f766e;color:#fff;">Activate</a></div>';

const base = {
  organizationName: 'Acme Ltd',
  logoUrl: 'https://acme.example/api/public/tenants/acme/assets/logo',
  accentColor: '#1d4ed8',
  showDijiPeopleAttribution: true,
};

describe('applyEmailBranding', () => {
  it('adds organisation name, logo, accent and the DijiPeople footer', () => {
    const { html, text } = applyEmailBranding(BODY, 'Hello', base);
    expect(html).toContain('Acme Ltd');
    expect(html).toContain(
      'src="https://acme.example/api/public/tenants/acme/assets/logo"',
    );
    expect(html).toContain('border-top:4px solid #1d4ed8');
    expect(html).toContain('background-color:#1d4ed8;color:#fff');
    expect(html).toContain('Powered by DijiPeople');
    expect(text).toContain('Acme Ltd');
    expect(text).toContain('Powered by DijiPeople');
  });

  it('never alters links or tokens', () => {
    const { html } = applyEmailBranding(BODY, null, base);
    expect(html).toContain('href="https://x.test/activate?token=SECRET"');
  });

  it('escapes a hostile organisation name', () => {
    const { html } = applyEmailBranding(BODY, null, {
      ...base,
      organizationName: '<script>alert(1)</script>"',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('falls back safely with no logo, no accent and no name', () => {
    const { html } = applyEmailBranding(BODY, null, {
      organizationName: '',
      logoUrl: null,
      accentColor: null,
      showDijiPeopleAttribution: true,
    });
    expect(html).not.toContain('<img');
    expect(html).toContain(`solid ${DEFAULT_EMAIL_ACCENT}`);
    expect(html).toContain('Powered by DijiPeople');
  });

  it('refuses a non-http logo URL', () => {
    const { html } = applyEmailBranding(BODY, null, {
      ...base,
      logoUrl: 'javascript:alert(1)',
    });
    expect(html).not.toContain('<img');
  });

  it('drops the attribution only for white-label and honours a custom footer', () => {
    const { html, text } = applyEmailBranding(BODY, 'Hi', {
      ...base,
      showDijiPeopleAttribution: false,
      customFooterText: 'Acme People Team',
    });
    expect(html).not.toContain('Powered by DijiPeople');
    expect(html).toContain('Acme People Team');
    expect(text).not.toContain('DijiPeople');
  });

  it('is idempotent', () => {
    const once = applyEmailBranding(BODY, 'Hi', base);
    expect(applyEmailBranding(once.html, once.text, base)).toEqual(once);
  });
});

describe('resolveEmailAccent', () => {
  it.each([
    ['#1d4ed8', '#1d4ed8'],
    ['#34D399', DEFAULT_EMAIL_ACCENT], // too light for white button text
    ['red', DEFAULT_EMAIL_ACCENT],
    ['#fff', DEFAULT_EMAIL_ACCENT],
    ['url(javascript:1)', DEFAULT_EMAIL_ACCENT],
    [null, DEFAULT_EMAIL_ACCENT],
  ])('%s -> %s', (input, expected) => {
    expect(resolveEmailAccent(input)).toBe(expected);
  });
});
