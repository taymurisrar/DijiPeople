# API production build: Node heap measurement

Build command (from `services/api/package.json`, unmodified):
`npm run build` = `npm run clean:dist && npm run prisma:generate && nest build`
Run as: `NODE_OPTIONS=--max-old-space-size=N <node22> npm-cli.js run build` in `services/api`, Node v22.23.4.
Render (`render.yaml`, api): `buildCommand: npm ci && npm --workspace api run build`, no NODE_OPTIONS set.

Machine: Windows 11, 31.3 GB visible RAM. Other node sessions were running during the runs (tsc and jest processes), so peak figures are not isolated.

| N (MB) | Result | Wall-clock (s) | Failing step | Peak node RSS, all node processes (MB) |
|---|---|---|---|---|
| 1536 | FAIL (exit 134, heap OOM) | 92 | `nest build` | 2451 (baseline 318) |
| 2048 | FAIL (exit 134, heap OOM) | 118 | `nest build` | 6216 (baseline 319) |
| 3072 | FAIL (exit 134, heap OOM) | 180+ | `nest build` | 11613 (contaminated by other sessions) |
| 4096 | PASS (exit 0) | 271 | none | 9969 (baseline 3986, contaminated) |

Smallest passing heap tested: **4096 MB**. 3072 MB failed, so the threshold lies between 3072 and 4096 MB (not bisected further).

Default heap on this Node 22 on this machine is 4144 MB (`heap_size_limit`), so the pass is effectively the default. Render's build machine memory is not recorded in the repo and was not verified.

Memory figures are unreliable: the sampler summed every node process on the machine, and the baseline moved from 318 MB to about 3986 MB during the run. The OOM outcomes are the reliable signal.

Conclusion: the production build needs more than 3 GB of V8 heap. Render's build must have a heap of at least 4 GB (the default on a machine of this size), or `NODE_OPTIONS=--max-old-space-size=4096` must be set. This is not configured in `render.yaml`.
