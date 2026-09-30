import pg from 'pg';
import { config } from './config.js';

// NUMERIC viene como string en pg para no perder precision.
// El enunciado pide precio decimal: lo devolvemos como number en JSON.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// BIGINT (producto_id) tambien viene como string por seguridad.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

const { Pool } = pg;

export const pool = new Pool({
  host: config.rds.host,
  port: config.rds.puerto,
  database: config.rds.base,
  user: config.rds.usuario,
  password: config.rds.clave,
  max: config.rds.max,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (error) => {
  console.error('[rds] error del pool:', error.message);
});

export async function consultar(texto, valores = []) {
  const resultado = await pool.query(texto, valores);
  return resultado.rows;
}

export async function consultarUno(texto, valores = []) {
  const filas = await consultar(texto, valores);
  return filas[0] ?? null;
}

export async function conTransaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

export async function verificarRds() {
  const fila = await consultarUno('SELECT current_database() AS base, version() AS version');
  return fila;
}
