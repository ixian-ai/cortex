/**
 * HTTP client that talks to the Cortex daemon.
 * Supports both Unix socket and TCP connections.
 */

export interface ClientConfig {
  socketPath?: string;
  baseUrl?: string;
}

export function createClient(config: ClientConfig) {
  const baseUrl = config.baseUrl ?? "http://localhost";

  async function request(
    path: string,
    options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
  ): Promise<unknown> {
    const url = new URL(path, baseUrl);
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value) url.searchParams.set(key, value);
      }
    }

    const fetchOptions: RequestInit & { unix?: string } = {
      method: options.method ?? "GET",
      headers: { "Content-Type": "application/json" },
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    if (config.socketPath) {
      fetchOptions.unix = config.socketPath;
    }

    const response = await fetch(url.toString(), fetchOptions);
    const data = await response.json();

    if (!response.ok) {
      const err = data as { error?: { message?: string } };
      throw new Error(err.error?.message ?? `HTTP ${response.status}`);
    }

    return data;
  }

  return {
    health: () => request("/health"),

    createRoom: (params: {
      title: string;
      body: string;
      agents: string[];
      domains: string[];
      mode?: string;
      maxTicks?: number;
      maxMessages?: number;
      maxDurationMs?: number;
      orchestratorModel?: string;
    }) => request("/rooms", { method: "POST", body: params }),

    listRooms: () => request("/rooms"),

    getRoom: (roomId: string) => request(`/rooms/${roomId}`),

    getMessages: (roomId: string) => request(`/rooms/${roomId}/messages`),

    getAgents: (roomId: string) => request(`/rooms/${roomId}/agents`),

    injectMessage: (roomId: string, content: string, from?: string) =>
      request(`/rooms/${roomId}/messages`, { method: "POST", body: { content, from } }),

    stopRoom: (roomId: string) => request(`/rooms/${roomId}/stop`, { method: "POST" }),

    destroyRoom: (roomId: string) => request(`/rooms/${roomId}`, { method: "DELETE" }),
  };
}
