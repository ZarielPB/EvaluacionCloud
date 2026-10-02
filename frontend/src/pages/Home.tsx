import { ArrowRight, Boxes, Database, Image, PackagePlus, Search, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { BotonEnlace } from '../components/Boton';
import { Esqueleto } from '../components/Avisos';
import { consultarSalud, ErrorApi } from '../services/api';
import type { RespuestaSalud, ServicioSalud } from '../types';

const SERVICIOS: { clave: string; nombre: string; detalle: string; icono: typeof Database }[] = [
  { clave: 'rds', nombre: 'RDS', detalle: 'categorias y productos', icono: Database },
  { clave: 'dynamodb', nombre: 'DynamoDB', detalle: 'atributos variables', icono: Boxes },
  { clave: 's3', nombre: 'S3', detalle: 'originales y miniaturas', icono: Image },
  { clave: 'lambda', nombre: 'Lambda', detalle: 'miniaturas 300x300', icono: Zap },
];

function TarjetaServicio({
  nombre,
  detalle,
  icono: Icono,
  servicio,
  cargando,
}: {
  nombre: string;
  detalle: string;
  icono: typeof Database;
  servicio?: ServicioSalud;
  cargando: boolean;
}) {
  const activo = cargando ? null : (servicio?.ok ?? false);

  return (
    <div className="flex items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-4 shadow-tarjeta">
      <span className="rounded-control bg-primario-50 p-2.5 text-primario-700">
        <Icono className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-tinta">{nombre}</p>
        <p className="truncate text-xs text-tinta-suave">{detalle}</p>
      </div>
      <span className="ml-auto shrink-0">
        {cargando ? (
          <Esqueleto className="h-5 w-5 rounded-full" />
        ) : (
          <span
            className={`block h-3 w-3 rounded-full ${activo ? 'bg-exito' : 'bg-alerta'}`}
            title={activo ? 'Operativo' : 'Caido'}
          />
        )}
      </span>
    </div>
  );
}

const PASOS = [
  {
    titulo: '1. Registras el producto',
    texto:
      'Se guarda en RDS con estado PENDIENTE y sus atributos variables en DynamoDB. Todavia no aparece en el catalogo.',
  },
  {
    titulo: '2. Cargas la fotografia',
    texto:
      'La API la sube a S3 e invoca a Lambda de forma sincrona. La Lambda genera la miniatura de hasta 300x300 px.',
  },
  {
    titulo: '3. Se publica solo',
    texto:
      'El producto pasa a PUBLICADO unicamente cuando DynamoDB confirma la miniatura y S3 la tiene almacenada.',
  },
];

export function Home() {
  const [salud, setSalud] = useState<RespuestaSalud | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let vigente = true;
    consultarSalud()
      .then((datos) => {
        if (!vigente) return;
        setSalud(datos);
        setError(null);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(fallo);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, []);

  return (
    <div className="space-y-14">
      <section className="animate-fade-in grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <span className="etiqueta bg-pastel-lavanda text-primario-700">
            Catalogo unico de productos
          </span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight text-tinta sm:text-5xl">
            Cada producto, registrado <span className="text-primario-500">una sola vez</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-tinta-suave">
            Reemplazamos las hojas de calculo y las carpetas de imagenes dispersas por un catalogo
            comun: registras el producto con su fotografia, la plataforma la procesa y la muestra en
            el catalogo con su detalle completo.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <BotonEnlace to="/catalogo" variante="primario">
              <Search className="h-4 w-4" aria-hidden="true" />
              Ver catalogo
            </BotonEnlace>
            <BotonEnlace to="/registrar" variante="secundario">
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              Registrar producto
            </BotonEnlace>
          </div>
        </div>

        <div className="rounded-tarjeta border border-borde bg-superficie p-6 shadow-tarjeta">
          <h2 className="text-sm font-bold uppercase tracking-wide text-tinta-suave">
            Estado de los servicios
          </h2>
          <div className="mt-4 space-y-3">
            {SERVICIOS.map((servicio) => (
              <TarjetaServicio
                key={servicio.clave}
                nombre={servicio.nombre}
                detalle={servicio.detalle}
                icono={servicio.icono}
                servicio={salud?.servicios?.[servicio.clave]}
                cargando={cargando}
              />
            ))}
          </div>
          {error instanceof ErrorApi && (
            <p className="mt-4 rounded-control bg-alerta/10 px-3 py-2 text-xs text-tinta">
              {error.estado === 503
                ? 'La API responde con 503: al menos un servicio esta caido.'
                : 'No se pudo consultar el estado de los servicios.'}
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-extrabold text-tinta">Como funciona</h2>
        <p className="mt-2 max-w-2xl text-tinta-suave">
          Un producto incompleto nunca aparece en el catalogo: primero se registra y despues se
          publica, que es exactamente lo que se necesita para que la miniatura este verificada.
        </p>

        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {PASOS.map((paso) => (
            <li
              key={paso.titulo}
              className="rounded-tarjeta border border-borde bg-superficie p-6 shadow-tarjeta transition duration-200 hover:-translate-y-0.5 hover:shadow-tarjeta-hover"
            >
              <h3 className="font-bold text-tinta">{paso.titulo}</h3>
              <p className="mt-2 text-sm text-tinta-suave">{paso.texto}</p>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-sm text-tinta-suave">
          <Link
            to="/registrar"
            className="inline-flex items-center gap-1 font-bold text-primario-600 underline-offset-4 hover:underline"
          >
            Registra el primero y observa como se publica
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </p>
      </section>
    </div>
  );
}
