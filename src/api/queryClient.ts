export type QueryState<T> = {
  data?: T;
  error?: Error;
  loading: boolean;
};

export async function runQuery<T>(query: () => Promise<T>): Promise<QueryState<T>> {
  try {
    const data = await query();
    return { data, loading: false };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error("Unknown query error"),
      loading: false
    };
  }
}
