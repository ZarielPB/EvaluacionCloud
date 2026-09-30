import { Router } from 'express';
import { consultar } from '../db.js';

export const categoriasRouter = Router();

// El enunciado pide "devuelve las categorias almacenadas en RDS".
categoriasRouter.get('/', async (_req, res, next) => {
  try {
    const filas = await consultar(
      `SELECT categoria_id, nombre, descripcion
         FROM categorias
        ORDER BY categoria_id`,
    );
    res.json(filas);
  } catch (error) {
    next(error);
  }
});

export default categoriasRouter;
