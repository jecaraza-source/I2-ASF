export type Punto = { x: number; y: number };

type Nodo = { id: string; x: number; y: number; dx: number; dy: number };

/**
 * Disposición por fuerzas (Fruchterman-Reingold) determinista: mismo grafo, mismo dibujo. Sirve para
 * dibujar la red en el PDF sin navegador. Devuelve coordenadas normalizadas a [0, 1].
 */
export function disponer(
  ids: string[],
  aristas: [string, string][],
  iteraciones = 250,
): Map<string, Punto> {
  const n = ids.length;
  const pos = new Map<string, Punto>();
  if (n === 0) return pos;
  // Inicio en espiral con el ángulo áureo (determinista) para no partir de un círculo perfecto.
  const nodos: Nodo[] = ids.map((id, i) => {
    const a = i * 2.399963;
    const r = Math.sqrt((i + 0.5) / n);
    return { id, x: 0.5 + 0.5 * r * Math.cos(a), y: 0.5 + 0.5 * r * Math.sin(a), dx: 0, dy: 0 };
  });
  if (n === 1) {
    pos.set(ids[0] ?? "", { x: 0.5, y: 0.5 });
    return pos;
  }
  const porId = new Map(nodos.map((x) => [x.id, x]));
  const pares: [Nodo, Nodo][] = [];
  for (const [a, b] of aristas) {
    const na = porId.get(a);
    const nb = porId.get(b);
    if (na && nb && na !== nb) pares.push([na, nb]);
  }
  const k = Math.sqrt(1 / n);
  let temperatura = 0.1;
  for (let it = 0; it < iteraciones; it++) {
    for (const p of nodos) {
      p.dx = 0;
      p.dy = 0;
    }
    nodos.forEach((p, i) => {
      for (let j = i + 1; j < n; j++) {
        const q = nodos[j];
        if (!q) continue;
        let ddx = p.x - q.x;
        let ddy = p.y - q.y;
        let d2 = ddx * ddx + ddy * ddy;
        if (d2 < 1e-9) {
          ddx = 1e-3 * ((i % 7) - 3);
          ddy = 1e-3 * ((j % 5) - 2);
          d2 = ddx * ddx + ddy * ddy + 1e-9;
        }
        const f = (k * k) / d2;
        p.dx += ddx * f;
        p.dy += ddy * f;
        q.dx -= ddx * f;
        q.dy -= ddy * f;
      }
    });
    for (const [a, b] of pares) {
      const ddx = a.x - b.x;
      const ddy = a.y - b.y;
      const f = (Math.sqrt(ddx * ddx + ddy * ddy) || 1e-6) / k;
      a.dx -= ddx * f;
      a.dy -= ddy * f;
      b.dx += ddx * f;
      b.dy += ddy * f;
    }
    for (const p of nodos) {
      // Gravedad suave al centro para que los componentes sueltos no se alejen.
      p.dx += (0.5 - p.x) * 0.05 * n * k;
      p.dy += (0.5 - p.y) * 0.05 * n * k;
      const d = Math.sqrt(p.dx * p.dx + p.dy * p.dy) || 1e-9;
      const paso = Math.min(d, temperatura);
      p.x += (p.dx / d) * paso;
      p.y += (p.dy / d) * paso;
    }
    temperatura *= 0.98;
  }
  const xs = nodos.map((p) => p.x);
  const ys = nodos.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const ancho = Math.max(...xs) - minX || 1;
  const alto = Math.max(...ys) - minY || 1;
  for (const p of nodos) pos.set(p.id, { x: (p.x - minX) / ancho, y: (p.y - minY) / alto });
  return pos;
}
