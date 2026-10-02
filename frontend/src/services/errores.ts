import { ErrorApi } from './api';

/** Convierte cualquier error en un mensaje que se pueda mostrar tal cual. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) return error.mensaje;
  if (error instanceof Error) return error.message;
  return 'Ocurrio un error inesperado.';
}
