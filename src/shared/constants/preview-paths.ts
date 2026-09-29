/** Files and Claude profiles created by this derivative stay in its own namespace. */
export const PREVIEW_APP_DIRECTORY_NAME = 'forge-glass-preview';
export const PREVIEW_HOME_DIRECTORY_NAME = `.${PREVIEW_APP_DIRECTORY_NAME}`;
export const PREVIEW_CLAUDE_PROFILES_RELATIVE_DIR = `${PREVIEW_HOME_DIRECTORY_NAME}/claude-profiles`;
export const PREVIEW_CLAUDE_PROFILES_TILDE_DIR = `~/${PREVIEW_CLAUDE_PROFILES_RELATIVE_DIR}`;

export function getPreviewClaudeProfileSlug(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) throw new Error('Profile name must contain a letter or number');
  return slug;
}

export function getPreviewClaudeProfileConfigDir(name: string): string {
  return `${PREVIEW_CLAUDE_PROFILES_TILDE_DIR}/${getPreviewClaudeProfileSlug(name)}`;
}
