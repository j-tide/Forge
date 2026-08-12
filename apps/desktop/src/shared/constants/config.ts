/**
 * Application configuration constants
 * Default settings, file paths, and project structure
 */

// ============================================
// Terminal Timing Constants
// ============================================

/** Delay for DOM updates before terminal operations (refit, resize).
 * Must be long enough for dnd-kit CSS transitions to complete after drag-drop reorder.
 * 50ms was too short, causing xterm to fit into containers with zero/invalid dimensions. */
export const TERMINAL_DOM_UPDATE_DELAY_MS = 250;

/** Grace period before cleaning up error panel constraints after panel removal */
export const PANEL_CLEANUP_GRACE_PERIOD_MS = 150;

// ============================================
// UI Scale Constants
// ============================================

export const UI_SCALE_MIN = 75;
export const UI_SCALE_MAX = 200;
export const UI_SCALE_DEFAULT = 100;
export const UI_SCALE_STEP = 5;

// ============================================
// Default App Settings
// ============================================

export const DEFAULT_APP_SETTINGS = {
  theme: 'light' as const,
  colorTheme: 'forge-glass' as const,
  defaultModel: 'opus',
  agentFramework: 'auto-claude',
  pythonPath: undefined as string | undefined,
  gitPath: undefined as string | undefined,
  githubCLIPath: undefined as string | undefined,
  gitlabCLIPath: undefined as string | undefined,
  autoBuildPath: undefined as string | undefined,
  autoUpdateAutoBuild: true,
  autoNameTerminals: true,
  onboardingCompleted: false,
  notifications: {
    onTaskComplete: true,
    onTaskFailed: true,
    onReviewNeeded: true,
    sound: false
  },
  // Global API keys (used as defaults for all projects)
  globalOpenAIApiKey: undefined as string | undefined,
  // Selected agent profile - defaults to 'auto' for per-phase optimized model selection
  selectedAgentProfile: 'auto',
  // Changelog preferences (persisted between sessions)
  changelogFormat: 'keep-a-changelog' as const,
  changelogAudience: 'user-facing' as const,
  changelogEmojiLevel: 'none' as const,
  // UI Scale (default 100% - standard size)
  uiScale: UI_SCALE_DEFAULT,
  // Log order setting for task detail view (default chronological - oldest first)
  logOrder: 'chronological' as const,
  // Beta updates opt-in (receive pre-release versions)
  betaUpdates: false,
  // Language preference (default to English)
  language: 'zh-CN' as const,
  // A derivative install does not opt users into upstream error reporting.
  sentryEnabled: false,
  // Auto-name Claude terminals based on initial message (enabled by default)
  autoNameClaudeTerminals: true,
  // GPU acceleration for terminal rendering
  // Default to 'off' until WebGL stability is proven across all GPU drivers.
  // Users can opt-in via Settings > Display > GPU Acceleration.
  gpuAcceleration: 'off' as const
};

// ============================================
// Default Project Settings
// ============================================

export const DEFAULT_PROJECT_SETTINGS = {
  model: 'opus',
  memoryBackend: 'file' as const,
  linearSync: false,
  notifications: {
    onTaskComplete: true,
    onTaskFailed: true,
    onReviewNeeded: true,
    sound: false
  },
  // Include CLAUDE.md instructions in agent context (enabled by default)
  useClaudeMd: true
};

// ============================================
// Auto Build File Paths
// ============================================

// Project data is deliberately separate from upstream Aperant's .auto-claude/.
export const PROJECT_DATA_DIR = '.forge-glass-preview';

// File paths relative to project
export const AUTO_BUILD_PATHS = {
  SPECS_DIR: `${PROJECT_DATA_DIR}/specs`,
  ROADMAP_DIR: `${PROJECT_DATA_DIR}/roadmap`,
  IDEATION_DIR: `${PROJECT_DATA_DIR}/ideation`,
  IMPLEMENTATION_PLAN: 'implementation_plan.json',
  SPEC_FILE: 'spec.md',
  QA_REPORT: 'qa_report.md',
  BUILD_PROGRESS: 'build-progress.txt',
  GENERATION_PROGRESS: 'generation_progress.json',
  CONTEXT: 'context.json',
  REQUIREMENTS: 'requirements.json',
  ROADMAP_FILE: 'roadmap.json',
  ROADMAP_DISCOVERY: 'roadmap_discovery.json',
  COMPETITOR_ANALYSIS: 'competitor_analysis.json',
  MANUAL_COMPETITORS: 'manual_competitors.json',
  IDEATION_FILE: 'ideation.json',
  IDEATION_CONTEXT: 'ideation_context.json',
  PROJECT_INDEX: `${PROJECT_DATA_DIR}/project_index.json`,
  MEMORY_STATE: '.memory_state.json'
} as const;

/**
 * Get the specs directory path.
 * All specs go to .forge-glass-preview/specs/ (the project's data directory).
 */
export function getSpecsDir(autoBuildPath: string | undefined): string {
  if (autoBuildPath && autoBuildPath !== PROJECT_DATA_DIR) {
    throw new Error(`Unsupported project data directory: ${autoBuildPath}`);
  }
  return AUTO_BUILD_PATHS.SPECS_DIR;
}
