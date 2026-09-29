import { describe, expect, it } from 'vitest';

import { AGENT_CONFIGS } from '../../config/agent-configs';
import {
  getBuildProgressTool,
  getSessionContextTool,
  recordDiscoveryTool,
  recordGotchaTool,
  updateQaStatusTool,
  updateSubtaskStatusTool,
} from '../forge';
import {
  getRequiredMcpServers,
  TOOL_GET_BUILD_PROGRESS,
  TOOL_GET_SESSION_CONTEXT,
  TOOL_RECORD_DISCOVERY,
  TOOL_RECORD_GOTCHA,
  TOOL_UPDATE_QA_STATUS,
  TOOL_UPDATE_SUBTASK_STATUS,
} from '../registry';

describe('Forge build tool namespace', () => {
  it('resolves each configured build tool to its public definition', () => {
    const tools = [
      updateSubtaskStatusTool,
      getBuildProgressTool,
      recordDiscoveryTool,
      recordGotchaTool,
      getSessionContextTool,
      updateQaStatusTool,
    ];
    const toolNames = new Set(tools.map((tool) => tool.metadata.name));
    expect(toolNames.size).toBe(6);
    expect(toolNames).toEqual(new Set([
      TOOL_UPDATE_SUBTASK_STATUS,
      TOOL_GET_BUILD_PROGRESS,
      TOOL_RECORD_DISCOVERY,
      TOOL_RECORD_GOTCHA,
      TOOL_GET_SESSION_CONTEXT,
      TOOL_UPDATE_QA_STATUS,
    ]));

    for (const config of Object.values(AGENT_CONFIGS)) {
      for (const toolName of config.forgeTools) {
        expect(toolName).toMatch(/^mcp__forge__/);
        expect(toolNames.has(toolName)).toBe(true);
      }
    }
  });

  it('preserves the required build server when older saved overrides remove it', () => {
    const servers = getRequiredMcpServers('coder', {
      mcpConfig: { AGENT_MCP_coder_REMOVE: 'auto-claude,memory' },
      memoryEnabled: true,
    });
    expect(servers).toContain('forge');
    expect(servers).not.toContain('memory');
  });
});
