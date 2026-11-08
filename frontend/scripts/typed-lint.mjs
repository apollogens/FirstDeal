import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Full diagnostic gate, including modules awaiting runtime boundary migration.
const result = spawnSync(process.execPath, ['node_modules/eslint/bin/eslint.js', 'src', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, FRONTEND_TYPED_AUDIT: '1' },
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
