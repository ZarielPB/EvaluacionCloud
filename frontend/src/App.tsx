import { Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Catalogo } from './pages/Catalogo';
import { DetalleProducto } from './pages/DetalleProducto';
import { RegistrarProducto } from './pages/RegistrarProducto';
import { PaginaNoEncontrada } from './pages/PaginaNoEncontrada';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="catalogo" element={<Catalogo />} />
        <Route path="productos/:productoId" element={<DetalleProducto />} />
        <Route path="registrar" element={<RegistrarProducto />} />
        <Route path="*" element={<PaginaNoEncontrada />} />
      </Route>
    </Routes>
  );
}
