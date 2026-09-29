import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadPrompt, resolvePromptsDir, tryLoadPrompt, validatePromptFiles } from './prompt-loader';

const applicationPrompts = fileURLToPath(new URL('../../../../prompts/', import.meta.url));

describe('application prompt loading', () => {
  it('reads root prompt resources through the shared resolver', () => {
    expect(resolvePromptsDir()).toBe(applicationPrompts.replace(/[\\/]$/, ''));
    expect(loadPrompt('planner')).toBe(readFileSync(join(applicationPrompts, 'planner.md'), 'utf8'));
    expect(loadPrompt('mcp_tools/electron_validation'))
      .toBe(readFileSync(join(applicationPrompts, 'mcp_tools/electron_validation.md'), 'utf8'));
  });

  it('validates all required prompt resources in the reorganized application', () => {
    expect(validatePromptFiles().valid).toBe(true);
  });

  it('keeps optional prompt lookup nullable while required lookup reports the missing resource', () => {
    const missingPrompt = '__forge_missing_prompt_fixture__';
    expect(tryLoadPrompt(missingPrompt)).toBeNull();
    expect(() => loadPrompt(missingPrompt)).toThrow(join(applicationPrompts, `${missingPrompt}.md`));
  });
});
