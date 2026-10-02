import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// En desarrollo el frontend habla con la API por la misma ruta que usa el
// proxy Nginx en produccion (/api). Aqui el destino por defecto es la API
// directa (puerto 3000) para no depender de que Nginx ya este levantado;
// VITE_PROXY_TARGET permite apuntar a http://localhost:8080 si se prefiere.
export default defineConfig(({ mode }) => {
  const entorno = loadEnv(mode, process.cwd(), 'VITE_');
  const destino = entorno.VITE_PROXY_TARGET ?? 'http://localhost:3000';

  // Puerto propio y estable. El 5173 es el que usa por defecto Vite y lo
  // ocupan otros proyectos de la maquina; ademas, si dos aplicaciones
  // comparten origen (mismo host:puerto), el service worker PWA de una
  // intercepta la navegacion de la otra y se ven paginas que no son.
  const puerto = Number(entorno.VITE_PUERTO ?? 5180);

  // Nginx hace proxy_pass http://api:3000/ con la barra final, que descarta
  // el prefijo /api. Vite tiene que replicar ese comportamiento.
  const proxy = {
    '/api': {
      target: destino,
      changeOrigin: true,
      rewrite: (ruta: string) => ruta.replace(/^\/api/, ''),
    },
  };

  return {
    plugins: [react()],
    server: {
      host: true,
      port: puerto,
      // strictPort evita que Vite salte a otro puerto en silencio: si el
      // nuestro esta ocupado conviene enterarse, no arrancar en un origen
      // distinto al esperado.
      strictPort: true,
      proxy,
    },
    preview: {
      host: true,
      port: puerto,
      proxy,
    },
  };
});
