/*
 * DP-MASTER WP-17: the monitoring policy is shown to the employee IN FULL before
 * they can acknowledge it. A native message box truncates and cannot scroll, so
 * the text is rendered into a locked-down window instead. This module only builds
 * the document; it holds no Electron handles so it is unit-tested directly.
 */
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * A self-contained page: no script, no network, no images. The policy text is
 * escaped and shown verbatim (markdown is not interpreted, so nothing in it can
 * inject markup, a link or a form).
 */
export function renderPolicyHtml(input: {
  title: string;
  version: number | string;
  contentMarkdown: string;
}): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escapeHtml(input.title)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:20px;color:#0f172a}
h1{font-size:18px;margin:0 0 4px}p.meta{color:#475569;margin:0 0 16px}
pre{white-space:pre-wrap;word-wrap:break-word;font:inherit;margin:0}</style></head>
<body><h1>${escapeHtml(input.title)}</h1>
<p class="meta">Version ${escapeHtml(String(input.version))}. Read all of it, then close this window to continue.</p>
<pre>${escapeHtml(input.contentMarkdown)}</pre></body></html>`;
}

export function policyDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
