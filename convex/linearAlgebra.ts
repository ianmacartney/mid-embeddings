export function calculateMidpoint(a: number[], b: number[]) {
  return normalize(a.map((n, i) => n + b[i]));
}

export function normalize(vector: number[]) {
  const magnitude = vectorLength(vector);
  return vector.map((n) => n / magnitude);
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
