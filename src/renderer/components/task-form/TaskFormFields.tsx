/**
 * TaskFormFields - Shared form fields component for task create/edit
 *
 * Bundles the common form fields used in both TaskCreationWizard and TaskEditDialog:
 * - Description (required, with image paste/drop support)
 * - Reference Images section (collapsible, with screenshot capture)
 * - Title (optional)
 * - Agent profile selector
 * - Classification fields (collapsible)
 * - Review requirement checkbox
 */
import { useRef, useState, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Image as ImageIcon, X, Camera, Zap, Info } from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { AgentProfileSelector } from '../AgentProfileSelector';
import { ClassificationFields } from './ClassificationFields';
import { useImageUpload, type FileReferenceData } from './useImageUpload';
import { createThumbnail } from '../ImageUpload';
import { ScreenshotCapture } from '../ScreenshotCapture';
import { ImagePreviewModal } from './ImagePreviewModal';
import { cn } from '../../lib/utils';
import { normalizeCapturedImage } from '../../lib/captured-image';
import { MAX_IMAGES_PER_TASK, MAX_IMAGE_SIZE } from '../../../shared/constants';
import type {
  TaskCategory,
  TaskPriority,
  TaskComplexity,
  TaskImpact,
  ImageAttachment,
  ModelType,
  ThinkingLevel
} from '../../../shared/types';
import type { PhaseModelConfig, PhaseThinkingConfig } from '../../../shared/types/settings';

interface TaskFormFieldsProps {
  // Project context (for loading image thumbnails from disk)
  projectPath?: string;
  specId?: string;

  // Description field
  description: string;
  onDescriptionChange: (value: string) => void;
  descriptionPlaceholder?: string;
  /** Optional custom content to render inside the description field (e.g., autocomplete popup) */
  descriptionOverlay?: ReactNode;
  /** Optional ref for the description textarea (used for @ mention autocomplete positioning) */
  descriptionRef?: React.RefObject<HTMLTextAreaElement | null>;

  // Title field
  title: string;
  onTitleChange: (value: string) => void;

  // Agent profile
  profileId: string;
  model: ModelType | '';
  thinkingLevel: ThinkingLevel | '';
  phaseModels?: PhaseModelConfig;
  phaseThinking?: PhaseThinkingConfig;
  onProfileChange: (profileId: string, model: ModelType | '', thinkingLevel: ThinkingLevel | '') => void;
  onModelChange: (model: ModelType | '') => void;
  onThinkingLevelChange: (level: ThinkingLevel | '') => void;
  onPhaseModelsChange: (config: PhaseModelConfig | undefined) => void;
  onPhaseThinkingChange: (config: PhaseThinkingConfig | undefined) => void;

  // Classification
  category: TaskCategory | '';
  priority: TaskPriority | '';
  complexity: TaskComplexity | '';
  impact: TaskImpact | '';
  onCategoryChange: (value: TaskCategory | '') => void;
  onPriorityChange: (value: TaskPriority | '') => void;
  onComplexityChange: (value: TaskComplexity | '') => void;
  onImpactChange: (value: TaskImpact | '') => void;
  showClassification: boolean;
  onShowClassificationChange: (show: boolean) => void;

  // Images
  images: ImageAttachment[];
  onImagesChange: (images: ImageAttachment[]) => void;

  // Review requirement
  requireReviewBeforeCoding: boolean;
  onRequireReviewChange: (require: boolean) => void;

  // Fast mode
  fastMode?: boolean;
  onFastModeChange?: (value: boolean) => void;
  showFastModeToggle?: boolean;

  // Form state
  disabled?: boolean;
  error?: string | null;
  onError?: (error: string | null) => void;

  // ID prefix for accessibility
  idPrefix?: string;

  /** Optional children to render after description (e.g., @ mention highlight overlay) */
  children?: ReactNode;

  /** Creation-only execution settings, kept in the same configuration column. */
  configurationFooter?: ReactNode;

  /** Callback when a file reference is dropped (from FileTreeItem drag) */
  onFileReferenceDrop?: (reference: string, data: FileReferenceData) => void;
}

export function TaskFormFields({
  projectPath,
  specId,
  description,
  onDescriptionChange,
  descriptionPlaceholder,
  descriptionOverlay,
  descriptionRef: externalDescriptionRef,
  title,
  onTitleChange,
  profileId,
  model,
  thinkingLevel,
  phaseModels,
  phaseThinking,
  onProfileChange,
  onModelChange,
  onThinkingLevelChange,
  onPhaseModelsChange,
  onPhaseThinkingChange,
  category,
  priority,
  complexity,
  impact,
  onCategoryChange,
  onPriorityChange,
  onComplexityChange,
  onImpactChange,
  showClassification,
  onShowClassificationChange,
  images,
  onImagesChange,
  requireReviewBeforeCoding,
  onRequireReviewChange,
  fastMode = false,
  onFastModeChange,
  showFastModeToggle = false,
  disabled = false,
  error,
  onError,
  idPrefix = '',
  children,
  configurationFooter,
  onFileReferenceDrop
}: TaskFormFieldsProps) {
  const { t } = useTranslation(['tasks', 'common']);
  // Use external ref if provided (for @ mention autocomplete), otherwise use internal ref
  const internalDescriptionRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = externalDescriptionRef || internalDescriptionRef;
  const prefix = idPrefix ? `${idPrefix}-` : '';

  // Reference Images section state
  const [showReferenceImages, setShowReferenceImages] = useState(false);
  const [screenshotModalOpen, setScreenshotModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<ImageAttachment | null>(null);

  // Auto-expand reference images section when images are added via paste/drop/capture
  const prevImagesLengthRef = useRef(images.length);
  useEffect(() => {
    if (images.length > 0 && images.length > prevImagesLengthRef.current) {
      // Images were added, expand the section
      setShowReferenceImages(true);
    }
    prevImagesLengthRef.current = images.length;
  }, [images.length]);

  // Track images we've attempted to load thumbnails for to prevent infinite loops
  // Note: Failed thumbnail loads are not retried (persists across re-renders)
  // This prevents repeated failed IPC calls for missing/corrupt images
  const loadedThumbnailsRef = useRef<Set<string>>(new Set());

  // Track the latest images to avoid stale closure issues
  const imagesRef = useRef<ImageAttachment[]>(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // Load thumbnails for images that have path but no thumbnail (fix placeholder bug)
  // This handles the case when TaskFormFields mounts with persisted images from disk
  useEffect(() => {
    let cancelled = false;

    const loadMissingThumbnails = async () => {
      // Need project context to load images from disk
      if (!projectPath || !specId) return;

      // Find images that have path but no thumbnail and haven't been attempted yet
      const imagesToLoad = images.filter(
        img => img.path && !img.thumbnail && !loadedThumbnailsRef.current.has(img.id)
      );

      if (imagesToLoad.length === 0) return;

      // Mark these as attempted before loading to prevent re-entry
      imagesToLoad.forEach(img => loadedThumbnailsRef.current.add(img.id));

      // Collect loaded thumbnails into a Map to avoid stale closure issues
      const thumbnailMap = new Map<string, string>();

      for (const image of imagesToLoad) {
        try {
          const result = await window.electronAPI.loadImageThumbnail(projectPath, specId, image.path!);
          if (result.success && result.data) {
            thumbnailMap.set(image.id, result.data);
          }
        } catch (error) {
          // Log for debugging but don't block other images
          console.debug('Failed to load thumbnail for image', image.id, error);
        }
      }

      // Merge thumbnails into current state without overwriting user changes
      if (thumbnailMap.size > 0 && !cancelled) {
        const updatedImages = imagesRef.current.map(img => ({
          ...img,
          thumbnail: thumbnailMap.get(img.id) ?? img.thumbnail
        }));
        onImagesChange(updatedImages);
      }
    };

    loadMissingThumbnails();

    return () => {
      cancelled = true;
    };
  }, [images, onImagesChange, projectPath, specId]);

  // Use the shared image upload hook with translated error messages
  const {
    isDragOver,
    pasteSuccess,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeImage
  } = useImageUpload({
    images,
    onImagesChange,
    disabled,
    onError,
    errorMessages: {
      maxImagesReached: t('tasks:form.errors.maxImagesReached'),
      invalidImageType: t('tasks:form.errors.invalidImageType'),
      processPasteFailed: t('tasks:form.errors.processPasteFailed'),
      processDropFailed: t('tasks:form.errors.processDropFailed')
    },
    onFileReferenceDrop
  });

  /**
   * Handle screenshot capture from modal
   *
   * Validates the max images limit and creates a thumbnail for the screenshot.
   */
  const handleScreenshotCapture = async (imageData: string) => {
    if (disabled) return;
    // Check max images limit
    if (imagesRef.current.length >= MAX_IMAGES_PER_TASK) {
      onError?.(t('tasks:form.errors.maxImagesReached'));
      return;
    }

    const captured = normalizeCapturedImage(imageData);
    if (!captured) {
      onError?.(t('tasks:screenshot.errors.capture'));
      return;
    }
    if (captured.size > MAX_IMAGE_SIZE) {
      onError?.(t('common:insights.images.screenshotTooLarge', {
        size: Math.round(captured.size / 1024 / 1024),
        max: Math.round(MAX_IMAGE_SIZE / 1024 / 1024)
      }));
      return;
    }

    try {
      const thumbnail = await createThumbnail(captured.dataUrl);
      // Other attachments may have been added while thumbnail processing was pending.
      const currentImages = imagesRef.current;
      if (currentImages.length >= MAX_IMAGES_PER_TASK) {
        onError?.(t('tasks:form.errors.maxImagesReached'));
        return;
      }
      const newImage: ImageAttachment = {
        id: crypto.randomUUID(),
        filename: `screenshot-${Date.now()}.png`,
        data: captured.data,
        thumbnail,
        mimeType: 'image/png',
        size: captured.size
      };
      onImagesChange([...currentImages, newImage]);
    } catch {
      onError?.(t('tasks:screenshot.errors.capture'));
    }
  };

  return (
    <>
      <ScreenshotCapture
        open={screenshotModalOpen}
        onOpenChange={setScreenshotModalOpen}
        onCapture={handleScreenshotCapture}
      />
      <ImagePreviewModal
        open={previewImage !== null}
        onOpenChange={(open) => !open && setPreviewImage(null)}
        image={previewImage}
      />

      <div className="grid items-start gap-6 @min-[760px]:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {/* Description (Primary - Required) */}
          <div className="space-y-2">
            <Label htmlFor={`${prefix}description`} className="text-sm font-medium text-foreground">
              {t('tasks:form.description')} <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              {/* Optional overlay (e.g., @ mention highlighting) */}
              {descriptionOverlay}
              <Textarea
                ref={descriptionRef}
                id={`${prefix}description`}
                placeholder={descriptionPlaceholder || t('tasks:form.descriptionPlaceholder')}
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                onPaste={handlePaste}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                rows={6}
                disabled={disabled}
                aria-required="true"
                aria-describedby={`${prefix}description-help`}
                className={cn(
                  'resize-y min-h-[240px] max-h-[440px] rounded-lg bg-background leading-relaxed relative',
                  descriptionOverlay && 'bg-transparent',
                  isDragOver && !disabled && 'border-primary bg-primary/5 ring-2 ring-primary/20'
                )}
                style={descriptionOverlay ? { caretColor: 'auto' } : undefined}
              />
            </div>
            <p id={`${prefix}description-help`} className="text-xs text-muted-foreground">
              {t('images.pasteHint', { shortcut: navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V' })}
            </p>

            {/* Optional children (e.g., @ mention autocomplete) */}
            {children}
          </div>

          {/* Paste Success Indicator */}
          {pasteSuccess && (
            <div className="flex items-center gap-2 text-sm text-success animate-in fade-in slide-in-from-top-1 duration-200">
              <ImageIcon className="h-4 w-4" />
              {t('tasks:form.imageAddedSuccess')}
            </div>
          )}

          {/* Reference Images Toggle */}
          <button
            type="button"
            onClick={() => setShowReferenceImages(!showReferenceImages)}
            className={cn(
              'flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors',
              'w-full justify-between py-2.5 px-3 rounded-lg border border-border bg-background hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            disabled={disabled}
            aria-expanded={showReferenceImages}
            aria-controls={`${prefix}reference-images-section`}
          >
            <span className="flex items-center gap-2">
              {t('tasks:referenceImages.title')}
              {images.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {images.length}
                </span>
              )}
            </span>
            {showReferenceImages ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {/* Reference Images Section */}
          {showReferenceImages && (
            <div id={`${prefix}reference-images-section`} className="space-y-3 p-3 rounded-lg border border-border bg-background">
              <p className="text-xs text-muted-foreground">
                {t('tasks:referenceImages.description')}
              </p>

              {/* Capture Button */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setScreenshotModalOpen(true)}
                  disabled={disabled}
                  className="gap-2"
                >
                  <Camera className="h-4 w-4" />
                  {t('tasks:screenshot.capture')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t('images.pasteHint', { shortcut: navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V' })}
                </span>
              </div>

              {/* Image Thumbnails */}
              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((image) => (
                    <div
                      key={image.id}
                      className="relative group rounded-md border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                      style={{ width: '72px', height: '72px' }}
                      title={image.filename}
                    >
                      <button
                        type="button"
                        className="h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        onClick={() => setPreviewImage(image)}
                        aria-label={image.filename}
                      >
                      {image.thumbnail ? (
                        <img
                          src={image.thumbnail}
                          alt={image.filename}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      </button>
                      {/* Remove button */}
                      {!disabled && (
                        <button
                          type="button"
                          className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(image.id);
                          }}
                          aria-label={t('images.removeImageAriaLabel', { filename: image.filename })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {images.length === 0 && (
                <div className="flex items-center justify-center py-4 border border-dashed border-border rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {t('tasks:feedback.dragDropHint')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Title (Optional) */}
          <div className="space-y-2">
            <Label htmlFor={`${prefix}title`} className="text-sm font-medium text-foreground">
              {t('tasks:form.taskTitle')} <span className="text-muted-foreground font-normal">({t('common:labels.optional')})</span>
            </Label>
            <Input
              id={`${prefix}title`}
              placeholder={t('tasks:form.titlePlaceholder')}
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              disabled={disabled}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('tasks:form.titleHelpText')}
            </p>
          </div>

        </div>
        <aside className="min-w-0 space-y-4 rounded-2xl border border-border bg-muted/30 p-4">
          {/* Agent Profile Selection */}
          <AgentProfileSelector
            profileId={profileId}
            model={model}
            thinkingLevel={thinkingLevel}
            phaseModels={phaseModels}
            phaseThinking={phaseThinking}
            onProfileChange={onProfileChange}
            onModelChange={onModelChange}
            onThinkingLevelChange={onThinkingLevelChange}
            onPhaseModelsChange={onPhaseModelsChange}
            onPhaseThinkingChange={onPhaseThinkingChange}
            disabled={disabled}
          />

          {/* Classification Toggle */}
          <button
            type="button"
            onClick={() => onShowClassificationChange(!showClassification)}
            className={cn(
              'flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors',
              'w-full justify-between py-2.5 px-3 rounded-lg border border-border bg-background hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            disabled={disabled}
            aria-expanded={showClassification}
            aria-controls={`${prefix}classification-section`}
          >
            <span>{t('tasks:form.classificationOptional')}</span>
            {showClassification ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {/* Classification Fields */}
          {showClassification && (
            <div id={`${prefix}classification-section`}>
              <ClassificationFields
                category={category}
                priority={priority}
                complexity={complexity}
                impact={impact}
                onCategoryChange={onCategoryChange}
                onPriorityChange={onPriorityChange}
                onComplexityChange={onComplexityChange}
                onImpactChange={onImpactChange}
                disabled={disabled}
                idPrefix={idPrefix}
              />
            </div>
          )}

          {/* Review Requirement Toggle */}
          <div className="flex items-start gap-3 border-t border-border pt-4">
            <Checkbox
              id={`${prefix}require-review`}
              checked={requireReviewBeforeCoding}
              onCheckedChange={(checked) => onRequireReviewChange(checked === true)}
              disabled={disabled}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor={`${prefix}require-review`}
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                {t('tasks:form.requireReviewLabel')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('tasks:form.requireReviewDescription')}
              </p>
            </div>
          </div>

          {/* Fast Mode Toggle - shown when any phase uses an Opus model */}
          {showFastModeToggle && onFastModeChange && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 shrink-0">
                    <Zap className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <Label htmlFor={`${prefix}fast-mode`} className="text-sm font-medium text-foreground">
                      {t('tasks:form.fastModeLabel')}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('tasks:form.fastModeDescription')}
                    </p>
                  </div>
                </div>
                <Switch
                  id={`${prefix}fast-mode`}
                  checked={fastMode}
                  onCheckedChange={onFastModeChange}
                  disabled={disabled}
                />
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/5 border border-warning/20 p-2.5">
                <Info className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed text-warning">
                  {t('tasks:form.fastModeNotice')}
                </p>
              </div>
            </div>
          )}

          {configurationFooter}
        </aside>
        {/* Error Display */}
        {error && (
          <div className="@min-[760px]:col-span-2 flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive" role="alert">
            <X className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </>
  );
}
