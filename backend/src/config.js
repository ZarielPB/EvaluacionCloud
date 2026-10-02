const entero = (valor, porDefecto) => {
  const n = Number.parseInt(valor ?? '', 10);
  return Number.isFinite(n) ? n : porDefecto;
};

export const config = {
  puerto: entero(process.env.PORT, 3000),
  // Solo loopback por defecto: la API es interna y la consume el proxy.
  // Para exponerla en otra interfaz (por ejemplo en EKS) se define HOST=0.0.0.0.
  host: process.env.HOST || '127.0.0.1',

  rds: {
    host: process.env.PGHOST || 'localhost',
    puerto: entero(process.env.PGPORT, 7001),
    base: process.env.PGDATABASE || 'lomax',
    usuario: process.env.PGUSER || 'postgres',
    clave: process.env.PGPASSWORD || 'lomax123',
    max: entero(process.env.PGPOOL_MAX, 10),
  },

  aws: {
    endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
    region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
  },

  s3: {
    originales: process.env.LOMAX_BUCKET_ORIGENALES || 'lomax-originales',
    miniaturas: process.env.LOMAX_BUCKET_MINIATURAS || 'lomax-miniaturas',
    prefijoOriginales: 'originales/',
    prefijoMiniaturas: 'miniaturas/',
    maxBytes: entero(process.env.LOMAX_MAX_BYTES, 5 * 1024 * 1024),
  },

  dynamodb: {
    tabla: process.env.LOMAX_TABLA_ATRIBUTOS || 'productos_atributos',
  },

  lambda: {
    funcion: process.env.LOMAX_FUNCION_MINIATURA || 'lomax-miniatura',
    timeoutMs: entero(process.env.LOMAX_LAMBDA_TIMEOUT_MS, 35000),
  },

  log: {
    nivel: process.env.LOG_LEVEL || 'info',
  },
};
