import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ForgeMark } from '../ForgeBrand';
import {
  FullScreenDialog,
  FullScreenDialogContent,
  FullScreenDialogHeader,
  FullScreenDialogBody,
  FullScreenDialogTitle,
  FullScreenDialogDescription
} from '../ui/full-screen-dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { WizardProgress, WizardStep } from './WizardProgress';
import { WelcomeStep } from './WelcomeStep';
import { AccountsStep } from './AccountsStep';
import { DevToolsStep } from './DevToolsStep';
import { PrivacyStep } from './PrivacyStep';
import { MemoryStep } from './MemoryStep';
import { CompletionStep } from './CompletionStep';
import { useSettingsStore } from '../../stores/settings-store';

interface OnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTaskCreator?: () => void;
  onOpenSettings?: () => void;
}

// Wizard step identifiers
type WizardStepId = 'welcome' | 'accounts' | 'devtools' | 'privacy' | 'memory' | 'completion';
type CompletionAction = 'finish' | 'task' | 'settings';

// Step configuration with translation keys
const WIZARD_STEPS: { id: WizardStepId; labelKey: string }[] = [
  { id: 'welcome', labelKey: 'steps.welcome' },
  { id: 'accounts', labelKey: 'steps.accounts' },
  { id: 'devtools', labelKey: 'steps.devtools' },
  { id: 'privacy', labelKey: 'steps.privacy' },
  { id: 'memory', labelKey: 'steps.memory' },
  { id: 'completion', labelKey: 'steps.done' }
];

/**
 * Main onboarding wizard component.
 * Provides a full-screen, multi-step wizard experience for new users
 * to configure their Forge environment.
 *
 * Features:
 * - Step progress indicator
 * - Navigation between steps (next, back, skip)
 * - Persists completion state to settings
 * - Can be re-run from settings
 */
export function OnboardingWizard({
  open,
  onOpenChange,
  onOpenTaskCreator,
  onOpenSettings
}: OnboardingWizardProps) {
  const { t } = useTranslation('onboarding');
  const { updateSettings } = useSettingsStore();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStepId>>(new Set());
  const [isCompleting, setIsCompleting] = useState(false);
  const [isStepSaving, setIsStepSaving] = useState(false);
  const [completionError, setCompletionError] = useState(false);
  const completionPending = useRef(false);
  const pendingAction = useRef<CompletionAction>('finish');

  // Get current step ID
  const currentStepId = WIZARD_STEPS[currentStepIndex].id;

  // Build step data for progress indicator
  const steps: WizardStep[] = WIZARD_STEPS.map((step, index) => ({
    id: step.id,
    label: t(step.labelKey),
    completed: completedSteps.has(step.id) || index < currentStepIndex
  }));

  // Navigation handlers
  const goToNextStep = useCallback(() => {
    // Mark current step as completed
    setCompletedSteps(prev => new Set(prev).add(currentStepId));

    if (currentStepIndex < WIZARD_STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    }
  }, [currentStepIndex, currentStepId]);

  const goToPreviousStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  }, [currentStepIndex]);

  // Reset wizard state (for re-running) - defined before skipWizard/finishWizard that use it
  const resetWizard = useCallback(() => {
    setCurrentStepIndex(0);
    setCompletedSteps(new Set());
    setCompletionError(false);
  }, []);

  const completeWizard = useCallback(async (action: CompletionAction) => {
    if (completionPending.current) return;
    completionPending.current = true;
    pendingAction.current = action;
    setIsCompleting(true);
    setCompletionError(false);
    let saved = false;
    try {
      const result = await window.electronAPI.saveSettings({ onboardingCompleted: true });
      saved = result?.success === true;
    } catch {
      // Keep the user's current step and intended action available for retry.
    }
    if (!saved) {
      setCompletionError(true);
      completionPending.current = false;
      setIsCompleting(false);
      return;
    }
    updateSettings({ onboardingCompleted: true });
    resetWizard();
    onOpenChange(false);
    completionPending.current = false;
    setIsCompleting(false);
    if (action === 'task') onOpenTaskCreator?.();
    if (action === 'settings') onOpenSettings?.();
  }, [updateSettings, onOpenChange, resetWizard, onOpenTaskCreator, onOpenSettings]);

  const finishWizard = useCallback(() => {
    void completeWizard('finish');
  }, [completeWizard]);

  // Handle opening task creator from within wizard
  const handleOpenTaskCreator = useCallback(() => {
    void completeWizard('task');
  }, [completeWizard]);

  // Handle opening settings from completion step
  const handleOpenSettings = useCallback(() => {
    void completeWizard('settings');
  }, [completeWizard]);

  // Render current step content
  const renderStepContent = () => {
    switch (currentStepId) {
      case 'welcome':
        return (
          <WelcomeStep
            onGetStarted={goToNextStep}
            onSkip={finishWizard}
          />
        );
      case 'accounts':
        return (
          <AccountsStep
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            onSkip={goToNextStep}
          />
        );
      case 'devtools':
        return (
          <DevToolsStep
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            onSavingChange={setIsStepSaving}
          />
        );
      case 'privacy':
        return (
          <PrivacyStep
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            onSavingChange={setIsStepSaving}
          />
        );
      case 'memory':
        return (
          <MemoryStep
            onNext={goToNextStep}
            onBack={goToPreviousStep}
            onSavingChange={setIsStepSaving}
          />
        );
      case 'completion':
        return (
          <CompletionStep
            onFinish={finishWizard}
            onOpenTaskCreator={onOpenTaskCreator ? handleOpenTaskCreator : undefined}
            onOpenSettings={onOpenSettings ? handleOpenSettings : undefined}
          />
        );
      default:
        return null;
    }
  };

  // Closing or skipping still persists completion before dismissing the dialog.
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      if (isStepSaving) return;
      // If closing before completion, skip the wizard
      finishWizard();
    } else {
      onOpenChange(newOpen);
    }
  }, [finishWizard, onOpenChange, isStepSaving]);

  return (
    <FullScreenDialog open={open} onOpenChange={handleOpenChange}>
      <FullScreenDialogContent aria-busy={isCompleting || isStepSaving}>
        <FullScreenDialogHeader>
          <FullScreenDialogTitle className="flex items-center gap-3">
            <ForgeMark size={24} decorative />
            {t('wizard.title')}
          </FullScreenDialogTitle>
          <FullScreenDialogDescription>
            {t('wizard.description')}
          </FullScreenDialogDescription>
          {completionError && (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <span>{t('wizard.completionSaveFailed')}</span>
              <Button variant="outline" size="sm" onClick={() => void completeWizard(pendingAction.current)}>
                {t('wizard.retry')}
              </Button>
            </div>
          )}
          {isCompleting && <p role="status" className="text-sm text-muted-foreground">{t('wizard.saving')}</p>}

          {/* Progress indicator - show for all steps except welcome and completion */}
          {currentStepId !== 'welcome' && currentStepId !== 'completion' && (
            <div className="mt-6">
              <WizardProgress currentStep={currentStepIndex} steps={steps} />
            </div>
          )}
        </FullScreenDialogHeader>

        <FullScreenDialogBody>
          <ScrollArea className="h-full">
            <fieldset disabled={isCompleting} className="min-w-0 border-0 p-0">
              {renderStepContent()}
            </fieldset>
          </ScrollArea>
        </FullScreenDialogBody>
      </FullScreenDialogContent>
    </FullScreenDialog>
  );
}
