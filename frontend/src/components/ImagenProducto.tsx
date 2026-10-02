import { ImageOff } from 'lucide-react';
import { useState } from 'react';

import { urlImagen } from '../services/api';

interface Props {
  productoId: number;
  disponible: boolean;
  alt: string;
  className?: string;
}

/**
 * Miniatura servida por la API, no por S3: el navegador nunca accede
 * directamente al bucket. `GET /productos/{id}/imagen` responde 404 si la
 * miniatura aun no existe, y en ese caso se muestra el icono de respaldo.
 *
 * El componente se remonta con `key={producto_id}` cuando cambia de producto,
 * asi que no necesita reiniciar su estado interno en un efecto.
 */
export function ImagenProducto({ productoId, disponible, alt, className = '' }: Props) {
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(!disponible);

  if (fallo) {
    return (
      <div
        className={`flex items-center justify-center bg-primario-50 text-tinta-suave ${className}`}
        role="img"
        aria-label={`${alt}: sin miniatura disponible`}
      >
        <span className="flex flex-col items-center gap-1.5 text-xs">
          <ImageOff className="h-6 w-6" aria-hidden="true" />
          Sin miniatura
        </span>
      </div>
    );
  }

  return (
    <>
      {cargando && <div className={`esqueleto absolute inset-0 ${className}`} aria-hidden="true" />}
      <img
        src={urlImagen(productoId)}
        alt={alt}
        loading="lazy"
        onLoad={() => setCargando(false)}
        onError={() => {
          setCargando(false);
          setFallo(true);
        }}
        className={`${className} ${cargando ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
      />
    </>
  );
}
