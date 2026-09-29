import { useTranslation } from 'react-i18next';
import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../ui/input';

interface PasswordInputProps extends Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'ref'> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function PasswordInput({ value, onChange, placeholder, className, disabled, ...props }: PasswordInputProps) {
  const { t } = useTranslation('uiProjectSettings');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={showPassword ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className || 'pr-10'}
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        disabled={disabled}
        aria-pressed={showPassword}
        aria-label={showPassword ? t('hidePassword') : t('showPassword')}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
