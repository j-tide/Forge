import { useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { GripVertical, Settings2, X, Folder } from 'lucide-react';
import { cn } from '../lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import type { Project } from '../../shared/types';

interface SortableProjectTabProps {
  project: Project;
  isActive: boolean;
  canClose: boolean;
  tabIndex: number;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
  onSettingsClick?: () => void;
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl+';

export function useProjectTabSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

export function SortableProjectTab({ project, isActive, canClose, tabIndex, onSelect, onClose, onSettingsClick }: SortableProjectTabProps) {
  const { t } = useTranslation('common');
  const shortcutHint = tabIndex < 9 ? `${modKey}${tabIndex + 1}` : '';
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined }}
      data-active={isActive}
      className={cn(
        'forge-glass-project-tab group relative flex h-9 shrink-0 items-center gap-0.5 rounded-lg border border-transparent px-1 transition-colors',
        isActive ? 'border-border bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/50',
        isDragging && 'opacity-60 shadow-lg'
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex h-6 w-4 shrink-0 touch-none items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-grab active:cursor-grabbing"
        aria-label={t('projectTab.reorderProjectAriaLabel', { name: project.name })}
        onClick={(event) => event.stopPropagation()}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className="flex h-7 min-w-0 items-center gap-2 rounded px-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={onSelect}
          >
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="max-w-[160px] truncate font-medium">{project.name}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-2">
          <span>{project.name}</span>
          {shortcutHint && <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{shortcutHint}</kbd>}
        </TooltipContent>
      </Tooltip>
      {isActive && onSettingsClick && (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => { event.stopPropagation(); onSettingsClick(); }}
              aria-label={t('projectTab.settings')}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('projectTab.settings')}</TooltipContent>
        </Tooltip>
      )}
      {canClose && (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', isActive && 'opacity-100')}
              onClick={onClose}
              aria-label={t('projectTab.closeTabAriaLabel')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex items-center gap-2">
            <span>{t('projectTab.closeTab')}</span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{modKey}W</kbd>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
