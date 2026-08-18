import i18n from '../../../shared/i18n';
import type { ChangelogTask, ChangelogSourceMode, GitCommit } from '../../../shared/types';

export interface SummaryInfo {
  count: number;
  label: string;
  details: string;
}

export function getSummaryInfo(
  sourceMode: ChangelogSourceMode,
  selectedTaskIds: string[],
  selectedTasks: ChangelogTask[],
  previewCommits: GitCommit[]
): SummaryInfo {
  switch (sourceMode) {
    case 'tasks':
      return {
        count: selectedTaskIds.length,
        label: 'task',
        details: selectedTasks.slice(0, 3).map((t) => t.title).join(', ') +
          (selectedTasks.length > 3 ? i18n.t('uiChangelogExtra:more', { count: selectedTasks.length - 3 }) : '')
      };
    case 'git-history':
    case 'branch-diff':
      return {
        count: previewCommits.length,
        label: 'commit',
        details: previewCommits.slice(0, 3).map((c) => c.subject.substring(0, 40)).join(', ') +
          (previewCommits.length > 3 ? i18n.t('uiChangelogExtra:more', { count: previewCommits.length - 3 }) : '')
      };
    default:
      return { count: 0, label: 'item', details: '' };
  }
}

export function formatVersionTag(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}

export function getVersionBumpDescription(versionReason: string | null): string | null {
  if (!versionReason) return null;

  switch (versionReason) {
    case 'breaking':
      return i18n.t('uiChangelogExtra:majorBump');
    case 'feature':
      return i18n.t('uiChangelogExtra:minorBump');
    default:
      return i18n.t('uiChangelogExtra:patchBump');
  }
}
