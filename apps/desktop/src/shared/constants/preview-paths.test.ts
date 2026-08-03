import { describe, expect, it } from 'vitest';
import {
  getPreviewClaudeProfileConfigDir,
  getPreviewClaudeProfileSlug,
  PREVIEW_CLAUDE_PROFILES_TILDE_DIR
} from './preview-paths';

describe('Forge Glass Preview profile paths', () => {
  it('keeps generated profiles outside Aperant and provider CLI directories', () => {
    expect(PREVIEW_CLAUDE_PROFILES_TILDE_DIR).toBe('~/.forge-glass-preview/claude-profiles');
    expect(getPreviewClaudeProfileConfigDir('Work Account')).toBe('~/.forge-glass-preview/claude-profiles/work-account');
    expect(getPreviewClaudeProfileConfigDir('Work / Account')).toBe('~/.forge-glass-preview/claude-profiles/work-account');
    expect(getPreviewClaudeProfileSlug('  Primary  ')).toBe('primary');
    expect(() => getPreviewClaudeProfileConfigDir('../')).toThrow('Profile name must contain a letter or number');
  });
});
