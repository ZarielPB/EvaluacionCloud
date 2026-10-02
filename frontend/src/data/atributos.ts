/**
 * Esquema de atributos variables por categoria.
 *
 * El enunciado pide que los campos dinamicos dependan de la familia elegida.
 * Las categorias reales estan en RDS (categorias) y son PERIFERICOS,
 * PANTALLAS y AUDIO, asi que los esquemas se definen sobre esos nombres.
 * Cada `clave` es la que se guarda como atributo en DynamoDB.
 */

export type TipoCampo = 'texto' | 'numero' | 'seleccion';

export interface CampoAtributo {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  opciones?: string[];
  ayuda?: string;
  requerido?: boolean;
  minimo?: number;
  maximo?: number;
}

export const ESQUEMAS_POR_CATEGORIA: Record<string, CampoAtributo[]> = {
  PERIFERICOS: [
    {
      clave: 'conexion',
      etiqueta: 'Conexion',
      tipo: 'seleccion',
      requerido: true,
      opciones: [
        'Bluetooth 5.1',
        'Bluetooth 5.3',
        'Cable USB',
        'Inalambrico 2.4 GHz',
        'USB-C',
      ],
    },
    {
      clave: 'distribucion',
      etiqueta: 'Distribucion',
      tipo: 'seleccion',
      requerido: true,
      opciones: ['ANSI 60%', 'ANSI 65%', 'ANSI 75%', 'ANSI 80%', 'ANSI 100%', 'Ergonomica'],
    },
    {
      clave: 'teclas',
      etiqueta: 'Numero de teclas',
      tipo: 'numero',
      ayuda: 'Opcional. Ejemplo: 87',
      minimo: 1,
      maximo: 300,
    },
  ],
  PANTALLAS: [
    {
      clave: 'pulgadas',
      etiqueta: 'Pulgadas',
      tipo: 'numero',
      requerido: true,
      ayuda: 'Entre 10 y 80',
      minimo: 10,
      maximo: 80,
    },
    {
      clave: 'resolucion',
      etiqueta: 'Resolucion',
      tipo: 'seleccion',
      requerido: true,
      opciones: ['1920x1080', '2560x1440', '3440x1440', '3840x2160'],
    },
    {
      clave: 'tecnologia',
      etiqueta: 'Tecnologia de panel',
      tipo: 'seleccion',
      opciones: ['TN', 'VA', 'IPS', 'OLED'],
    },
  ],
  AUDIO: [
    {
      clave: 'tipo',
      etiqueta: 'Tipo',
      tipo: 'seleccion',
      requerido: true,
      opciones: ['In-ear', 'On-ear', 'Over-ear', 'Bookshelf', 'Soundbar'],
    },
    {
      clave: 'conectividad',
      etiqueta: 'Conectividad',
      tipo: 'seleccion',
      requerido: true,
      opciones: ['Bluetooth', 'Cable USB', 'Inalambrico 2.4 GHz', 'Combo'],
    },
    {
      clave: 'autonomia_horas',
      etiqueta: 'Autonomia (horas)',
      tipo: 'numero',
      ayuda: 'Opcional. Ejemplo: 30',
      minimo: 1,
      maximo: 200,
    },
  ],
};

/** Si la categoria no tiene esquema propio, no se piden atributos variables. */
export function esquemaDe(categoria: string | number | null): CampoAtributo[] {
  if (categoria === null) return [];
  return ESQUEMAS_POR_CATEGORIA[String(categoria).toUpperCase()] ?? [];
}

/**
 * `familia` es un campo propio del item de DynamoDB. El backend lo acepta en
 * POST /productos y lo normaliza a mayusculas.
 */
export function familiaDe(categoria: string | number | null): string | null {
  if (categoria === null) return null;
  const nombre = String(categoria).toUpperCase();
  return ESQUEMAS_POR_CATEGORIA[nombre] ? nombre : null;
}
