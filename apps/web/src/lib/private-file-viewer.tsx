import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@adoptafacil/ui';
import { useApiClient } from '../shell/api';
import { toViewableFile, type ViewableKind } from './private-file';
import styles from './private-file-viewer.module.scss';

interface Props {
  /** Clave privada del archivo (`storageRef`); `null` cierra el visor. */
  storageRef: string | null;
  title: string;
  /** Ruta de lectura; por defecto `/storage/private?key=…`. */
  path?: string;
  onClose: () => void;
}

type ViewState =
  | { status: 'loading' }
  | { status: 'ready'; kind: ViewableKind; url: string }
  | { status: 'unsafe' }
  | { status: 'error'; message: string };

/**
 * Visor en la misma página de un archivo privado (documento legal, adjunto
 * clínico). Nunca fuerza una descarga: el PDF lo abre el visor del navegador y
 * la imagen se muestra como imagen. Lo que no es PDF ni imagen no se abre.
 */
export function PrivateFileViewer({ storageRef, title, path, onClose }: Props) {
  const client = useApiClient();
  const [state, setState] = useState<ViewState>({ status: 'loading' });

  useEffect(() => {
    if (!storageRef) return undefined;
    let active = true;
    let url: string | null = null;
    setState({ status: 'loading' });
    client
      .requestBlob(path ?? `/storage/private?key=${encodeURIComponent(storageRef)}`)
      .then(toViewableFile)
      .then((file) => {
        if (!active) return;
        if (!file) {
          setState({ status: 'unsafe' });
          return;
        }
        url = URL.createObjectURL(file.blob);
        setState({ status: 'ready', kind: file.kind, url });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
          });
        }
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [client, path, storageRef]);

  return (
    <Dialog open={storageRef !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.viewer}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Se muestra aquí mismo, sin descargarlo a tu equipo.</DialogDescription>
        </DialogHeader>
        {state.status === 'loading' && <Skeleton className="h-96 w-full" />}
        {state.status === 'ready' && state.kind === 'pdf' && (
          <iframe title={title} src={state.url} className={styles.viewer__frame} />
        )}
        {state.status === 'ready' && state.kind === 'image' && (
          <img src={state.url} alt={title} className={styles.viewer__image} />
        )}
        {state.status === 'unsafe' && (
          <p role="alert" className={styles.viewer__message}>
            Este archivo no es un PDF ni una imagen, así que no lo abrimos por seguridad. Sube el
            documento de nuevo en PDF o como foto.
          </p>
        )}
        {state.status === 'error' && (
          <p role="alert" className={styles.viewer__message}>
            No se pudo abrir el documento. {state.message}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
