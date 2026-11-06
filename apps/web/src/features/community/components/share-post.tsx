import { useState } from 'react';
import { Button, useToast } from '@adoptafacil/ui';
import { shareLink, shareTargets, shareText } from '../lib/share';

interface SharePostProps {
  post: { id: string; title?: string; body: string };
}

/** Botones para compartir una publicación pública en redes (y copiar el enlace). */
export function SharePost({ post }: SharePostProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const text = shareText(post);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shareLink(post.id, 'copy'));
      setCopied(true);
      toast({ title: 'Enlace copiado', variant: 'success' });
    } catch {
      toast({ title: 'No se pudo copiar el enlace', variant: 'warning' });
    }
  };

  return (
    <div className="space-y-2" data-testid="share-post">
      <p className="text-sm font-medium">Compártela</p>
      <ul className="flex flex-wrap gap-2" aria-label="Compartir en redes">
        {canNativeShare && (
          <li>
            <Button
              size="sm"
              onClick={() =>
                void navigator
                  .share({ title: text, url: shareLink(post.id, 'native') })
                  .catch(() => undefined)
              }
            >
              Compartir…
            </Button>
          </li>
        )}
        {shareTargets(post.id, text).map((target) => (
          <li key={target.network}>
            <a
              href={target.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-muted"
            >
              {target.label}
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          </li>
        ))}
        <li>
          <Button size="sm" variant="outline" onClick={() => void copy()}>
            {copied ? 'Copiado' : 'Copiar enlace'}
          </Button>
        </li>
      </ul>
    </div>
  );
}
