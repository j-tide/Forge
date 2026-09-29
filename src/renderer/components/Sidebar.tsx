import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Settings,
  LayoutGrid,
  Terminal,
  Map as MapIcon,
  BookOpen,
  Lightbulb,
  AlertCircle,
  Download,
  RefreshCw,
  Github,
  GitlabIcon,
  GitPullRequest,
  GitMerge,
  FileText,
  Sparkles,
  GitBranch,
  HelpCircle,
  Wrench,
  PanelLeft,
  PanelLeftClose
} from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from './ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { cn } from '../lib/utils';
import { shouldIgnoreNavigationShortcut } from '../lib/navigation-shortcuts';
import {
  useProjectStore,
  removeProject,
  initializeProject
} from '../stores/project-store';
import { useSettingsStore, saveSettings } from '../stores/settings-store';
import {
  useProjectEnvStore,
  loadProjectEnvConfig,
  clearProjectEnvConfig
} from '../stores/project-env-store';
import { AddProjectModal } from './AddProjectModal';
import { GitSetupModal } from './GitSetupModal';
import { RateLimitIndicator } from './RateLimitIndicator';
import { ForgeBrand } from './ForgeBrand';

import { UpdateBanner } from './UpdateBanner';
import type { Project, GitStatus } from '../../shared/types';

export type SidebarView = 'kanban' | 'terminals' | 'roadmap' | 'context' | 'ideation' | 'github-issues' | 'gitlab-issues' | 'github-prs' | 'gitlab-merge-requests' | 'changelog' | 'insights' | 'worktrees' | 'agent-tools';

interface SidebarProps {
  onSettingsClick: () => void;
  onNewTaskClick: () => void;
  activeView?: SidebarView;
  isSettingsActive?: boolean;
  isNavigationBlocked?: boolean;
  isSetupBlocked?: boolean;
  onGitSetupStateChange?: (projectId: string, ready: boolean) => void;
  onViewChange?: (view: SidebarView) => void;
}

interface NavItem {
  id: SidebarView;
  labelKey: string;
  icon: React.ElementType;
  shortcut?: string;
}

// Navigation groups are presentation only; view IDs and shortcuts stay stable.
const baseNavItems: NavItem[] = [
  { id: 'kanban', labelKey: 'navigation:items.kanban', icon: LayoutGrid, shortcut: 'K' },
  { id: 'terminals', labelKey: 'navigation:items.terminals', icon: Terminal, shortcut: 'A' },
  { id: 'insights', labelKey: 'navigation:items.insights', icon: Sparkles, shortcut: 'N' },
  { id: 'roadmap', labelKey: 'navigation:items.roadmap', icon: MapIcon, shortcut: 'D' },
  { id: 'ideation', labelKey: 'navigation:items.ideation', icon: Lightbulb, shortcut: 'I' },
  { id: 'changelog', labelKey: 'navigation:items.changelog', icon: FileText, shortcut: 'L' },
  { id: 'context', labelKey: 'navigation:items.context', icon: BookOpen, shortcut: 'C' },
  { id: 'agent-tools', labelKey: 'navigation:items.agentTools', icon: Wrench, shortcut: 'M' },
  { id: 'worktrees', labelKey: 'navigation:items.worktrees', icon: GitBranch, shortcut: 'W' }
];

// GitHub nav items shown when GitHub is enabled
const githubNavItems: NavItem[] = [
  { id: 'github-issues', labelKey: 'navigation:items.githubIssues', icon: Github, shortcut: 'G' },
  { id: 'github-prs', labelKey: 'navigation:items.githubPRs', icon: GitPullRequest, shortcut: 'P' }
];

// GitLab nav items shown when GitLab is enabled
const gitlabNavItems: NavItem[] = [
  { id: 'gitlab-issues', labelKey: 'navigation:items.gitlabIssues', icon: GitlabIcon, shortcut: 'B' },
  { id: 'gitlab-merge-requests', labelKey: 'navigation:items.gitlabMRs', icon: GitMerge, shortcut: 'R' }
];

export function Sidebar({
  onSettingsClick,
  onNewTaskClick,
  activeView = 'kanban',
  isSettingsActive = false,
  isNavigationBlocked = false,
  isSetupBlocked = false,
  onGitSetupStateChange,
  onViewChange
}: SidebarProps) {
  const { t } = useTranslation(['navigation', 'dialogs', 'common', 'welcome', 'uiShell', 'onboarding']);
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const settings = useSettingsStore((state) => state.settings);

  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [showGitSetupModal, setShowGitSetupModal] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitCheckError, setGitCheckError] = useState(false);
  const [gitCheckAttempt, setGitCheckAttempt] = useState(0);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedProjectPath = selectedProject?.path;

  // Sidebar collapsed state from settings
  const isCollapsed = settings.sidebarCollapsed ?? false;

  const toggleSidebar = () => {
    saveSettings({ sidebarCollapsed: !isCollapsed });
  };

  // Subscribe to project-env-store for reactive GitHub/GitLab tab visibility
  const githubEnabled = useProjectEnvStore((state) => state.envConfig?.githubEnabled ?? false);
  const gitlabEnabled = useProjectEnvStore((state) => state.envConfig?.gitlabEnabled ?? false);

  // Track the last loaded project ID to avoid redundant loads
  const lastLoadedProjectIdRef = useRef<string | null>(null);

  // Compute visible nav items based on GitHub/GitLab enabled state from store
  const visibleNavItems = useMemo(() => {
    const items = [...baseNavItems];

    if (githubEnabled) {
      items.push(...githubNavItems);
    }

    if (gitlabEnabled) {
      items.push(...gitlabNavItems);
    }

    return items;
  }, [githubEnabled, gitlabEnabled]);

  // Load envConfig when project changes to ensure store is populated
  useEffect(() => {
    // Track whether this effect is still current (for race condition handling)
    let isCurrent = true;

    const initializeEnvConfig = async () => {
      if (selectedProject?.id && selectedProject?.autoBuildPath) {
        // Only reload if the project ID differs from what we last loaded
        if (selectedProject.id !== lastLoadedProjectIdRef.current) {
          lastLoadedProjectIdRef.current = selectedProject.id;
          await loadProjectEnvConfig(selectedProject.id);
          // Check if this effect was cancelled while loading
          if (!isCurrent) return;
        }
      } else {
        // Clear the store if no project is selected or has no autoBuildPath
        lastLoadedProjectIdRef.current = null;
        clearProjectEnvConfig();
      }
    };
    initializeEnvConfig();

    // Cleanup function to mark this effect as stale
    return () => {
      isCurrent = false;
    };
  }, [selectedProject?.id, selectedProject?.autoBuildPath]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreNavigationShortcut(e, { settingsActive: isSettingsActive || isNavigationBlocked })) return;

      // Only handle shortcuts when a project is selected
      if (!selectedProjectId) return;

      // Check for modifier keys - we want plain key presses only
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toUpperCase();

      // Find matching nav item from visible items only
      const matchedItem = visibleNavItems.find((item) => item.shortcut === key);

      if (matchedItem) {
        e.preventDefault();
        onViewChange?.(matchedItem.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProjectId, onViewChange, visibleNavItems, isSettingsActive, isNavigationBlocked]);

  // Check git status when project changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Retrying intentionally starts a fresh Git status request.
  useEffect(() => {
    let current = true;
    setShowGitSetupModal(false);
    setGitStatus(null);
    setGitCheckError(false);
    const checkGit = async () => {
      if (selectedProjectId && selectedProjectPath) {
        onGitSetupStateChange?.(selectedProjectId, false);
        try {
          const result = await window.electronAPI.checkGitStatus(selectedProjectPath);
          if (!current) return;
          if (result.success && result.data) {
            setGitStatus(result.data);
            // Show git setup modal if project is not a git repo or has no commits
            if (!result.data.isGitRepo || !result.data.hasCommits) {
              setShowGitSetupModal(true);
            } else {
              onGitSetupStateChange?.(selectedProjectId, true);
            }
          } else {
            setGitCheckError(true);
          }
        } catch (error) {
          if (!current) return;
          console.error('Failed to check git status:', error);
          setGitCheckError(true);
        }
      } else {
        setGitStatus(null);
      }
    };
    checkGit();
    return () => { current = false; };
  }, [selectedProjectId, selectedProjectPath, onGitSetupStateChange, gitCheckAttempt]);

  const handleGitSetupOpenChange = (open: boolean) => {
    setShowGitSetupModal(open);
    if (!open && selectedProject) onGitSetupStateChange?.(selectedProject.id, true);
  };

  const handleProjectAdded = (project: Project, needsInit: boolean) => {
    if (needsInit) {
      setPendingProject(project);
      setShowInitDialog(true);
    }
  };

  const handleInitialize = async () => {
    if (!pendingProject) return;

    const projectId = pendingProject.id;
    setIsInitializing(true);
    try {
      const result = await initializeProject(projectId);
      if (result?.success) {
        // Clear pendingProject FIRST before closing dialog
        // This prevents onOpenChange from triggering skip logic
        setPendingProject(null);
        setShowInitDialog(false);
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSkipInit = () => {
    setShowInitDialog(false);
    setPendingProject(null);
  };

  const handleGitInitialized = async () => {
    // Refresh git status after initialization
    if (selectedProject) {
      try {
        const result = await window.electronAPI.checkGitStatus(selectedProject.path);
        if (result.success && result.data) {
          setGitStatus(result.data);
        }
      } catch (error) {
        console.error('Failed to refresh git status:', error);
      }
    }
  };

  const _handleRemoveProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await removeProject(projectId);
  };


  const handleNavClick = (view: SidebarView) => {
    onViewChange?.(view);
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = !isSettingsActive && !isNavigationBlocked && activeView === item.id;
    const Icon = item.icon;

    const button = (
      <button
        type="button"
        key={item.id}
        onClick={() => handleNavClick(item.id)}
        disabled={!selectedProjectId}
        aria-label={t(item.labelKey)}
        aria-keyshortcuts={item.shortcut}
        aria-current={isActive ? 'page' : undefined}
        data-active={isActive}
        className={cn(
          'forge-glass-sidebar-nav-item group flex min-h-9 w-full items-center rounded-lg text-sm transition-colors duration-150',
          'hover:bg-accent hover:text-accent-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
          'disabled:pointer-events-none disabled:opacity-40',
          isActive && 'bg-accent text-accent-foreground',
          isCollapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left">{t(item.labelKey)}</span>
            {item.shortcut && (
              <kbd className="pointer-events-none hidden select-none font-mono text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground sm:block">
                {item.shortcut}
              </kbd>
            )}
          </>
        )}
      </button>
    );

    // Wrap in tooltip when collapsed
    if (isCollapsed) {
      return (
        <Tooltip key={item.id}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">
            <span>{t(item.labelKey)}</span>
            {item.shortcut && (
              <kbd className="ml-2 rounded border border-border bg-secondary px-1 font-mono text-[10px]">
                {item.shortcut}
              </kbd>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  return (
    <TooltipProvider>
      <aside
        className={cn(
          'forge-glass-sidebar flex h-full shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
          isCollapsed ? 'w-16' : 'w-[220px]'
        )}
        data-collapsed={isCollapsed}
        aria-label={t('sections.navigation')}
      >
        <div className={cn(
          'forge-glass-sidebar-header electron-drag flex h-16 shrink-0 items-center',
          isCollapsed ? 'justify-center gap-1 px-1' : 'justify-between gap-2 px-4',
          window.platform?.isMacOS && 'pt-6'
        )}>
          <ForgeBrand
            showName={!isCollapsed}
            size={24}
            className="forge-glass-sidebar-brand electron-no-drag text-lg"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="electron-no-drag h-6 w-6 shrink-0 text-muted-foreground"
                onClick={toggleSidebar}
                aria-label={isCollapsed ? t('actions.expandSidebar') : t('actions.collapseSidebar')}
              >
                {isCollapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isCollapsed ? t('actions.expandSidebar') : t('actions.collapseSidebar')}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className={cn('forge-glass-sidebar-create shrink-0 pb-4', isCollapsed ? 'px-2' : 'px-3')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="forge-glass-new-task-button h-9 w-full justify-center gap-2"
                size={isCollapsed ? 'icon' : 'default'}
                onClick={onNewTaskClick}
                aria-label={t('actions.newTask')}
                disabled={!selectedProjectId || !selectedProject?.autoBuildPath}
              >
                <Plus className="h-4 w-4" />
                {!isCollapsed && t('actions.newTask')}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {selectedProject && !selectedProject.autoBuildPath
                ? t('messages.initializeToCreateTasks')
                : t('actions.newTask')}
            </TooltipContent>
          </Tooltip>
        </div>

        {gitCheckError && (
          <div role="alert" className={cn('mb-3 text-sm text-destructive', isCollapsed ? 'px-2' : 'mx-3 rounded-lg bg-destructive/10 p-3')}>
            {!isCollapsed && <p className="mb-2">{t('onboarding:wizard.gitCheckFailed')}</p>}
            <Button
              variant="outline"
              size={isCollapsed ? 'icon' : 'sm'}
              aria-label={t('onboarding:wizard.retryGitCheck')}
              title={t('onboarding:wizard.gitCheckFailed')}
              onClick={() => setGitCheckAttempt(attempt => attempt + 1)}
            >
              <RefreshCw className="h-4 w-4" />
              {!isCollapsed && t('common:buttons.retry')}
            </Button>
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1">
          <nav className={cn('forge-glass-sidebar-nav space-y-5 pb-4', isCollapsed ? 'px-2' : 'px-3')} aria-label={t('sections.navigation')}>
            {[
              { label: 'sections.work', ids: ['kanban', 'terminals', 'worktrees'] },
              { label: 'sections.explore', ids: ['insights', 'roadmap', 'ideation'] },
              { label: 'sections.project', ids: ['context', 'agent-tools', 'changelog', 'github-issues', 'github-prs', 'gitlab-issues', 'gitlab-merge-requests'] }
            ].map((group) => (
              <div key={group.label} className="forge-glass-sidebar-group">
                {!isCollapsed && <h3 className="mb-1.5 px-3 text-[11px] font-medium text-muted-foreground">{t(group.label)}</h3>}
                <div className="space-y-0.5">
                  {visibleNavItems.filter((item) => group.ids.includes(item.id)).map(renderNavItem)}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        <RateLimitIndicator />
        <UpdateBanner />

        <div className={cn('forge-glass-sidebar-actions shrink-0 border-t border-border/60', isCollapsed ? 'p-2' : 'p-3')}>
          <div className={cn('flex items-center', isCollapsed ? 'flex-col gap-1' : 'gap-1')}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size={isCollapsed ? 'icon' : 'sm'}
                  className={cn('h-9', !isCollapsed && 'flex-1 justify-start gap-2.5 px-3', isSettingsActive && 'bg-accent text-accent-foreground')}
                  onClick={onSettingsClick}
                  aria-current={isSettingsActive ? 'page' : undefined}
                  aria-label={t('actions.settings')}
                >
                  <Settings className="h-4 w-4" />
                  {!isCollapsed && t('actions.settings')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side={isCollapsed ? 'right' : 'top'}>{t('tooltips.settings')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground"
                  onClick={() => setShowHelpDialog(true)}
                  aria-label={t('tooltips.help')}
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side={isCollapsed ? 'right' : 'top'}>{t('tooltips.help')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>

      {/* Application information and license notice. */}
      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
        <DialogContent className="forge-glass-about-dialog">
          <DialogHeader>
            <DialogTitle><ForgeBrand /></DialogTitle>
            <DialogDescription>{t('welcome:hero.subtitle')}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('uiShell:about.provenance')}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHelpDialog(false)}>
              {t('common:buttons.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Initialize Forge Dialog */}
      <Dialog open={showInitDialog} onOpenChange={(open) => {
        // Only allow closing if user manually closes (not during initialization)
        if (!open && !isInitializing) {
          handleSkipInit();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              {t('dialogs:initialize.title')}
            </DialogTitle>
            <DialogDescription>
              {t('dialogs:initialize.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="font-medium mb-2">{t('dialogs:initialize.willDo')}</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>{t('dialogs:initialize.createFolder')}</li>
                <li>{t('dialogs:initialize.copyFramework')}</li>
                <li>{t('dialogs:initialize.setupSpecs')}</li>
              </ul>
            </div>
            {!settings.autoBuildPath && (
              <div className="mt-4 rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-warning">{t('dialogs:initialize.sourcePathNotConfigured')}</p>
                    <p className="text-muted-foreground mt-1">
                      {t('dialogs:initialize.sourcePathNotConfiguredDescription')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleSkipInit} disabled={isInitializing}>
              {t('common:buttons.skip')}
            </Button>
            <Button
              onClick={handleInitialize}
              disabled={isInitializing || !settings.autoBuildPath}
            >
              {isInitializing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {t('common:labels.initializing')}
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {t('common:buttons.initialize')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Project Modal */}
      <AddProjectModal
        open={showAddProjectModal}
        onOpenChange={setShowAddProjectModal}
        onProjectAdded={handleProjectAdded}
      />

      {/* Git Setup Modal */}
      <GitSetupModal
        open={showGitSetupModal && !isSetupBlocked && !showHelpDialog}
        onOpenChange={handleGitSetupOpenChange}
        project={selectedProject || null}
        gitStatus={gitStatus}
        onGitInitialized={handleGitInitialized}
      />
    </TooltipProvider>
  );
}
