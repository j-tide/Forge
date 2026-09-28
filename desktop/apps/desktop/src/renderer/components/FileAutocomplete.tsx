import { useState, useEffect, useCallback, useRef, useMemo, useId, type RefObject } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { useTranslation } from 'react-i18next';
import { File, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { detectFileMention } from '../lib/file-mention';
import { useFileExplorerStore } from '../stores/file-explorer-store';
import type { FileNode } from '../../shared/types';

interface FileAutocompleteProps {
  query: string;
  mentionStart?: number;
  projectPath: string;
  /** Textarea anchor. The popup follows the field, not its clipping modal. */
  anchorRef?: RefObject<HTMLTextAreaElement | null>;
  /** Viewport point fallback for callers without a field anchor. */
  position?: { top: number; left: number };
  onSelect: (filename: string, fullPath: string) => void;
  onClose: () => void;
  maxResults?: number;
}

/**
 * Autocomplete popup for @ file mentions in the task description.
 * Shows filtered list of files based on the query after @.
 */
export function FileAutocomplete({
  query,
  mentionStart,
  projectPath,
  anchorRef,
  position,
  onSelect,
  onClose,
  maxResults = 10
}: FileAutocompleteProps) {
  const { t } = useTranslation('uiTools');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  // Radix performs viewport collision detection and follows scroll/resize.
  // Use the textarea's actual rect instead of estimating a character width.
  const virtualAnchor = useMemo(() => ({
    current: {
      get contextElement() { return anchorRef?.current ?? undefined; },
      getBoundingClientRect: () => anchorRef?.current?.getBoundingClientRect()
        ?? new DOMRect(position?.left ?? 0, position?.top ?? 0, 0, 0),
    },
  }), [anchorRef, position?.left, position?.top]);
  const { files, loadDirectory } = useFileExplorerStore();

  // Load root directory if not cached
  useEffect(() => {
    if (projectPath && !files.has(projectPath)) {
      loadDirectory(projectPath);
    }
  }, [projectPath, files, loadDirectory]);

  // Collect all files from cache (flatten the tree)
  const allFiles = useMemo(() => {
    const result: FileNode[] = [];

    // Recursive function to collect all cached files
    const collectFiles = (dirPath: string, visited = new Set<string>()) => {
      if (visited.has(dirPath)) return;
      visited.add(dirPath);

      const dirFiles = files.get(dirPath);
      if (!dirFiles) return;

      for (const file of dirFiles) {
        result.push(file);
        // For directories, also load and collect their children if cached
        if (file.isDirectory && files.has(file.path)) {
          collectFiles(file.path, visited);
        }
      }
    };

    collectFiles(projectPath);
    return result;
  }, [files, projectPath]);

  // Filter files based on query
  const filteredFiles = useMemo(() => {
    if (!query) {
      // Show most recently accessed or common files when no query
      return allFiles.filter(f => !f.isDirectory).slice(0, maxResults);
    }

    const lowerQuery = query.toLowerCase();

    // Score files by match quality
    const scored = allFiles
      .filter(f => !f.isDirectory) // Only files, not directories
      .map(file => {
        const name = file.name.toLowerCase();
        const path = file.path.toLowerCase();

        let score = 0;

        // Exact name match (highest priority)
        if (name === lowerQuery) {
          score = 1000;
        }
        // Name starts with query
        else if (name.startsWith(lowerQuery)) {
          score = 100;
        }
        // Name contains query
        else if (name.includes(lowerQuery)) {
          score = 50;
        }
        // Path contains query
        else if (path.includes(lowerQuery)) {
          score = 10;
        }

        return { file, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(item => item.file);

    return scored;
  }, [allFiles, query, maxResults]);

  // Reset selection when results change
  const selectionContext = useRef({ query, filteredFiles });
  useEffect(() => {
    if (selectionContext.current.query !== query || selectionContext.current.filteredFiles !== filteredFiles) {
      selectionContext.current = { query, filteredFiles };
      setSelectedIndex(0);
    }
  }, [query, filteredFiles]);

  // Preserve the field's attributes when this transient popup is removed.
  useEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
    const attributes = ['aria-controls', 'aria-expanded', 'aria-autocomplete', 'aria-activedescendant'] as const;
    const previous = attributes.map((attribute) => [attribute, anchor.getAttribute(attribute)] as const);
    anchor.setAttribute('aria-controls', listId);
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-autocomplete', 'list');
    return () => {
      for (const [attribute, value] of previous) {
        if (value === null) anchor.removeAttribute(attribute);
        else anchor.setAttribute(attribute, value);
      }
    };
  }, [anchorRef, listId]);

  useEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
    if (filteredFiles[selectedIndex]) anchor.setAttribute('aria-activedescendant', `${listId}-${selectedIndex}`);
    else anchor.removeAttribute('aria-activedescendant');
  }, [anchorRef, listId, selectedIndex, filteredFiles]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list || !filteredFiles[selectedIndex]) return;

    const selectedElement = list.children[selectedIndex] as HTMLElement;
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, filteredFiles]);

  // Keep text input focus and never steal keys from unrelated controls.
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const fromAnchor = e.target === anchorRef?.current;
    const fromPopup = e.target instanceof Node && contentRef.current?.contains(e.target);
    if ((!fromAnchor && !fromPopup) || e.isComposing || e.keyCode === 229 || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Tab' && e.shiftKey) {
      onClose();
      return;
    }

    const selectedFile = filteredFiles[selectedIndex];
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (filteredFiles.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((previous) => e.key === 'ArrowDown'
          ? Math.min(previous + 1, filteredFiles.length - 1)
          : Math.max(previous - 1, 0));
        break;
      case 'Enter':
      case 'Tab':
        if (!selectedFile) {
          if (e.key === 'Tab') onClose();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onSelect(selectedFile.name, selectedFile.path);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onClose();
        break;
    }
  }, [anchorRef, filteredFiles, selectedIndex, onSelect, onClose]);

  // Capture Escape before the parent task dialog can dismiss itself.
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  useEffect(() => {
    const anchor = anchorRef?.current;
    if (!anchor) return;
    // Moving the caret out of the active mention must not replace stale text.
    const handleSelection = () => {
      const mention = detectFileMention(anchor.value, anchor.selectionStart);
      if (!mention || mention.query !== query || anchor.selectionStart !== anchor.selectionEnd ||
          (mentionStart !== undefined && mention.startPos !== mentionStart)) onClose();
    };
    anchor.addEventListener('select', handleSelection);
    return () => anchor.removeEventListener('select', handleSelection);
  }, [anchorRef, query, mentionStart, onClose]);

  // Get relative path from project root
  const getRelativePath = (fullPath: string) => {
    if (fullPath.startsWith(projectPath)) {
      return fullPath.slice(projectPath.length + 1); // +1 for the slash
    }
    return fullPath;
  };

  return (
    <PopoverPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <PopoverPrimitive.Anchor virtualRef={virtualAnchor} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={contentRef}
          role="presentation"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={16}
          hideWhenDetached
          updatePositionStrategy="always"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target === anchorRef?.current) event.preventDefault();
          }}
          className="pointer-events-auto z-50 flex w-80 max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
          style={{ maxHeight: 'min(280px, var(--radix-popover-content-available-height))' }}
        >
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={t('files.projectFiles')}
            className="min-h-0 overflow-y-auto"
          >
            {filteredFiles.length === 0 ? (
              <div role="status" className="p-3 text-sm text-muted-foreground">{t('files.noFiles')}</div>
            ) : filteredFiles.map((file, index) => (
              <button
                type="button"
                role="option"
                id={`${listId}-${index}`}
                aria-selected={index === selectedIndex}
                tabIndex={-1}
                key={file.path}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring transition-colors',
                  index === selectedIndex && 'bg-accent text-accent-foreground'
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(file.name, file.path)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <File className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{file.name}</div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 shrink-0" />
                    {getRelativePath(file.path)}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {filteredFiles.length > 0 && (
            <div className="shrink-0 border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/30">
              <span className="font-medium">↑↓</span> {t('files.navigate')} · <span className="font-medium">Enter</span> {t('files.select')} · <span className="font-medium">Esc</span> {t('files.close')}
            </div>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
