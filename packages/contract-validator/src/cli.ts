#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateContracts } from './index.js';

let repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
let reporter: 'human' | 'json' = 'human';
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === '--reporter=json') reporter = 'json';
  else if (arg === '--repo-root' && process.argv[index + 1]) repoRoot = resolve(process.argv[++index] as string);
  else { console.error(`Unknown argument: ${arg}`); process.exit(2); }
}
try {
  const report = validateContracts(repoRoot);
  if (reporter === 'json') console.log(JSON.stringify(report, null, 2));
  else {
    for (const issue of [...report.errors, ...report.warnings]) {
      console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.file}${issue.path ? `:${issue.path}` : ''}\n  ${issue.message}${issue.suggestion ? `\n  Suggestion: ${issue.suggestion}` : ''}`);
    }
    console.log(`Contract validation ${report.valid ? 'passed' : 'failed'}: ${report.checkedFiles.length} files, ${report.errors.length} errors, ${report.warnings.length} warnings (${report.duration} ms)`);
  }
  if (!report.valid) process.exitCode = 1;
} catch (error) {
  console.error(`Contract validation failed unexpectedly: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
}
