/** @vitest-environment jsdom */
import { useState, type ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskFormFields } from '../TaskFormFields';
import { AgentProfileSelector } from '../../AgentProfileSelector';

// Provider discovery has its own integration coverage. Keep the task form real
// while isolating provider/network state from this interaction regression suite.
vi.mock('../../AgentProfileSelector', () => ({
  AgentProfileSelector: vi.fn(({ disabled }: { disabled?: boolean }) => (
    <button type="button" disabled={disabled}>Fixture agent configuration</button>
  )),
}));

type FormProps = ComponentProps<typeof TaskFormFields>;

function props(overrides: Partial<FormProps> = {}): FormProps {
  return {
    description: '', onDescriptionChange: vi.fn(),
    title: '', onTitleChange: vi.fn(),
    profileId: 'auto', model: '', thinkingLevel: '',
    onProfileChange: vi.fn(), onModelChange: vi.fn(), onThinkingLevelChange: vi.fn(),
    onPhaseModelsChange: vi.fn(), onPhaseThinkingChange: vi.fn(),
    category: '', priority: '', complexity: '', impact: '',
    onCategoryChange: vi.fn(), onPriorityChange: vi.fn(),
    onComplexityChange: vi.fn(), onImpactChange: vi.fn(),
    showClassification: false, onShowClassificationChange: vi.fn(),
    images: [], onImagesChange: vi.fn(),
    requireReviewBeforeCoding: false, onRequireReviewChange: vi.fn(),
    idPrefix: 'create',
    ...overrides,
  };
}

afterEach(cleanup);

describe('TaskFormFields interactions', () => {
  it('edits the task request and optional title through their original callbacks', () => {
    const onDescriptionChange = vi.fn();
    const onTitleChange = vi.fn();
    render(<TaskFormFields {...props({ onDescriptionChange, onTitleChange })} />);

    const description = screen.getByRole('textbox', { name: /Description/ });
    expect(description).toHaveAttribute('aria-required', 'true');
    expect(description).toHaveAccessibleDescription();
    fireEvent.change(description, { target: { value: 'Add a date filter to the orders page' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Task Title/ }), {
      target: { value: 'Order date filter' },
    });

    expect(onDescriptionChange).toHaveBeenCalledWith('Add a date filter to the orders page');
    expect(onTitleChange).toHaveBeenCalledWith('Order date filter');
  });

  it('expands classification without silently changing task metadata', () => {
    const formProps = props();
    function ControlledClassification() {
      const [expanded, setExpanded] = useState(false);
      return <TaskFormFields {...formProps} showClassification={expanded} onShowClassificationChange={setExpanded} />;
    }
    render(<ControlledClassification />);
    const toggle = screen.getByRole('button', { name: 'Classification (optional)' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument();
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
    expect(formProps.onCategoryChange).not.toHaveBeenCalled();
    expect(formProps.onPriorityChange).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(screen.queryByRole('combobox', { name: 'Category' })).not.toBeInTheDocument();
  });

  it('keeps review opt-in controlled instead of enabling or disabling it during layout changes', () => {
    const onRequireReviewChange = vi.fn();
    const formProps = props({ onRequireReviewChange });
    const { rerender } = render(<TaskFormFields {...formProps} />);
    const review = screen.getByRole('checkbox', { name: 'Require human review before coding' });

    expect(review).not.toBeChecked();
    fireEvent.click(review);
    expect(onRequireReviewChange).toHaveBeenLastCalledWith(true);
    rerender(<TaskFormFields {...formProps} requireReviewBeforeCoding />);
    expect(review).toBeChecked();
    fireEvent.click(review);
    expect(onRequireReviewChange).toHaveBeenLastCalledWith(false);
  });

  it('disables editable controls and prevents toggle callbacks during submission', () => {
    const formProps = props({ disabled: true, showClassification: true });
    render(<TaskFormFields {...formProps} />);

    for (const field of screen.getAllByRole('textbox')) expect(field).toBeDisabled();
    for (const field of screen.getAllByRole('combobox')) expect(field).toBeDisabled();
    const review = screen.getByRole('checkbox', { name: 'Require human review before coding' });
    expect(review).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fixture agent configuration' })).toBeDisabled();
    const classification = screen.getByRole('button', { name: 'Classification (optional)' });
    expect(classification).toBeDisabled();
    fireEvent.click(classification);
    fireEvent.click(review);
    expect(formProps.onShowClassificationChange).not.toHaveBeenCalled();
    expect(formProps.onRequireReviewChange).not.toHaveBeenCalled();
  });

  it('preserves the exact per-phase execution configuration handed to the agent selector', () => {
    const phaseModels = { spec: 'sonnet', planning: 'opus', coding: 'sonnet', qa: 'sonnet' } as const;
    const phaseThinking = { spec: 'low', planning: 'high', coding: 'medium', qa: 'high' } as const;
    const formProps = props({ phaseModels, phaseThinking });
    render(<TaskFormFields {...formProps} />);

    expect(vi.mocked(AgentProfileSelector).mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      profileId: 'auto', phaseModels, phaseThinking,
      onProfileChange: formProps.onProfileChange,
      onModelChange: formProps.onModelChange,
      onPhaseModelsChange: formProps.onPhaseModelsChange,
      onPhaseThinkingChange: formProps.onPhaseThinkingChange,
    }));
    expect(formProps.onProfileChange).not.toHaveBeenCalled();
    expect(formProps.onPhaseModelsChange).not.toHaveBeenCalled();
  });

  it('announces a real submission error without hiding or replacing the user request', () => {
    render(<TaskFormFields {...props({ description: 'Keep this input', error: 'The task could not be saved' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The task could not be saved');
    expect(screen.getByRole('textbox', { name: /Description/ })).toHaveValue('Keep this input');
  });

  it('opens attachment previews from a keyboard-focusable button and restores focus on close', async () => {
    const image = { id: 'image-1', filename: 'wireframe.png', mimeType: 'image/png', size: 1, thumbnail: 'data:image/png;base64,AA==' };
    render(<TaskFormFields {...props({ images: [image] })} />);
    fireEvent.click(screen.getByRole('button', { name: /Reference Images/ }));
    const preview = screen.getByRole('button', { name: image.filename });
    preview.focus();
    fireEvent.click(preview);
    expect(screen.getByRole('dialog', { name: image.filename })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    await waitFor(() => expect(preview).toHaveFocus());
  });

  it('retains the image attachment disclosure and gives it an actual controlled panel', () => {
    render(<TaskFormFields {...props()} />);
    const attachments = screen.getByRole('button', { name: 'Reference Images (optional)' });
    expect(attachments).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(attachments);
    expect(attachments).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(attachments.getAttribute('aria-controls') ?? '')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Capture' })).toBeInTheDocument();
  });
});
