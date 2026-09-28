/** @vitest-environment jsdom */
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FeatureDetailPanel } from '../roadmap/FeatureDetailPanel';
import { IdeaDetailPanel } from '../ideation/IdeaDetailPanel';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import type { DocumentationGapIdea, RoadmapFeature } from '../../../shared/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const feature: RoadmapFeature = {
  id: 'feature-1', title: 'Improve source navigation', description: 'Description',
  rationale: 'Rationale', priority: 'must', complexity: 'low', impact: 'medium',
  phaseId: 'phase-1', dependencies: [], status: 'planned', acceptanceCriteria: [], userStories: [],
};
const idea: DocumentationGapIdea = {
  id: 'idea-1', title: 'Explain project setup', description: 'Description', rationale: 'Rationale',
  type: 'documentation_gaps', status: 'draft', createdAt: new Date('2026-09-28T00:00:00Z'),
  category: 'readme', targetAudience: 'developers', estimatedEffort: 'small',
  proposedContent: 'Installation instructions', priority: 'medium', affectedAreas: [],
};

afterEach(cleanup);

describe.each(['feature', 'idea'] as const)('%s detail panel boundary', (kind) => {
  const title = kind === 'feature' ? feature.title : idea.title;
  const closeLabel = kind === 'feature'
    ? 'accessibility.closeFeatureDetailsAriaLabel'
    : 'accessibility.closePanelAriaLabel';

  function Harness() {
    const [open, setOpen] = useState(false);
    const [backgroundClicks, setBackgroundClicks] = useState(0);
    return (
      <div data-testid="clipped-section" style={{ overflow: 'hidden', height: 48 }}>
        <button type="button" onClick={() => setOpen(true)}>Open details</button>
        <button type="button" onClick={() => setBackgroundClicks((count) => count + 1)}>
          Background action {backgroundClicks}
        </button>
        {open && (kind === 'feature'
          ? <FeatureDetailPanel feature={feature} onClose={() => setOpen(false)} onConvertToSpec={vi.fn()} onGoToTask={vi.fn()} />
          : <IdeaDetailPanel idea={idea} onClose={() => setOpen(false)} onConvert={vi.fn()} onDismiss={vi.fn()} />)}
      </div>
    );
  }

  async function openPanel() {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open details' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: title });
    return { trigger, dialog };
  }

  it('portals a labelled nonmodal panel outside its clipped section and focuses the close action', async () => {
    const { dialog } = await openPanel();
    expect(document.body.contains(dialog)).toBe(true);
    expect(screen.getByTestId('clipped-section').contains(dialog)).toBe(false);
    expect(dialog.getAttribute('aria-modal')).not.toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: closeLabel })));
  });

  it('closes with Escape and restores the opening control', async () => {
    const { trigger } = await openPanel();
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('keeps background actions available without dismissing the detail panel', async () => {
    await openPanel();
    const background = screen.getByRole('button', { name: 'Background action 0' });
    fireEvent.pointerDown(background);
    fireEvent.click(background);
    expect(screen.getByRole('button', { name: 'Background action 1' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: title })).toBeTruthy();
    expect(document.body.style.pointerEvents).not.toBe('none');
  });

  it('does not dismiss on Escape from an editable control', async () => {
    const { dialog } = await openPanel();
    const input = document.createElement('input');
    dialog.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: title })).toBeTruthy();
    within(dialog).getByRole('button', { name: closeLabel }).focus();
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull());
  });

  it('dismisses an active nested popover before closing the surrounding panel', async () => {
    const { dialog } = await openPanel();
    const nested = document.createElement('div');
    dialog.appendChild(nested);
    render(<Popover>
      <PopoverTrigger>Detail options</PopoverTrigger>
      <PopoverContent data-testid="detail-options"><button type="button">Nested action</button></PopoverContent>
    </Popover>, { container: nested });
    fireEvent.click(screen.getByRole('button', { name: 'Detail options' }));
    await screen.findByTestId('detail-options');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('detail-options')).toBeNull());
    expect(screen.getByRole('dialog', { name: title })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull());
  });
});
