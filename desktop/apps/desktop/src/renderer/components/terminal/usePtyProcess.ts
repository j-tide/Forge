import { useEffect, useRef, useCallback, useState, type RefObject } from 'react';
import { useTerminalStore } from '../../stores/terminal-store';
import { debugLog, debugError } from '../../../shared/utils/debug-logger';

// Wait up to three seconds for xterm dimensions during deliberate recreation.
const MAX_RECREATION_RETRIES = 30;
const RECREATION_RETRY_DELAY = 100;

interface UsePtyProcessOptions {
  terminalId: string;
  cwd?: string;
  projectPath?: string;
  cols: number;
  rows: number;
  skipCreation?: boolean;
  isRecreatingRef?: RefObject<boolean>;
  onCreated?: () => void;
  onError?: (error: string) => void;
}

export function usePtyProcess({
  terminalId, cwd, projectPath, cols, rows, skipCreation = false,
  isRecreatingRef, onCreated, onError,
}: UsePtyProcessOptions) {
  const isCreatingRef = useRef(false);
  const isCreatedRef = useRef(false);
  const isPreparedForRecreationRef = useRef(false);
  const mountedRef = useRef(false);
  const callbacksRef = useRef({ onCreated, onError, isRecreatingRef, skipCreation });
  callbacksRef.current = { onCreated, onError, isRecreatingRef, skipCreation };
  const [recreationTrigger, setRecreationTrigger] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const recreationRetryCountRef = useRef(0);
  const recreationRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptedGenerationRef = useRef<number | null>(null);
  const appliedGenerationRef = useRef<number | null>(null);
  const appliedIdentityRef = useRef<string | null>(null);
  const identity = JSON.stringify([terminalId, cwd, projectPath]);
  const contextRef = useRef({ identity, generation: 0 });
  if (contextRef.current.identity !== identity) {
    contextRef.current = { identity, generation: contextRef.current.generation + 1 };
  }

  const clearRetryTimer = useCallback(() => {
    if (recreationRetryTimerRef.current !== null) {
      clearTimeout(recreationRetryTimerRef.current);
      recreationRetryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      contextRef.current.generation += 1;
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  useEffect(() => {
    clearRetryTimer();
    const generation = contextRef.current.generation;
    const isCurrent = () => mountedRef.current && contextRef.current.generation === generation;
    if (appliedGenerationRef.current !== generation) {
      appliedGenerationRef.current = generation;
      attemptedGenerationRef.current = null;
      isCreatedRef.current = false;
      recreationRetryCountRef.current = 0;
      // Worktree changes must wait for the caller's destroy acknowledgement.
      isCreatingRef.current = isPreparedForRecreationRef.current;
      setIsCreating(isPreparedForRecreationRef.current);
      if (appliedIdentityRef.current !== identity) setCreationError(null);
      appliedIdentityRef.current = identity;
    }

    const reportFailure = (error: string) => {
      if (!isCurrent()) return;
      clearRetryTimer();
      attemptedGenerationRef.current = generation;
      isCreatingRef.current = false;
      recreationRetryCountRef.current = 0;
      if (callbacksRef.current.isRecreatingRef) callbacksRef.current.isRecreatingRef.current = false;
      setIsCreating(false);
      setCreationError(error);
      callbacksRef.current.onError?.(error);
    };

    if (skipCreation) {
      if (callbacksRef.current.isRecreatingRef?.current
        && !isPreparedForRecreationRef.current && attemptedGenerationRef.current !== generation) {
        if (recreationRetryCountRef.current >= MAX_RECREATION_RETRIES) {
          reportFailure('Terminal recreation failed: dimensions not ready');
        } else {
          recreationRetryCountRef.current += 1;
          setIsCreating(true);
          recreationRetryTimerRef.current = setTimeout(() => {
            recreationRetryTimerRef.current = null;
            if (isCurrent()) setRecreationTrigger((previous) => previous + 1);
          }, RECREATION_RETRY_DELAY);
        }
      }
      return;
    }
    if (isPreparedForRecreationRef.current || isCreatingRef.current || isCreatedRef.current
      || attemptedGenerationRef.current === generation) return;

    const store = useTerminalStore.getState();
    const terminalState = store.getTerminal(terminalId);
    const isRestored = terminalState?.isRestored === true;
    const alreadyRunning = terminalState?.status === 'running' || terminalState?.status === 'claude-active';
    const hasSameStoreSession = () => {
      const current = useTerminalStore.getState().getTerminal(terminalId);
      if (!terminalState) return !current;
      return current?.cwd === terminalState.cwd && current.projectPath === terminalState.projectPath
        && current.createdAt.getTime() === terminalState.createdAt.getTime();
    };
    const canApplyResult = () => isCurrent() && !isPreparedForRecreationRef.current && hasSameStoreSession();
    attemptedGenerationRef.current = generation;
    isCreatingRef.current = true;
    recreationRetryCountRef.current = 0;
    setIsCreating(true);

    debugLog('[usePtyProcess] Initializing PTY for terminal:', terminalId, { isRestored, attempt: recreationTrigger });
    void (async () => {
      let succeeded = false;
      try {
        if (isRestored && terminalState) {
          const result = await window.electronAPI.restoreTerminalSession({
            id: terminalState.id, title: terminalState.title, cwd: terminalState.cwd,
            projectPath: projectPath || '', isCLIMode: terminalState.isCLIMode,
            claudeSessionId: terminalState.claudeSessionId, outputBuffer: '',
            createdAt: terminalState.createdAt.toISOString(), lastActiveAt: new Date().toISOString(),
            worktreeConfig: terminalState.worktreeConfig,
          }, cols, rows);
          if (!canApplyResult()) return;
          if (!result.success || !result.data?.success || result.data.terminalId !== terminalId) {
            reportFailure(result.data?.error || result.error || 'Failed to restore terminal session');
            return;
          }
          const currentStore = useTerminalStore.getState();
          if (terminalState.status === 'exited') currentStore.setTerminalStatus(terminalId, 'idle');
          currentStore.setTerminalStatus(terminalId, terminalState.isCLIMode ? 'claude-active' : 'running');
          currentStore.updateTerminal(terminalId, { isRestored: false });
        } else {
          const result = await window.electronAPI.createTerminal({ id: terminalId, cwd, cols, rows, projectPath });
          if (!canApplyResult()) return;
          if (!result.success) {
            reportFailure(result.error || 'Failed to create terminal');
            return;
          }
          if (!alreadyRunning) {
            const currentStore = useTerminalStore.getState();
            if (terminalState?.status === 'exited') currentStore.setTerminalStatus(terminalId, 'idle');
            currentStore.setTerminalStatus(terminalId, 'running');
          }
        }
        succeeded = true;
      } catch (error) {
        if (!canApplyResult()) return;
        debugError('[usePtyProcess] Failed to initialize terminal:', terminalId, error);
        reportFailure(error instanceof Error ? error.message : 'Failed to initialize terminal');
      }
      if (!succeeded || !canApplyResult()) return;
      isCreatedRef.current = true;
      isCreatingRef.current = false;
      if (callbacksRef.current.isRecreatingRef) callbacksRef.current.isRecreatingRef.current = false;
      setIsCreating(false);
      setCreationError(null);
      callbacksRef.current.onCreated?.();
    })();
  }, [terminalId, cwd, projectPath, identity, cols, rows, skipCreation, recreationTrigger, clearRetryTimer]);

  const prepareForRecreate = useCallback(() => {
    clearRetryTimer();
    contextRef.current.generation += 1;
    isPreparedForRecreationRef.current = true;
    isCreatingRef.current = true;
    setIsCreating(true);
  }, [clearRetryTimer]);

  const resetForRecreate = useCallback(() => {
    clearRetryTimer();
    contextRef.current.generation += 1;
    isPreparedForRecreationRef.current = false;
    isCreatedRef.current = false;
    isCreatingRef.current = false;
    attemptedGenerationRef.current = null;
    recreationRetryCountRef.current = 0;
    setCreationError(null);
    setRecreationTrigger((previous) => previous + 1);
  }, [clearRetryTimer]);

  const retryCreation = useCallback(() => {
    if (isCreatingRef.current || isCreatedRef.current || isPreparedForRecreationRef.current || recreationRetryTimerRef.current !== null) return;
    contextRef.current.generation += 1;
    attemptedGenerationRef.current = null;
    recreationRetryCountRef.current = 0;
    if (callbacksRef.current.skipCreation && callbacksRef.current.isRecreatingRef) {
      callbacksRef.current.isRecreatingRef.current = true;
    }
    setRecreationTrigger((previous) => previous + 1);
  }, []);

  return { isCreated: isCreatedRef.current, isCreating, creationError, retryCreation, prepareForRecreate, resetForRecreate };
}
