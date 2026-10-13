/** Entrada por terminal: preguntas y secretos sin eco (la frase semilla no queda en el historial). */
import { createInterface } from 'node:readline';
import { createInterface as createPromises } from 'node:readline/promises';

export async function preguntar(texto: string): Promise<string> {
  const rl = createPromises({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(texto)).trim(); } finally { rl.close(); }
}

export async function secreto(texto: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Se necesita una terminal interactiva (Terminal.app) para pedir la frase semilla.');
  const output = process.stdout;
  return new Promise(res => {
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    let mudo = false;
    const write = output.write.bind(output);
    output.write = ((chunk: unknown, ...rest: unknown[]) => (mudo ? true : (write as (...a: unknown[]) => boolean)(chunk, ...rest))) as typeof output.write;
    rl.question(texto, r => {
      output.write = write;
      output.write('\n');
      rl.close();
      res(r);
    });
    mudo = true;
  });
}
