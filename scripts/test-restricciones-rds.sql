-- =====================================================================
-- LOMAX SA | Etapa 2 - Verificacion E2
-- Archivo : scripts/test-restricciones-rds.sql
-- Autor   : jeysi702
-- Servicio: Amazon RDS - PostgreSQL 15
--
-- Demuestra que el motor RECHAZA operaciones invalidas y que cada
-- rechazo se hace sin dejar registros parciales: cada intento va
-- dentro de un BEGIN y se cierra con ROLLBACK, y despues se cuenta
-- cuantas filas quedaron realmente.
-- =====================================================================

\set ON_ERROR_STOP off

\echo ''
\echo '###### Huella de partida (debe coincidir con 89cbbb10659cb11901f991c398ab3a3b) ######'
SELECT COUNT(*) AS n, SUM(precio) AS suma_precios,
       MD5(string_agg(codigo || ':' || precio, ',' ORDER BY producto_id)) AS huella
  FROM productos;

\echo ''
\echo '###### PRUEBA 1 - INSERCION VALIDA (debe ACEPTARSE) ######'
BEGIN;
INSERT INTO productos (codigo, nombre, descripcion, precio, categoria_id)
VALUES ('LOM-TEST1', 'Producto Valido', 'Registro temporal valido de la prueba E2', 10.00, 1);
SELECT 'dentro de la transaccion' AS momento, COUNT(*) AS filas_deben_ser_1
  FROM productos WHERE codigo = 'LOM-TEST1';
ROLLBACK;
SELECT 'despues del rollback' AS momento, COUNT(*) AS filas_deben_ser_0
  FROM productos WHERE codigo = 'LOM-TEST1';

\echo ''
\echo '###### PRUEBA 2 - CODIGO DUPLICADO (debe RECHAZARSE, SQLSTATE 23505) ######'
SELECT COUNT(*) AS filas_antes FROM productos;
BEGIN;
INSERT INTO productos (codigo, nombre, descripcion, precio, categoria_id)
VALUES ('LOM-0001', 'Duplicado por codigo', 'Intento de duplicar el codigo LOM-0001', 999.99, 1);
ROLLBACK;
SELECT COUNT(*) AS filas_despues FROM productos;
SELECT COUNT(*) AS filas_con_LOM_0001_deben_ser_1 FROM productos WHERE codigo = 'LOM-0001';

\echo ''
\echo '###### PRUEBA 3 - PRECIO NEGATIVO (debe RECHAZARSE, SQLSTATE 23514) ######'
SELECT COUNT(*) AS filas_antes FROM productos;
BEGIN;
INSERT INTO productos (codigo, nombre, descripcion, precio, categoria_id)
VALUES ('LOM-TEST2', 'Precio Negativo', 'Intento de insertar un precio menor que cero', -50.00, 1);
ROLLBACK;
SELECT COUNT(*) AS filas_despues FROM productos;
SELECT COUNT(*) AS filas_LOM_TEST2_deben_ser_0 FROM productos WHERE codigo = 'LOM-TEST2';

\echo ''
\echo '###### PRUEBA 4 - CATEGORIA INEXISTENTE (debe RECHAZARSE, SQLSTATE 23503) ######'
SELECT COUNT(*) AS filas_antes FROM productos;
BEGIN;
INSERT INTO productos (codigo, nombre, descripcion, precio, categoria_id)
VALUES ('LOM-TEST3', 'Categoria Inexistente', 'Intento de referenciar la categoria 999', 75.00, 999);
ROLLBACK;
SELECT COUNT(*) AS filas_despues FROM productos;
SELECT COUNT(*) AS filas_LOM_TEST3_deben_ser_0 FROM productos WHERE codigo = 'LOM-TEST3';

\echo ''
\echo '###### VEREDICTO: la base quedo INTACTA (huella igual a la de partida) ######'
SELECT COUNT(*) AS n, SUM(precio) AS suma_precios,
       MD5(string_agg(codigo || ':' || precio, ',' ORDER BY producto_id)) AS huella
  FROM productos;
SELECT codigo, COUNT(*) AS repeticiones FROM productos GROUP BY codigo HAVING COUNT(*) > 1;
