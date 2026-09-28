import { Separator } from '../ui/separator';

interface SettingsSectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

/**
 * Reusable wrapper component for settings sections
 * Provides consistent layout and styling
 */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <div className="forge-settings-section space-y-5">
      <div>
        <h3 className="text-xl font-semibold tracking-tight text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Separator className="bg-border/70" />
      {children}
    </div>
  );
}
