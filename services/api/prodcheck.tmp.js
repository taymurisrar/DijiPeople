require('dotenv/config');
const fs = require('fs');
const url = (fs.readFileSync('.env','utf8').match(/postgresql:\/\/[^"\n]*neon[^"\n]*/) || [])[0];
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
(async () => {
  const rows = await p.$queryRawUnsafe(
    `SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
     FROM "_prisma_migrations"
     WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
     ORDER BY started_at`
  );
  console.log('unfinished / rolled-back migration rows:', rows.length);
  for (const r of rows) {
    console.log(' ', r.migration_name, '| finished:', r.finished_at, '| rolledback:', r.rolled_back_at, '| steps:', r.applied_steps_count);
  }
  const total = await p.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "_prisma_migrations"`);
  console.log('total migration rows in prod:', total[0].c);
  await p.$disconnect();
})().catch(e => { console.error('ERR', e.message.split('\n')[0]); process.exit(1); });
