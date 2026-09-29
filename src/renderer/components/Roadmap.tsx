import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive } from 'lucide-react';
import { RoadmapGenerationProgress } from './RoadmapGenerationProgress';
import { CompetitorAnalysisDialog } from './CompetitorAnalysisDialog';
import { ExistingCompetitorAnalysisDialog } from './ExistingCompetitorAnalysisDialog';
import { CompetitorAnalysisViewer } from './CompetitorAnalysisViewer';
import { AddFeatureDialog } from './AddFeatureDialog';
import { RoadmapHeader } from './roadmap/RoadmapHeader';
import { RoadmapEmptyState } from './roadmap/RoadmapEmptyState';
import { RoadmapTabs } from './roadmap/RoadmapTabs';
import { FeatureDetailPanel } from './roadmap/FeatureDetailPanel';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from './ui/alert-dialog';
import { useRoadmapData, useFeatureActions, useRoadmapGeneration, useRoadmapSave, useFeatureDelete } from './roadmap/hooks';
import { getCompetitorInsightsForFeature } from './roadmap/utils';
import type { RoadmapFeature } from '../../shared/types';
import type { RoadmapProps } from './roadmap/types';

export function Roadmap({ projectId, onGoToTask }: RoadmapProps) {
  const { t } = useTranslation('common');
  const { t: tk } = useTranslation('uiKnowledge');

  // State management
  const [selectedFeature, setSelectedFeature] = useState<RoadmapFeature | null>(null);
  const [activeTab, setActiveTab] = useState('kanban');
  const [showAddFeatureDialog, setShowAddFeatureDialog] = useState(false);
  const [showCompetitorViewer, setShowCompetitorViewer] = useState(false);
  const [pendingArchiveFeatureId, setPendingArchiveFeatureId] = useState<string | null>(null);

  // Custom hooks
  const { roadmap, competitorAnalysis, generationStatus } = useRoadmapData(projectId);
  const { convertFeatureToSpec, error: convertError, isConverting } = useFeatureActions();
  const { saveRoadmap, error: saveError, isSaving } = useRoadmapSave(projectId);
  const { deleteFeature, error: deleteError, isDeleting } = useFeatureDelete(projectId);
  const mutationError = convertError || saveError || deleteError;
  const isMutating = isConverting || isSaving || isDeleting;
  const previousProjectRef = useRef(projectId);
  useEffect(() => {
    if (previousProjectRef.current === projectId) return;
    previousProjectRef.current = projectId;
    setSelectedFeature(null);
    setPendingArchiveFeatureId(null);
    setShowAddFeatureDialog(false);
  }, [projectId]);
  const {
    competitorAnalysisDate,
    // New dialog for existing analysis
    showExistingAnalysisDialog,
    setShowExistingAnalysisDialog,
    handleUseExistingAnalysis,
    handleRunNewAnalysis,
    handleSkipAnalysis,
    // Original dialog for no existing analysis
    showCompetitorDialog,
    setShowCompetitorDialog,
    handleGenerate,
    handleRefresh,
    handleCompetitorDialogAccept,
    handleCompetitorDialogDecline,
    handleStop,
  } = useRoadmapGeneration(projectId);

  // Event handlers
  const handleConvertToSpec = async (feature: RoadmapFeature) => {
    return convertFeatureToSpec(projectId, feature, selectedFeature, setSelectedFeature);
  };

  const handleGoToTask = (specId: string) => {
    if (onGoToTask) {
      onGoToTask(specId);
    }
  };

  const handleArchiveFeature = (featureId: string) => {
    setPendingArchiveFeatureId(featureId);
  };

  const confirmArchiveFeature = async () => {
    if (!pendingArchiveFeatureId) return;
    const removed = await deleteFeature(pendingArchiveFeatureId);
    if (removed) {
      if (selectedFeature?.id === pendingArchiveFeatureId) {
        setSelectedFeature(null);
      }
      setPendingArchiveFeatureId(null);
    }
  };

  // Show generation progress
  if (generationStatus.phase !== 'idle' && generationStatus.phase !== 'complete') {
    return (
      <div className="flex h-full items-center justify-center">
        <RoadmapGenerationProgress
          generationStatus={generationStatus}
          className="w-full max-w-md"
          onStop={handleStop}
        />
      </div>
    );
  }

  // Show empty state
  if (!roadmap) {
    return (
      <>
        <RoadmapEmptyState onGenerate={handleGenerate} />
        {/* Dialog for projects WITHOUT existing competitor analysis */}
        <CompetitorAnalysisDialog
          open={showCompetitorDialog}
          onOpenChange={setShowCompetitorDialog}
          onAccept={handleCompetitorDialogAccept}
          onDecline={handleCompetitorDialogDecline}
          projectId={projectId}
        />
        {/* Dialog for projects WITH existing competitor analysis */}
        <ExistingCompetitorAnalysisDialog
          open={showExistingAnalysisDialog}
          onOpenChange={setShowExistingAnalysisDialog}
          onUseExisting={handleUseExistingAnalysis}
          onRunNew={handleRunNewAnalysis}
          onSkip={handleSkipAnalysis}
          analysisDate={competitorAnalysisDate}
          projectId={projectId}
        />
      </>
    );
  }

  // Main roadmap view
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <RoadmapHeader
        roadmap={roadmap}
        competitorAnalysis={competitorAnalysis}
        onAddFeature={() => setShowAddFeatureDialog(true)}
        onRefresh={handleRefresh}
        onViewCompetitorAnalysis={() => setShowCompetitorViewer(true)}
      />
      {mutationError && (
        <div role="alert" className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {mutationError}
        </div>
      )}
      {isMutating && (
        <p role="status" className="mx-4 mt-2 text-sm text-muted-foreground">
          {tk(isConverting ? 'creatingTask' : 'savingChanges')}
        </p>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <RoadmapTabs
          roadmap={roadmap}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onFeatureSelect={setSelectedFeature}
          onConvertToSpec={handleConvertToSpec}
          onGoToTask={handleGoToTask}
          onSave={saveRoadmap}
          onArchive={handleArchiveFeature}
        />
      </div>

      {/* Feature Detail Panel */}
      {selectedFeature && (
        <FeatureDetailPanel
          feature={selectedFeature}
          onClose={() => setSelectedFeature(null)}
          onConvertToSpec={handleConvertToSpec}
          onGoToTask={handleGoToTask}
          onDelete={deleteFeature}
          mutationError={deleteError}
          isDeleting={isDeleting}
          onArchive={handleArchiveFeature}
          competitorInsights={getCompetitorInsightsForFeature(selectedFeature, competitorAnalysis)}
        />
      )}

      {/* Competitor Analysis Permission Dialog (no existing analysis) */}
      <CompetitorAnalysisDialog
        open={showCompetitorDialog}
        onOpenChange={setShowCompetitorDialog}
        onAccept={handleCompetitorDialogAccept}
        onDecline={handleCompetitorDialogDecline}
        projectId={projectId}
      />

      {/* Competitor Analysis Options Dialog (existing analysis) */}
      <ExistingCompetitorAnalysisDialog
        open={showExistingAnalysisDialog}
        onOpenChange={setShowExistingAnalysisDialog}
        onUseExisting={handleUseExistingAnalysis}
        onRunNew={handleRunNewAnalysis}
        onSkip={handleSkipAnalysis}
        analysisDate={competitorAnalysisDate}
        projectId={projectId}
      />

      {/* Competitor Analysis Viewer */}
      <CompetitorAnalysisViewer
        analysis={competitorAnalysis}
        open={showCompetitorViewer}
        onOpenChange={setShowCompetitorViewer}
        projectId={projectId}
      />

      {/* Add Feature Dialog */}
      <AddFeatureDialog
        phases={roadmap.phases}
        open={showAddFeatureDialog}
        onOpenChange={setShowAddFeatureDialog}
      />

      {/* Archive Confirmation Dialog */}
      <AlertDialog
        open={!!pendingArchiveFeatureId}
        onOpenChange={(open) => { if (!open) setPendingArchiveFeatureId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-muted-foreground" />
              <AlertDialogTitle>{t('roadmap.archiveFeatureConfirmTitle')}</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {t('roadmap.archiveFeatureConfirmDescription', {
                title: pendingArchiveFeatureId
                  ? roadmap.features.find((f) => f.id === pendingArchiveFeatureId)?.title ?? ''
                  : '',
              })}
            </AlertDialogDescription>
            {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={isDeleting} onClick={(event) => { event.preventDefault(); void confirmArchiveFeature(); }}>
              {t('roadmap.archiveFeature')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
