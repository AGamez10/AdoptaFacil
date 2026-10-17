import { createElement, type ComponentType } from 'react';

/**
 * Carga una pantalla en su propio archivo JS la primera vez que se visita.
 * La portada, el listado /adoptar, la ficha pública y el ingreso siguen en el
 * paquete inicial; el panel y los módulos privados se bajan solo cuando hacen
 * falta, así la primera visita pesa mucho menos.
 *
 * A diferencia de `React.lazy`, una vez cargado el módulo la pantalla se
 * pinta en el mismo render (sin pasar por el `Suspense`), y
 * `preloadLazyPages()` permite dejarlas todas listas de antemano (pruebas).
 */
const pending = new Set<() => Promise<unknown>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<M extends Record<string, any>, K extends keyof M>(
  load: () => Promise<M>,
  name: K,
): M[K] {
  let Loaded: ComponentType | null = null;
  let promise: Promise<void> | null = null;
  const preload = () =>
    (promise ??= load().then((module) => {
      Loaded = module[name] as ComponentType;
    }));
  pending.add(preload);

  function LazyPage(props: object) {
    if (Loaded) return createElement(Loaded, props);
    // Protocolo de Suspense: se suspende hasta que llega el archivo.
    throw preload();
  }
  LazyPage.displayName = `Lazy(${String(name)})`;
  return LazyPage as M[K];
}

/** Descarga de una vez todas las pantallas diferidas que ya se declararon. */
export function preloadLazyPages(): Promise<unknown[]> {
  return Promise.all([...pending].map((preload) => preload()));
}
