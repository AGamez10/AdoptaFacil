export interface ProductThumbProps {
  url: string | null;
  alt: string;
}

/**
 * Foto de un producto en una tarjeta: proporción fija (no mueve la página al
 * cargar) y carga diferida, para que un catálogo largo no descargue todas las
 * fotos de entrada. Sin foto, un espacio neutro del mismo tamaño.
 */
export function ProductThumb({ url, alt }: ProductThumbProps) {
  return (
    <div className="aspect-[4/3] w-full bg-muted" data-testid="product-thumb">
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={400}
          height={300}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Sin foto
        </div>
      )}
    </div>
  );
}
