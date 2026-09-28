import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Database, Folder, Github, Loader2, Save, Settings2, Zap } from 'lucide-react';
import type { Project } from '../../../shared/types';
import type { UseProjectSettingsReturn } from '../project-settings/hooks/useProjectSettings';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import { ProjectSettingsContent, type ProjectSettingsSection } from './ProjectSettingsContent';

interface ProjectSettingsPageProps {
  project: Project;
  onClose: () => void;
  initialSection?: ProjectSettingsSection;
}

const sections = [
  { id: 'general', icon: Settings2 },
  { id: 'linear', icon: Zap },
  { id: 'github', icon: Github },
  { id: 'gitlab', icon: Folder },
  { id: 'memory', icon: Database },
] as const;

/** Settings for one explicit project; application preferences are never loaded or saved here. */
export function ProjectSettingsPage({ project, onClose, initialSection = 'general' }: ProjectSettingsPageProps) {
  const { t } = useTranslation('settings');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [activeSection, setActiveSection] = useState<ProjectSettingsSection>(initialSection);
  const [projectHook, setProjectHook] = useState<UseProjectSettingsReturn | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const handleHookReady = useCallback((hook: UseProjectSettingsReturn | null) => setProjectHook(hook), []);

  useEffect(() => setActiveSection(initialSection), [initialSection]);
  useEffect(() => {
    const opener = document.activeElement;
    titleRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const handleSave = async () => {
    if (!projectHook || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      // The existing project hook calls onClose only after successful project/env persistence.
      await projectHook.handleSave(onClose);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('projectSettings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const error = saveError || projectHook?.error || projectHook?.envError;
  const isIntegrationSection = activeSection !== 'general';
  // Linear updates only env fields immediately. Other integration sections also
  // edit project metadata (branch/push preferences or memory backend), which must
  // retain the existing explicit Save action.
  const requiresProjectSave = activeSection !== 'linear';

  return (
    <section className="forge-settings-page flex h-full min-h-0 flex-col bg-background" aria-labelledby="project-settings-page-title" aria-describedby="project-settings-project-name">
      <header className="flex min-w-0 items-center gap-3 border-b border-border px-6 py-3">
        <Button variant="ghost" size="icon" onClick={onClose} disabled={isSaving} aria-label={t('common:buttons.back')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 ref={titleRef} tabIndex={-1} id="project-settings-page-title" className="text-xl font-semibold">{t('projectSettings.title')}</h1>
          <p id="project-settings-project-name" className="truncate text-sm text-muted-foreground" title={project.name}>{project.name}</p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav aria-label={t('projectSettings.title')} className="w-52 shrink-0 border-r border-border bg-card/50 p-3 xl:w-56">
          <ScrollArea className="h-full">
            <div className="space-y-1">
              {sections.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={activeSection === id ? 'page' : undefined}
                  onClick={() => setActiveSection(id)}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    activeSection === id ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground')}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t(`projectSections.${id}.title`)}
                </button>
              ))}
            </div>
          </ScrollArea>
        </nav>
        <div className="min-w-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="max-w-3xl p-6 xl:p-8">
              {isIntegrationSection && (
                <p className="mb-5 text-sm text-muted-foreground">
                  {t(requiresProjectSave ? 'projectSettings.integrationMixedSave' : 'projectSettings.integrationAutoSave')}
                </p>
              )}
              <ProjectSettingsContent project={project} activeSection={activeSection} isOpen onHookReady={handleHookReady} />
            </div>
          </ScrollArea>
        </div>
      </div>
      <footer className="flex items-center justify-end gap-3 border-t border-border bg-card px-6 py-3">
        {error && <div role="alert" className="flex-1 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}
        <Button variant="outline" onClick={onClose} disabled={isSaving}>{t(isIntegrationSection ? 'common:buttons.back' : 'common:buttons.cancel')}</Button>
        {requiresProjectSave && <Button onClick={handleSave} disabled={isSaving || !projectHook}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t(isSaving ? 'common:buttons.saving' : 'projectSettings.save')}
        </Button>}
      </footer>
    </section>
  );
}
