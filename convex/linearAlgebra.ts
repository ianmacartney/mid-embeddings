export function getMidpoint(a: number[], b: number[]) {
  const mix = a.map((n, i) => (n + b[i]) / 2);
  const magnitude = vectorLength(mix);
  const vector = mix.map((n) => n / magnitude);
  return vector;
}

// return the magnitude of a vector
export function vectorLength(vector: number[]) {
  return Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0));
}

export function dotProduct(a: number[], b: number[]) {
  return a.reduce((sum, n, i) => sum + n * b[i], 0);
}

// return the vector from a to b
export function deltaVector(a: number[], b: number[]) {
  return a.map((n, i) => b[i] - n);
}
