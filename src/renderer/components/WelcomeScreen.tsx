import { FolderOpen, FolderPlus, Clock, ArrowUpRight, Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import type { Project } from '../../shared/types';

interface WelcomeScreenProps {
  projects: Project[];
  onNewProject: () => void;
  onOpenProject: () => void;
  onSelectProject: (projectId: string) => void;
}

export function WelcomeScreen({
  projects,
  onNewProject,
  onOpenProject,
  onSelectProject
}: WelcomeScreenProps) {
  const { t, i18n } = useTranslation(['welcome', 'common', 'dialogs']);
  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  const formatRelativeTime = (date: Date) => {
    const diffMs = Date.now() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return t('common:time.justNow');
    if (diffMins < 60) return t('common:time.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('common:time.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('common:time.daysAgo', { count: diffDays });
    return new Date(date).toLocaleDateString(i18n.resolvedLanguage);
  };

  return (
    <div className="forge-glass-welcome h-full overflow-y-auto px-6 py-10 sm:px-10 lg:px-14 lg:py-14" data-empty={projects.length === 0}>
      <div className="mx-auto w-full max-w-4xl">
        <header className="forge-glass-welcome-header mb-10">
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground">{t('welcome:hero.eyebrow')}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t(recentProjects.length > 0 ? 'welcome:hero.returningTitle' : 'welcome:hero.title')}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {t('welcome:hero.subtitle')}
          </p>
          <div className="forge-glass-welcome-actions mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={onOpenProject} className="h-10 gap-2 px-5">
              <FolderOpen className="h-4 w-4" />
              {t('welcome:actions.openProject')}
            </Button>
            <Button variant="ghost" onClick={onNewProject} className="h-10 gap-2 px-4">
              <FolderPlus className="h-4 w-4" />
              {t('welcome:actions.newProject')}
            </Button>
          </div>
        </header>

        <section aria-labelledby="forge-recent-projects-heading">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 id="forge-recent-projects-heading" className="text-sm font-medium text-foreground">
              {t('welcome:recentProjects.title')}
            </h2>
            {recentProjects.length > 0 && <span className="text-xs text-muted-foreground">{recentProjects.length}</span>}
          </div>
          {recentProjects.length > 0 ? (
            <div className="forge-glass-welcome-projects overflow-hidden rounded-xl border border-border bg-card">
              <ScrollArea className="max-h-[440px]">
                <div className="divide-y divide-border/60">
                  {recentProjects.map((project) => (
                    <button
                      type="button"
                      key={project.id}
                      onClick={() => onSelectProject(project.id)}
                      className="forge-glass-welcome-project group flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
                      aria-label={t('welcome:recentProjects.openProjectAriaLabel', { name: project.name })}
                      data-initialized={Boolean(project.autoBuildPath)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/60 text-muted-foreground">
                        <Folder className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{project.name}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{project.path}</span>
                      </span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">{formatRelativeTime(project.updatedAt)}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="forge-glass-welcome-projects flex items-start gap-4 rounded-xl border border-dashed border-border bg-card/50 p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/60 text-muted-foreground"><Folder className="h-5 w-5" /></span>
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('welcome:recentProjects.empty')}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('welcome:recentProjects.emptyDescription')}</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
