import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Save,
  Loader2,
  Palette,
  Bot,
  FolderOpen,
  Package,
  Bell,
  Sparkles,
  Monitor,
  Globe,
  Code,
  Bug,
  Terminal,
  Users
} from 'lucide-react';

import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import { useSettings } from './hooks/useSettings';
import { ThemeSettings } from './ThemeSettings';
import { DisplaySettings } from './DisplaySettings';
import { LanguageSettings } from './LanguageSettings';
import { GeneralSettings } from './GeneralSettings';
import { AdvancedSettings } from './AdvancedSettings';
import { DevToolsSettings } from './DevToolsSettings';
import { DebugSettings } from './DebugSettings';
import { TerminalFontSettings } from './terminal-font-settings/TerminalFontSettings';
import { AccountSettings } from './AccountSettings';

interface AppSettingsPageProps {
  onClose: () => void;
  initialSection?: AppSection;
  onRerunWizard?: () => void;
}

// App-level settings sections
export type AppSection = 'appearance' | 'display' | 'language' | 'devtools' | 'terminal-fonts' | 'agent' | 'paths' | 'integrations' | 'accounts' | 'api-profiles' | 'updates' | 'notifications' | 'debug';

interface NavItemConfig<T extends string> {
  id: T;
  icon: React.ElementType;
}

const appNavItemsConfig: NavItemConfig<AppSection>[] = [
  { id: 'appearance', icon: Palette },
  { id: 'display', icon: Monitor },
  { id: 'language', icon: Globe },
  { id: 'devtools', icon: Code },
  { id: 'terminal-fonts', icon: Terminal },
  { id: 'agent', icon: Bot },
  { id: 'paths', icon: FolderOpen },
  { id: 'accounts', icon: Users },
  { id: 'updates', icon: Package },
  { id: 'notifications', icon: Bell },
  { id: 'debug', icon: Bug }
];

/**
 * Application settings page inside the main workspace
 * Contains only application-level preferences; project settings have their own page.
 */
export function AppSettingsPage({ onClose, initialSection, onRerunWizard }: AppSettingsPageProps) {
  const { t } = useTranslation('settings');
  const { settings, setSettings, isSaving, error, saveSettings, revertTheme, commitTheme } = useSettings();
  const [version, setVersion] = useState<string>('');

  const [appSection, setAppSection] = useState<AppSection>(initialSection || 'appearance');

  // Follow application deep links while this page is already open.
  useEffect(() => {
    if (initialSection) setAppSection(initialSection);
  }, [initialSection]);

  // Leaving the page discards unsaved appearance previews. Successful saves
  // commit the baseline first, so this also safely handles sidebar navigation.
  useEffect(() => () => revertTheme(), [revertTheme]);

  // Load app version on mount
  useEffect(() => {
    window.electronAPI.getAppVersion().then(setVersion);
  }, []);

  const handleSave = async () => {
    // Persist application settings without touching any project configuration.
    const appSaveSuccess = await saveSettings();

    if (appSaveSuccess) {
      // Commit the theme so future cancels won't revert to old values
      commitTheme();
      onClose();
    }
  };

  const handleCancel = () => {
    // Unmount cleanup reverts unsaved appearance changes
    onClose();
  };

  const renderAppSection = () => {
    switch (appSection) {
      case 'appearance':
        return <ThemeSettings settings={settings} onSettingsChange={setSettings} />;
      case 'display':
        return <DisplaySettings settings={settings} onSettingsChange={setSettings} />;
      case 'language':
        return <LanguageSettings settings={settings} onSettingsChange={setSettings} />;
      case 'devtools':
        return <DevToolsSettings settings={settings} onSettingsChange={setSettings} />;
      case 'terminal-fonts':
        return <TerminalFontSettings />;
      case 'agent':
        return <GeneralSettings settings={settings} onSettingsChange={setSettings} section="agent" />;
      case 'paths':
        return <GeneralSettings settings={settings} onSettingsChange={setSettings} section="paths" />;
      case 'accounts':
        return <AccountSettings settings={settings} onSettingsChange={setSettings} isOpen={true} />;
      case 'updates':
        return <AdvancedSettings settings={settings} onSettingsChange={setSettings} section="updates" version={version} />;
      case 'notifications':
        return <AdvancedSettings settings={settings} onSettingsChange={setSettings} section="notifications" version={version} />;
      case 'debug':
        return <DebugSettings />;
      default:
        return null;
    }
  };

  return (
    <section className="forge-settings-page flex h-full min-h-0 flex-col bg-background" aria-labelledby="settings-page-title">
        <header className="flex items-center gap-3 border-b border-border px-6 py-3">
          <Button variant="ghost" size="icon" onClick={handleCancel} aria-label={t('common:buttons.back')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 id="settings-page-title" className="flex items-center gap-3 text-xl font-semibold">
              {t('appTitle')}
            </h1>

          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full">
            {/* Navigation sidebar */}
            <nav aria-label={t('appTitle')} className="w-52 shrink-0 border-r border-border bg-card/50 p-3 xl:w-56">
              <ScrollArea className="h-full">
                <div className="space-y-6">
                  {/* APPLICATION Section */}
                  <div>
                    <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('tabs.app')}
                    </h3>
                    <div className="space-y-1">
                      {appNavItemsConfig.map((item) => {
                        const Icon = item.icon;
                        const isActive = appSection === item.id;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => {
                              setAppSection(item.id);
                            }}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              isActive
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium text-sm">{t(`sections.${item.id}.title`)}</div>

                            </div>
                          </button>
                        );
                      })}

                      {/* Re-run Wizard button */}
                      {onRerunWizard && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onRerunWizard();
                          }}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring mt-2',
                            'border border-dashed border-muted-foreground/30',
                            'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Sparkles className="h-4 w-4 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{t('actions.rerunWizard')}</div>

                          </div>
                        </button>
                      )}
                    </div>
                  </div>

                </div>

                {/* Version at bottom */}
                {version && (
                  <div className="mt-8 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground text-center">
                      {t('updates.version')} {version}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </nav>

            {/* Main content */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className={appSection === 'terminal-fonts' ? 'p-6 xl:p-8' : 'max-w-3xl p-6 xl:p-8'}>
                  {renderAppSection()}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-border bg-card px-6 py-3">
          {error && (
            <div role="alert" className="flex-1 rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button variant="outline" onClick={handleCancel}>
            {t('common:buttons.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common:buttons.saving', 'Saving...')}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t('actions.save')}
              </>
            )}
          </Button>
        </footer>
    </section>
  );
}
