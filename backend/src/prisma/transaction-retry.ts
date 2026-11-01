/** Repete somente transações que o Prisma confirmou como abortadas por conflito. */
export async function retryTransaction<T>(transaction: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await transaction();
    } catch (error) {
      // Não repetir timeouts/conexão perdida: o resultado do commit pode ser incerto.
      if ((error as { code?: string })?.code !== 'P2034' || attempt >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt + Math.floor(Math.random() * 50)));
    }
  }
}
