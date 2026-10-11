import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PasswordField } from './password-field';

function html(props: Partial<Parameters<typeof PasswordField>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(PasswordField, { autoComplete: 'new-password', label: 'Set password', name: 'password', onChange: () => undefined, value: '', ...props }),
  );
}

describe('PasswordField', () => {
  it('starts masked with name and autocomplete', () => {
    const out = html();
    expect(out).toContain('type="password"');
    expect(out).toContain('name="password"');
    expect(out).toContain('autoComplete="new-password"');
  });
  it('has a non-submitting, labelled toggle controlling the input', () => {
    const out = html();
    expect(out).toContain('type="button"');
    expect(out).toContain('aria-label="Show password"');
    expect(out).toContain('aria-pressed="false"');
    const id = /<input[^>]* id="([^"]+)"/.exec(out)?.[1];
    expect(id).toBeTruthy();
    expect(out).toContain('aria-controls="' + id + '"');
  });
  it('wires the error to the input and announces it', () => {
    const out = html({ error: 'Passwords do not match.' });
    expect(out).toContain('aria-invalid="true"');
    expect(out).toMatch(/aria-describedby="[^"]+-error"/);
    expect(out).toContain('role="alert"');
  });
  it('keeps the font at 16px or larger to avoid iOS zoom', () => {
    expect(html()).toContain('text-base');
  });
});
