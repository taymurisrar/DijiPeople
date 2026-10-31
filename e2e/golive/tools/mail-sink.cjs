// Local-only SMTP sink (Mailpit/MailHog stand-in; neither is installed here and nothing is downloaded as a binary).
// SMTP listens on 127.0.0.1:1025 and NEVER relays; messages are kept in memory and exposed on http://127.0.0.1:8025:
//   GET /messages            -> [{id,to,from,subject,text,html,links,receivedAt}]
//   GET /messages?to=<addr>  -> filtered
//   DELETE /messages         -> clear
// Usage: node mail-sink.cjs
const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const http = require('http');

const messages = [];
const smtp = new SMTPServer({
  authOptional: true, onAuth(auth, session, cb) { cb(null, { user: auth.username }); }, disabledCommands: ['STARTTLS'], allowInsecureAuth: true, size: 10 * 1024 * 1024,
  onData(stream, session, cb) {
    simpleParser(stream).then((m) => {
      const html = m.html || '';
      const links = [...new Set([...(String(html) + ' ' + (m.text || '')).matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((x) => x[0]))];
      messages.push({ id: messages.length + 1, to: (m.to?.value ?? []).map((a) => a.address), from: m.from?.value?.[0]?.address, subject: m.subject, text: m.text, html: String(html), links, receivedAt: new Date().toISOString() });
      cb();
    }).catch(cb);
  },
});
smtp.listen(Number(process.env.QA_SMTP_PORT ?? 1025), '127.0.0.1', () => console.log('smtp sink on 127.0.0.1:1025'));
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'DELETE') { messages.length = 0; res.end('cleared'); return; }
  const to = u.searchParams.get('to');
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(messages.filter((m) => !to || m.to.includes(to))));
}).listen(Number(process.env.QA_MAIL_HTTP_PORT ?? 8025), '127.0.0.1', () => console.log('http api on 127.0.0.1:8025'));

