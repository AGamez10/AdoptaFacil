import { cn } from '@adoptafacil/ui';

/** Círculo con la inicial de quien publica; las organizaciones llevan otro color. */
export function AuthorAvatar({
  name,
  organization = false,
  className,
}: {
  name: string;
  organization?: boolean;
  className?: string;
}) {
  const initial = (name.trim()[0] ?? '·').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid h-11 w-11 flex-none place-items-center rounded-full text-base font-bold',
        organization ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary',
        className,
      )}
    >
      {initial}
    </span>
  );
}
