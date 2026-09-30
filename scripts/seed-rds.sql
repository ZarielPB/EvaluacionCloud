-- =====================================================================
-- LOMAX SA | Etapa 2 - Carga Inicial Idempotente
-- Archivo : scripts/seed-rds.sql
-- Autor   : jeysi702
-- Servicio: Amazon RDS - PostgreSQL 15
--
-- Idempotente: se puede ejecutar N veces sin duplicar registros ni
-- fallar. Requiere scripts/init-rds.sql ejecutado antes.
-- =====================================================================

INSERT INTO categorias (categoria_id, nombre, descripcion) VALUES
    (1, 'PERIFERICOS', 'Teclados, mouse y dispositivos'),
    (2, 'PANTALLAS',   'Monitores y proyectores'),
    (3, 'AUDIO',       'Audifonos y speakers')
ON CONFLICT DO NOTHING;

INSERT INTO productos (producto_id, codigo, nombre, descripcion, precio, categoria_id, estado) VALUES
    (1, 'LOM-0001', 'Teclado Kailh K2', 'Teclado mecanico 75%', 189.90, 1, 'PUBLICADO'),
    (2, 'LOM-0002', 'Mouse Logitech G502', 'Mouse gaming 25600 DPI', 89.50, 1, 'PUBLICADO'),
    (3, 'LOM-0003', 'Teclado Redragon K552', 'Teclado compacto TKL', 65.00, 1, 'PUBLICADO'),
    (4, 'LOM-0004', 'Mouse Anker vertical', 'Mouse ergonomico', 54.90, 1, 'PUBLICADO'),
    (5, 'LOM-0005', 'Teclado Logitech K380', 'Teclado Bluetooth', 39.90, 1, 'PUBLICADO'),
    (6, 'LOM-0006', 'Mouse Razer Basilisk', 'Mouse gaming 30000 DPI', 79.00, 1, 'PUBLICADO'),
    (7, 'LOM-0007', 'Teclado HyperX Alloy', 'Teclado RGB', 139.00, 1, 'PUBLICADO'),
    (8, 'LOM-0008', 'Monitor LG 24GP500', 'Monitor 24 pulgadas 75Hz', 199.00, 2, 'PUBLICADO'),
    (9, 'LOM-0009', 'Monitor Dell P2422H', 'Monitor IPS 24 pulgadas', 235.50, 2, 'PUBLICADO'),
    (10, 'LOM-0010', 'Monitor Samsung G5', 'Monitor curvo 27 pulgadas 165Hz', 549.00, 2, 'PUBLICADO'),
    (11, 'LOM-0011', 'Monitor ASUS TUF', 'Monitor 24 pulgadas 144Hz', 329.90, 2, 'PUBLICADO'),
    (12, 'LOM-0012', 'Proyector BenQ E520', 'Proyector 3000 lumenes', 799.00, 2, 'PUBLICADO'),
    (13, 'LOM-0013', 'Monitor Xiaomi 27', 'Monitor 4K 27 pulgadas', 289.00, 2, 'PUBLICADO'),
    (14, 'LOM-0014', 'Televisor TCL 50QLED', 'Smart TV 50 pulgadas', 649.00, 2, 'PUBLICADO'),
    (15, 'LOM-0015', 'Audifonos Sony WH-1000XM5', 'Audifonos con cancelacion de ruido', 349.00, 3, 'PUBLICADO'),
    (16, 'LOM-0016', 'Speaker JBL Charge 5', 'Speaker Bluetooth portatil', 159.90, 3, 'PUBLICADO'),
    (17, 'LOM-0017', 'Audifonos HyperX Cloud II', 'Audifonos gaming 7.1', 119.00, 3, 'PUBLICADO'),
    (18, 'LOM-0018', 'Microfono HyperX QuadCast', 'Microfono USB RGB', 129.90, 3, 'PUBLICADO'),
    (19, 'LOM-0019', 'Speaker Logitech Z407', 'Sistema de audio 2.1', 99.00, 3, 'PUBLICADO'),
    (20, 'LOM-0020', 'AirPods Pro 2', 'Audifonos in-ear Apple', 219.00, 3, 'PUBLICADO'),
    (21, 'LOM-9001', 'Producto Prueba 1', 'Registro incompleto', 49.90, 1, 'PENDIENTE'),
    (22, 'LOM-9002', 'Producto Prueba 2', 'Registro con precio cero', 0.00, 2, 'PENDIENTE')
ON CONFLICT DO NOTHING;

\echo '--- TOTALES ---'
SELECT (SELECT COUNT(*) FROM categorias) AS categorias, (SELECT COUNT(*) FROM productos) AS productos;

-- ---------------------------------------------------------------------
-- 5. Sincronizar las secuencias del IDENTITY con el maximo actual
--    Imprescindible porque el seed inserta IDs explicitos: sin esto,
--    un INSERT posterior sin ID choca contra la clave primaria.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_seq TEXT;
BEGIN
    v_seq := pg_get_serial_sequence('productos', 'producto_id');
    IF v_seq IS NOT NULL THEN
        PERFORM setval(v_seq, (SELECT COALESCE(MAX(producto_id), 1) FROM productos));
        RAISE NOTICE 'OK: secuencia % sincronizada con MAX(producto_id)', v_seq;
    END IF;

    v_seq := pg_get_serial_sequence('categorias', 'categoria_id');
    IF v_seq IS NOT NULL THEN
        PERFORM setval(v_seq, (SELECT COALESCE(MAX(categoria_id), 1) FROM categorias));
        RAISE NOTICE 'OK: secuencia % sincronizada con MAX(categoria_id)', v_seq;
    END IF;
END $$;
