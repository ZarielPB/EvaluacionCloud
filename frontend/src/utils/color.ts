/** Color pastel del badge segun la categoria del producto. */
export function colorDeCategoria(categoria: string): string {
  const nombre = categoria.toUpperCase();
  if (nombre.includes('PERIFER')) return 'bg-pastel-lavanda text-tinta';
  if (nombre.includes('PANTALLA') || nombre.includes('MONITOR')) return 'bg-pastel-lima text-tinta';
  if (nombre.includes('AUDIO')) return 'bg-pastel-melocoton text-tinta';
  return 'bg-primario-100 text-primario-700';
}
