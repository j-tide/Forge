import { useState } from 'react';
import { FolderTree, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { useContextStore } from '../../stores/context-store';
import { verifyMemory, pinMemory, deprecateMemory, loadProjectContext } from '../../stores/context-store';
import { useProjectContext, useRefreshIndex, useMemorySearch } from './hooks';
import { ProjectIndexTab } from './ProjectIndexTab';
import { MemoriesTab } from './MemoriesTab';
import type { ContextProps } from './types';

export function Context({ projectId }: ContextProps) {
  const { t } = useTranslation('common');
  const context = useContextStore();
  // A prop change renders before its effect starts. Never expose the previous
  // project's contents or mutation controls during that render.
  const current = context.projectId === projectId;
  const {
    projectIndex,
    indexLoading,
    indexError,
    memoryStatus,
    memoryState,
    recentMemories,
    memoriesLoading,
    searchResults,
    searchLoading,
    searchError,
    searchCompleted,
    memoryError,
    mutationError,
    pendingMemoryIds
  } = context;

  const [activeTab, setActiveTab] = useState('index');

  // Custom hooks
  useProjectContext(projectId);
  const handleRefreshIndex = useRefreshIndex(projectId);
  const handleSearch = useMemorySearch(projectId);

  const handleVerify = async (memoryId: string) => {
    await verifyMemory(memoryId);
  };

  const handlePin = async (memoryId: string, pinned: boolean) => {
    await pinMemory(memoryId, pinned);
  };

  const handleDeprecate = async (memoryId: string) => {
    await deprecateMemory(memoryId);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="border-b border-border px-6 py-3">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="index" className="gap-2">
              <FolderTree className="h-4 w-4" />
              {t('context.tabs.projectIndex')}
            </TabsTrigger>
            <TabsTrigger value="memories" className="gap-2">
              <Brain className="h-4 w-4" />
              {t('context.tabs.memories')}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Project Index Tab */}
        <TabsContent value="index" className="flex-1 overflow-hidden m-0">
          <ProjectIndexTab
            projectIndex={current ? projectIndex : null}
            indexLoading={!current || indexLoading}
            indexError={current ? indexError : null}
            onRefresh={handleRefreshIndex}
          />
        </TabsContent>

        {/* Memories Tab */}
        <TabsContent value="memories" className="flex-1 overflow-hidden m-0">
          <MemoriesTab
            key={projectId}
            memoryStatus={current ? memoryStatus : null}
            memoryState={current ? memoryState : null}
            recentMemories={current ? recentMemories : []}
            memoriesLoading={!current || memoriesLoading}
            searchResults={current ? searchResults : []}
            searchLoading={current && searchLoading}
            searchError={current ? searchError : null}
            searchCompleted={current && searchCompleted}
            memoryError={current ? memoryError : null}
            mutationError={current ? mutationError : null}
            pendingMemoryIds={current ? pendingMemoryIds : []}
            onReload={() => loadProjectContext(projectId)}
            onSearch={handleSearch}
            onVerify={handleVerify}
            onPin={handlePin}
            onDeprecate={handleDeprecate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
