import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Plus, Sparkles, Grid2X2, FolderTree, File, Folder, History, ChevronDown, Loader2, TerminalSquare, Settings } from 'lucide-react';
import { SortableTerminalWrapper } from './SortableTerminalWrapper';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { FileExplorerPanel } from './FileExplorerPanel';
import { ClaudeCodeStatusBadge } from './ClaudeCodeStatusBadge';
import { cn } from '../lib/utils';
import { useTerminalStore } from '../stores/terminal-store';
import { useTaskStore } from '../stores/task-store';
import { useFileExplorerStore } from '../stores/file-explorer-store';
import { TERMINAL_DOM_UPDATE_DELAY_MS, PANEL_CLEANUP_GRACE_PERIOD_MS } from '../../shared/constants';
import type { SessionDateInfo, TerminalSession } from '../../shared/types';

function isRestorableSession(value: unknown, projectPath: string): value is TerminalSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<TerminalSession>;
  return typeof session.id === 'string' && session.id.trim().length > 0
    && typeof session.title === 'string'
    && typeof session.cwd === 'string' && session.cwd.trim().length > 0
    && session.projectPath === projectPath
    && typeof session.isCLIMode === 'boolean'
    && typeof session.outputBuffer === 'string'
    && typeof session.createdAt === 'string' && Number.isFinite(Date.parse(session.createdAt))
    && typeof session.lastActiveAt === 'string' && Number.isFinite(Date.parse(session.lastActiveAt))
    && (session.displayOrder === undefined || (typeof session.displayOrder === 'number' && Number.isFinite(session.displayOrder)));
}

interface TerminalGridProps {
  projectPath?: string;
  onNewTaskClick?: () => void;
  isActive?: boolean;
}

export function TerminalGrid({ projectPath, onNewTaskClick, isActive = false }: TerminalGridProps) {
  const { t, i18n } = useTranslation(['common', 'uiTerminal']);
  const allTerminals = useTerminalStore((state) => state.terminals);

  // Track terminals that are in the grace period before being filtered out
  // Map of terminal ID -> timestamp when it was marked for cleanup
  const [pendingCleanup, setPendingCleanup] = useState<Map<string, number>>(new Map());

  // Ref to track active cleanup timers — avoids including pendingCleanup in effect deps
  const cleanupTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Helper to clear all active cleanup timers
  const clearAllCleanupTimers = useCallback(() => {
    for (const timer of cleanupTimersRef.current.values()) {
      clearTimeout(timer);
    }
    cleanupTimersRef.current.clear();
  }, []);

  // Filter terminals to show only those belonging to the current project
  // Also include legacy terminals without projectPath (created before this change)
  // Keep exited terminals in DOM during grace period to allow react-resizable-panels to reconcile
  const terminals = useMemo(() => {
    const filtered = projectPath
      ? allTerminals.filter(t => t.projectPath === projectPath || !t.projectPath)
      : allTerminals;

    // Filter out exited terminals UNLESS they are still in the grace period
    return filtered.filter(t => {
      if (t.status !== 'exited') {
        return true; // Keep all non-exited terminals
      }
      // Check if this exited terminal is in grace period
      const cleanupTime = pendingCleanup.get(t.id);
      if (cleanupTime) {
        const now = Date.now();
        return now < cleanupTime; // Keep if still within grace period
      }
      return false; // Remove if not in grace period
    });
  }, [allTerminals, projectPath, pendingCleanup]);

  // Manage grace period timers for exited terminals
  // When a terminal exits, add it to pendingCleanup and schedule its removal
  // Uses cleanupTimersRef to track scheduled timers, avoiding pendingCleanup in deps
  // No cleanup function here — timers must survive dependency changes
  useEffect(() => {
    const filtered = projectPath
      ? allTerminals.filter(t => t.projectPath === projectPath || !t.projectPath)
      : allTerminals;

    const exitedTerminals = filtered.filter(t => t.status === 'exited');

    for (const terminal of exitedTerminals) {
      // Check ref (not state) to see if a timer is already scheduled
      if (!cleanupTimersRef.current.has(terminal.id)) {
        const cleanupTime = Date.now() + PANEL_CLEANUP_GRACE_PERIOD_MS;
        setPendingCleanup(prev => new Map(prev).set(terminal.id, cleanupTime));

        const timer = setTimeout(() => {
          cleanupTimersRef.current.delete(terminal.id);
          setPendingCleanup(prev => {
            const next = new Map(prev);
            next.delete(terminal.id);
            return next;
          });
        }, PANEL_CLEANUP_GRACE_PERIOD_MS);

        cleanupTimersRef.current.set(terminal.id, timer);
      }
    }
  }, [allTerminals, projectPath]);

  // Clear all cleanup timers on unmount
  useEffect(() => {
    return clearAllCleanupTimers;
  }, [clearAllCleanupTimers]);

  const activeTerminalId = useTerminalStore((state) => state.activeTerminalId);
  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const removeTerminal = useTerminalStore((state) => state.removeTerminal);
  const setActiveTerminal = useTerminalStore((state) => state.setActiveTerminal);
  const canAddTerminal = useTerminalStore((state) => state.canAddTerminal);
  const setCLIMode = useTerminalStore((state) => state.setCLIMode);
  const reorderTerminals = useTerminalStore((state) => state.reorderTerminals);

  // Get tasks from task store for task selection dropdown in terminals
  const tasks = useTaskStore((state) => state.tasks);

  // File explorer state
  const fileExplorerOpen = useFileExplorerStore((state) => state.isOpen);
  const toggleFileExplorer = useFileExplorerStore((state) => state.toggle);

  // Session history state
  const [sessionDates, setSessionDates] = useState<SessionDateInfo[]>([]);
  const [isLoadingDates, setIsLoadingDates] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [historyError, setHistoryError] = useState<{ key: 'historyLoadFailed' | 'restoreInvalid' | 'restoreEmpty' | 'restoreFailed' | 'restorePartial' | 'restoreCleanupFailed'; date?: string } | null>(null);
  const historyContextRef = useRef({ projectPath, generation: 0, mounted: true });
  if (historyContextRef.current.projectPath !== projectPath) {
    historyContextRef.current = { projectPath, generation: historyContextRef.current.generation + 1, mounted: true };
  }
  const datesRequestRef = useRef(0);
  const restoreRequestRef = useRef<{ generation: number; date: string } | null>(null);

  useEffect(() => {
    historyContextRef.current.mounted = true;
    return () => {
      historyContextRef.current.mounted = false;
      historyContextRef.current.generation += 1;
    };
  }, []);

  // Expanded terminal state - when set, this terminal takes up the full grid space
  const [expandedTerminalId, setExpandedTerminalId] = useState<string | null>(null);

  // Reset expanded terminal and clear pending cleanup when project changes
  useEffect(() => {
    setExpandedTerminalId(null);
    setPendingCleanup(new Map());
    clearAllCleanupTimers();
  }, [projectPath, clearAllCleanupTimers]);

  const fetchSessionDates = useCallback(async () => {
    if (!projectPath) return;
    const generation = historyContextRef.current.generation;
    const request = ++datesRequestRef.current;
    const isCurrent = () => historyContextRef.current.mounted
      && historyContextRef.current.generation === generation && request === datesRequestRef.current;
    setIsLoadingDates(true);
    try {
      const result = await window.electronAPI.getTerminalSessionDates(projectPath);
      if (!isCurrent()) return;
      if (!result.success || !Array.isArray(result.data)) {
        setHistoryError({ key: 'historyLoadFailed' });
        return;
      }
      setSessionDates(result.data);
      setHistoryError((previous) => previous?.key === 'historyLoadFailed' ? null : previous);
    } catch {
      if (isCurrent()) setHistoryError({ key: 'historyLoadFailed' });
    } finally {
      if (isCurrent()) setIsLoadingDates(false);
    }
  }, [projectPath]);

  useEffect(() => {
    setSessionDates([]);
    setHistoryError(null);
    setIsRestoring(false);
    setIsLoadingDates(false);
    void fetchSessionDates();
  }, [fetchSessionDates]);

  // Get addRestoredTerminal from store
  const addRestoredTerminal = useTerminalStore((state) => state.addRestoredTerminal);

  // Handle restoring sessions from a specific date
  const handleRestoreFromDate = useCallback(async (date: string) => {
    if (!projectPath || restoreRequestRef.current?.generation === historyContextRef.current.generation) return;
    const request = { generation: historyContextRef.current.generation, date };
    restoreRequestRef.current = request;
    const isCurrent = () => historyContextRef.current.mounted && historyContextRef.current.generation === request.generation;
    const originalTerminals = useTerminalStore.getState().terminals.filter((terminal) =>
      terminal.status !== 'exited' && (terminal.projectPath === projectPath || !terminal.projectPath),
    );
    setIsRestoring(true);
    setHistoryError(null);
    try {
      const sessionsResult = await window.electronAPI.getTerminalSessionsForDate(date, projectPath);
      if (!isCurrent()) return;
      if (!sessionsResult.success || !Array.isArray(sessionsResult.data)) {
        setHistoryError({ key: 'restoreFailed', date });
        return;
      }
      const sessionsToRestore = sessionsResult.data;
      if (sessionsToRestore.length === 0) {
        setHistoryError({ key: 'restoreEmpty', date });
        return;
      }
      if (!sessionsToRestore.every((session) => isRestorableSession(session, projectPath))
        || new Set(sessionsToRestore.map((session) => session.id)).size !== sessionsToRestore.length) {
        setHistoryError({ key: 'restoreInvalid', date });
        return;
      }
      const sortedSessions = [...sessionsToRestore].sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER));
      const requestedIds = new Set(sortedSessions.map((session) => session.id));
      let failed = 0;
      let restored = 0;
      for (const session of sortedSessions) {
        if (!isCurrent()) return;
        const existing = useTerminalStore.getState().terminals.find((terminal) => terminal.id === session.id && terminal.status !== 'exited');
        if (existing) {
          // Shared live IDs keep their current buffer and metadata.
          if (existing.projectPath && existing.projectPath !== projectPath) failed += 1;
          continue;
        }
        try {
          const result = await window.electronAPI.restoreTerminalSession(session, 80, 24);
          if (!result.success || !result.data?.success || result.data.terminalId !== session.id) {
            failed += 1;
            continue;
          }
          // Acknowledged PTYs remain associated with their captured project even if
          // the user switches projects while the request is in flight.
          if (!useTerminalStore.getState().terminals.some((terminal) => terminal.id === session.id && terminal.status !== 'exited')) {
            if (useTerminalStore.getState().terminals.some((terminal) => terminal.id === session.id)) {
              // Commit the exited instance's unmount before its cleanup can write
              // old xterm output over the acknowledged history buffer.
              flushSync(() => removeTerminal(session.id));
            }
            const activeBeforeRestore = useTerminalStore.getState().activeTerminalId;
            addRestoredTerminal({ ...session, outputBuffer: result.data.outputBuffer ?? session.outputBuffer });
            if (!isCurrent()) setActiveTerminal(activeBeforeRestore);
          }
          restored += 1;
        } catch {
          failed += 1;
        }
      }
      if (!isCurrent()) return;
      if (failed > 0) {
        setHistoryError({ key: restored > 0 ? 'restorePartial' : 'restoreFailed', date });
        return;
      }

      // Replace disjoint originals only after every requested session is present.
      let cleanupFailed = false;
      const sameOriginal = (id: string) => {
        const current = useTerminalStore.getState().getTerminal(id);
        const original = originalTerminals.find((terminal) => terminal.id === id);
        return current && original && current.cwd === original.cwd
          && current.projectPath === original.projectPath && current.title === original.title
          && current.createdAt.getTime() === original.createdAt.getTime()
          && current.worktreeConfig === original.worktreeConfig;
      };
      for (const terminal of originalTerminals) {
        if (!isCurrent()) return;
        if (requestedIds.has(terminal.id)) continue;
        if (!useTerminalStore.getState().getTerminal(terminal.id)) continue;
        if (!sameOriginal(terminal.id)) {
          cleanupFailed = true;
          continue;
        }
        try {
          const result = await window.electronAPI.destroyTerminal(terminal.id);
          if (result.success && sameOriginal(terminal.id)) removeTerminal(terminal.id);
          else cleanupFailed = true;
        } catch {
          cleanupFailed = true;
        }
      }
      if (!isCurrent()) return;
      if (cleanupFailed) setHistoryError({ key: 'restoreCleanupFailed', date });
      window.dispatchEvent(new CustomEvent('terminal-refit-all'));
      await fetchSessionDates();
    } catch {
      if (isCurrent()) setHistoryError({ key: 'restoreFailed', date });
    } finally {
      if (restoreRequestRef.current === request) restoreRequestRef.current = null;
      if (isCurrent()) setIsRestoring(false);
    }
  }, [projectPath, removeTerminal, addRestoredTerminal, setActiveTerminal, fetchSessionDates]);

  // Setup drag sensors for both file and terminal drag operations
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Track dragging state for file overlay
  const [activeDragData, setActiveDragData] = React.useState<{
    path: string;
    name: string;
    isDirectory: boolean;
  } | null>(null);

  // Track dragging terminal for overlay
  const [draggingTerminalId, setDraggingTerminalId] = React.useState<string | null>(null);
  const draggingTerminal = terminals.find(t => t.id === draggingTerminalId);

  const handleCloseTerminal = useCallback((id: string) => {
    window.electronAPI.destroyTerminal(id);
    removeTerminal(id);
    // Clear expanded state if the closed terminal was expanded
    if (expandedTerminalId === id) {
      setExpandedTerminalId(null);
    }
  }, [removeTerminal, expandedTerminalId]);

  // Handle keyboard shortcut for new terminal (only when this view is active)
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+T or Cmd+T for new terminal
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        if (canAddTerminal(projectPath)) {
          addTerminal(projectPath, projectPath);
        }
      }
      // Ctrl+W or Cmd+W to close active terminal
      if ((e.ctrlKey || e.metaKey) && e.key === 'w' && activeTerminalId) {
        e.preventDefault();
        handleCloseTerminal(activeTerminalId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, addTerminal, canAddTerminal, projectPath, activeTerminalId, handleCloseTerminal]);

  const handleAddTerminal = useCallback(() => {
    if (canAddTerminal(projectPath)) {
      addTerminal(projectPath, projectPath);
    }
  }, [addTerminal, canAddTerminal, projectPath]);

  // Toggle terminal expand state
  const handleToggleExpand = useCallback((terminalId: string) => {
    setExpandedTerminalId(prev => prev === terminalId ? null : terminalId);
  }, []);

  const handleInvokeClaudeAll = useCallback(() => {
    terminals.forEach((terminal) => {
      if (terminal.status === 'running' && !terminal.isCLIMode) {
        setCLIMode(terminal.id, true);
        window.electronAPI.invokeCLIInTerminal(terminal.id, terminal.cwd || projectPath);
      }
    });
  }, [terminals, setCLIMode, projectPath]);

  // Handle drag start - store dragged item data
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as {
      type: string;
      path?: string;
      name?: string;
      isDirectory?: boolean;
      terminalId?: string;
    } | undefined;

    if (data?.type === 'file' && data.path && data.name !== undefined) {
      setActiveDragData({
        path: data.path,
        name: data.name,
        isDirectory: data.isDirectory ?? false
      });
    } else if (data?.type === 'terminal-panel') {
      setDraggingTerminalId(event.active.id.toString());
    }
  }, []);

  // Handle drag end - insert file path into terminal or reorder terminals
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    const activeData = active.data.current as { type?: string; path?: string } | undefined;

    // Clear drag states
    setActiveDragData(null);
    setDraggingTerminalId(null);

    if (!over) return;

    // Handle terminal reordering
    if (activeData?.type === 'terminal-panel') {
      const activeId = active.id.toString();
      let overId = over.id.toString();

      // Handle case where over is the file drop zone (terminal-xyz) instead of sortable item (xyz)
      if (overId.startsWith('terminal-')) {
        overId = overId.replace('terminal-', '');
      }

      if (activeId !== overId && terminals.some(t => t.id === overId)) {
        reorderTerminals(activeId, overId);

        // Persist the new order to disk so it survives app restarts
        // Use a microtask to ensure the store has updated before we read the new order
        if (projectPath) {
          queueMicrotask(async () => {
            const updatedTerminals = useTerminalStore.getState().terminals;
            const orders = updatedTerminals
              .filter(t => t.projectPath === projectPath || !t.projectPath)
              .map(t => ({ terminalId: t.id, displayOrder: t.displayOrder ?? 0 }));
            try {
              const result = await window.electronAPI.updateTerminalDisplayOrders(projectPath, orders);
              if (!result.success) {
                console.warn('[TerminalGrid] Failed to persist terminal order:', result.error);
              }
            } catch (error) {
              console.warn('[TerminalGrid] Failed to persist terminal order:', error);
            }
          });
        }

        // Refit terminals after dnd-kit CSS transitions settle
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('terminal-refit-all'));
        }, TERMINAL_DOM_UPDATE_DELAY_MS);
      }
      return;
    }

    // Handle file drop on terminal
    const overId = over.id.toString();
    let terminalId: string | null = null;

    if (overId.startsWith('terminal-')) {
      terminalId = overId.replace('terminal-', '');
    } else if (terminals.some(t => t.id === overId)) {
      // closestCenter might return the sortable ID instead of droppable ID
      terminalId = overId;
    }

    if (terminalId && activeData?.path) {
      // Quote the path if it contains spaces
      const quotedPath = activeData.path.includes(' ') ? `"${activeData.path}"` : activeData.path;
      // Insert the file path into the terminal with a trailing space
      window.electronAPI.sendTerminalInput(terminalId, quotedPath + ' ');
    }
  }, [reorderTerminals, terminals, projectPath]);

  // Calculate grid layout based on number of terminals
  const gridLayout = useMemo(() => {
    const count = terminals.length;
    if (count === 0) return { rows: 0, cols: 0 };
    if (count === 1) return { rows: 1, cols: 1 };
    if (count === 2) return { rows: 1, cols: 2 };
    if (count <= 4) return { rows: 2, cols: 2 };
    if (count <= 6) return { rows: 2, cols: 3 };
    if (count <= 9) return { rows: 3, cols: 3 };
    return { rows: 3, cols: 4 }; // Max 12 terminals = 3x4
  }, [terminals.length]);

  // Terminal IDs for SortableContext
  const terminalIds = useMemo(() => terminals.map(t => t.id), [terminals]);

  const historyControls = projectPath && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={isRestoring || isLoadingDates}>
          {isRestoring || isLoadingDates ? <Loader2 className="h-3 w-3 animate-spin" /> : <History className="h-3 w-3" />}
          {t('uiTerminal:history')}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{t('uiTerminal:restoreFrom')}</div>
        <DropdownMenuSeparator />
        {sessionDates.length === 0 && <DropdownMenuItem disabled>{t('uiTerminal:historyEmpty')}</DropdownMenuItem>}
        {sessionDates.map((dateInfo) => (
          <DropdownMenuItem key={dateInfo.date} onClick={() => void handleRestoreFromDate(dateInfo.date)} className="flex items-center justify-between">
            <span>{new Date(`${dateInfo.date}T12:00:00`).toLocaleDateString(i18n.resolvedLanguage || i18n.language, { month: 'short', day: 'numeric' })}</span>
            <span className="text-xs text-muted-foreground">{t('uiTerminal:sessionCount', { count: dateInfo.sessionCount })}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const historyFeedback = historyError && (
    <div role="alert" className="flex items-center gap-3 border-b border-destructive/20 bg-destructive/5 px-3 py-2">
      <p className="flex-1 text-sm text-destructive">{t(`uiTerminal:${historyError.key}`)}</p>
      <Button variant="outline" size="sm" disabled={isRestoring || isLoadingDates} onClick={() => {
        if (historyError.date) void handleRestoreFromDate(historyError.date);
        else void fetchSessionDates();
      }}>{t('common:buttons.retry')}</Button>
    </div>
  );

  // Empty state
  if (terminals.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-card p-4">
            <Grid2X2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t('uiTerminal:agentTerminals')}</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              {t('uiTerminal:emptyDescription')}
              {' '}<kbd className="px-1.5 py-0.5 text-xs bg-card border border-border rounded">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+T</kbd>
              {' '}{t('uiTerminal:createShortcut')}
            </p>
          </div>
        </div>
        <Button onClick={handleAddTerminal} className="gap-2">
          <Plus className="h-4 w-4" />
          {t('uiTerminal:newTerminal')}
        </Button>
        {historyControls}
        {historyFeedback}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full flex-col">
        {/* Toolbar */}
        <div className="flex h-10 items-center justify-between border-b border-border bg-card/30 px-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t('uiTerminal:terminalCount', { count: terminals.length, max: 12 })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Claude Code CLI status */}
            <ClaudeCodeStatusBadge />
            {/* Session history dropdown */}
            {historyControls}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-app-settings', { detail: 'terminal-fonts' }));
              }}
            >
              <Settings className="h-3 w-3" />
              {t('actions.settings')}
            </Button>
            {terminals.some((t) => t.status === 'running' && !t.isCLIMode) && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleInvokeClaudeAll}
              >
                <Sparkles className="h-3 w-3" />
                {t('uiTerminal:invokeClaudeAll')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleAddTerminal}
              disabled={!canAddTerminal(projectPath)}
            >
              <Plus className="h-3 w-3" />
              {t('uiTerminal:newTerminal')}
              <kbd className="ml-1 text-[10px] text-muted-foreground">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+T
              </kbd>
            </Button>
            {/* File explorer toggle button */}
            {projectPath && (
              <Button
                variant={fileExplorerOpen ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={toggleFileExplorer}
              >
                <FolderTree className="h-3 w-3" />
                {t('uiTerminal:files')}
              </Button>
            )}
          </div>
        </div>

        {historyFeedback}

        {/* Main content area with terminal grid and file explorer sidebar */}
        <div className="flex flex-1 overflow-hidden">
          {/* Terminal grid using resizable panels */}
          <div className={cn(
            "flex-1 overflow-hidden p-2 transition-all duration-300 ease-out",
            fileExplorerOpen && "pr-0"
          )}>
            {expandedTerminalId ? (
              // Show only the expanded terminal
              (() => {
                const expandedTerminal = terminals.find(t => t.id === expandedTerminalId);
                if (!expandedTerminal) return null;
                return (
                  <div className="h-full p-1">
                    <SortableTerminalWrapper
                      id={expandedTerminal.id}
                      cwd={expandedTerminal.cwd || projectPath}
                      projectPath={projectPath}
                      isActive={expandedTerminal.id === activeTerminalId}
                      onClose={() => handleCloseTerminal(expandedTerminal.id)}
                      onActivate={() => setActiveTerminal(expandedTerminal.id)}
                      tasks={tasks}
                      onNewTaskClick={onNewTaskClick}
                      terminalCount={1}
                      isExpanded={true}
                      onToggleExpand={() => handleToggleExpand(expandedTerminal.id)}
                    />
                  </div>
                );
              })()
            ) : (
              // Flat CSS Grid layout — all terminals are siblings of the same parent.
              // This prevents React from unmounting/remounting terminal components during
              // drag-drop reorder. With the old nested Group/Panel structure from
              // react-resizable-panels, terminals that changed rows got new parents,
              // causing React to unmount → dispose xterm → blank screen.
              // With a flat grid, React just reorders siblings (no unmount needed).
              <SortableContext items={terminalIds} strategy={rectSortingStrategy}>
                <div
                  className="h-full grid"
                  style={{
                    gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`,
                    gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`,
                  }}
                >
                  {terminals.map((terminal) => (
                    <div key={terminal.id} className="p-1 min-h-0 min-w-0">
                      <SortableTerminalWrapper
                        id={terminal.id}
                        cwd={terminal.cwd || projectPath}
                        projectPath={projectPath}
                        isActive={terminal.id === activeTerminalId}
                        onClose={() => handleCloseTerminal(terminal.id)}
                        onActivate={() => setActiveTerminal(terminal.id)}
                        tasks={tasks}
                        onNewTaskClick={onNewTaskClick}
                        terminalCount={terminals.length}
                        isExpanded={false}
                        onToggleExpand={() => handleToggleExpand(terminal.id)}
                      />
                    </div>
                  ))}
                </div>
              </SortableContext>
            )}
          </div>

          {/* File explorer panel (slides from right, pushes content) */}
          {projectPath && <FileExplorerPanel projectPath={projectPath} />}
        </div>

        {/* Drag overlay - shows what's being dragged */}
        <DragOverlay>
          {activeDragData && (
            <div className="flex items-center gap-2 bg-card border border-border rounded-md px-3 py-2 shadow-lg">
              {activeDragData.isDirectory ? (
                <Folder className="h-4 w-4 text-warning" />
              ) : (
                <File className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm">{activeDragData.name}</span>
            </div>
          )}
          {draggingTerminal && (
            <div className="flex items-center gap-2 bg-card border border-primary rounded-md px-3 py-2 shadow-lg">
              <TerminalSquare className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{draggingTerminal.title || t('uiTerminal:title')}</span>
            </div>
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
