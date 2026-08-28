import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: Infinity,
      gcTime: 1000 * 60 * 60 * 24, // 24 hours cache retention
      retry: false,
      networkMode: "offlineFirst", // Use cache first, network second
    },
    mutations: {
      retry: false,
      networkMode: "online",
    },
  },
});

/**
 * A query key *is* the request URL, so once lists carry filters the key becomes
 * "/api/orders?status=pending&limit=25&offset=0" and the plain key
 * ["/api/orders"] no longer matches it. Invalidate by URL prefix instead —
 * one call covers every page, filter and sub-resource of a collection.
 */
export function invalidateApi(...prefixes: string[]): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const url = String(query.queryKey[0] ?? "");
      return prefixes.some((p) => url === p || url.startsWith(`${p}?`) || url.startsWith(`${p}/`));
    },
  });
}
