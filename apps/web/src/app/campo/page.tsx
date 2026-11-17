import { AppCampo } from "@/components/campo/app-campo";

/**
 * La página es un cascarón sin datos: el service worker puede guardarla para abrirla sin señal.
 * Las visitas llegan por /api/campo/visitas y se guardan en el teléfono; la sesión la exige el proxy
 * y cada ruta de la API la vuelve a validar.
 */
export default function Campo() {
  return <AppCampo />;
}
