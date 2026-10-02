const precio = new Intl.NumberFormat('es-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `$1,299.00` */
export function formatearPrecio(valor: number | string | null | undefined): string {
  const numero = Number(valor);
  return precio.format(Number.isFinite(numero) ? numero : 0);
}

const fechaCorta = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** `30 sep 2026` a partir del ISO que devuelve RDS. */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return 'Sin fecha';
  const momento = new Date(iso);
  return Number.isNaN(momento.getTime()) ? 'Sin fecha' : fechaCorta.format(momento);
}

/** `1.9 MB`, para el limite de 5 MiB que impone la API. */
export function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Convierte los atributos de DynamoDB en pares legibles. La API puede devolver
 * valores numericos o texto, y algunos vienen como JSON serializado.
 */
export function etiquetaDeAtributo(clave: string): string {
  const conEspacios = clave.replace(/_/g, ' ');
  return conEspacios.charAt(0).toUpperCase() + conEspacios.slice(1);
}

export function valorDeAtributo(valor: unknown): string {
  if (valor === null || valor === undefined) return '-';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}
