export interface Transform {
  x: number;
  y: number;
  scale: { x: number; y: number };
  rotation: number;
}
export function transformPoint(x: number, y: number, t: Transform) {
  const c = Math.cos(t.rotation),
    s = Math.sin(t.rotation);
  return {
    x: t.x + x * t.scale.x * c - y * t.scale.y * s,
    y: t.y + x * t.scale.x * s + y * t.scale.y * c,
  };
}
export function transformVertices(vertices: ArrayLike<number>, t: Transform) {
  const result: number[] = [];
  for (let i = 0; i < vertices.length; i += 2) {
    const p = transformPoint(vertices[i], vertices[i + 1], t);
    result.push(p.x, p.y);
  }
  return result;
}
