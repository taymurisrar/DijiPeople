console.warn(
  'seed:system is deprecated and now delegates to seed:config. Use seed:config directly.',
);

import { runSeedConfig } from './seed-config';

runSeedConfig().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
