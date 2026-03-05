import type { RoomManager } from "../room-manager.js";
import type { ComposeInput } from "../types.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: { code: status, message } }, status);
}

export function createServer(manager: RoomManager): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // GET /health
      if (method === "GET" && path === "/health") {
        return json({ status: "healthy", service: "cortex", rooms: manager.listRooms().length });
      }

      // POST /rooms — create + start room
      if (method === "POST" && path === "/rooms") {
        const body = (await req.json()) as ComposeInput;
        if (!body.title || !body.agents?.length) {
          return error("title and agents[] are required");
        }
        const roomId = await manager.createRoom(body);
        manager.startRoom(roomId);
        const detail = manager.getRoomDetail(roomId);
        return json(detail, 201);
      }

      // GET /rooms — list rooms
      if (method === "GET" && path === "/rooms") {
        return json(manager.listRooms());
      }

      // Room-specific routes: /rooms/:id
      const roomMatch = path.match(/^\/rooms\/([^/]+)$/);
      if (roomMatch) {
        const roomId = roomMatch[1];

        // GET /rooms/:id
        if (method === "GET") {
          return json(manager.getRoomDetail(roomId));
        }

        // DELETE /rooms/:id
        if (method === "DELETE") {
          manager.destroyRoom(roomId);
          return json({ deleted: true });
        }
      }

      // POST /rooms/:id/messages
      const messageMatch = path.match(/^\/rooms\/([^/]+)\/messages$/);
      if (messageMatch) {
        const roomId = messageMatch[1];

        if (method === "POST") {
          const body = (await req.json()) as { content: string; from?: string };
          if (!body.content) {
            return error("content is required");
          }
          manager.injectMessage(roomId, body.content, body.from);
          return json({ injected: true });
        }

        if (method === "GET") {
          return json(manager.getMessages(roomId));
        }
      }

      // POST /rooms/:id/stop
      const stopMatch = path.match(/^\/rooms\/([^/]+)\/stop$/);
      if (stopMatch && method === "POST") {
        const roomId = stopMatch[1];
        manager.stopRoom(roomId);
        return json({ stopped: true });
      }

      // GET /rooms/:id/agents
      const agentsMatch = path.match(/^\/rooms\/([^/]+)\/agents$/);
      if (agentsMatch && method === "GET") {
        const roomId = agentsMatch[1];
        const detail = manager.getRoomDetail(roomId);
        return json(detail.agents);
      }

      return error("Not found", 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("Room not found")) {
        return error(message, 404);
      }

      console.error("[cortex] Request error:", err);
      return error(message, 500);
    }
  };
}
