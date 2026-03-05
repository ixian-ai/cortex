#!/usr/bin/env bun

import { defaultSocketPath } from "../daemon/config.js";
import { createClient } from "./client.js";

const port = process.env.CORTEX_PORT;
const client = createClient(
  port ? { baseUrl: `http://localhost:${port}` } : { socketPath: defaultSocketPath() },
);

const [command, ...args] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "health": {
      const result = await client.health();
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case "run": {
      const agents: string[] = [];
      const domains: string[] = [];
      let title = "";
      let body = "";
      let mode: string | undefined;
      let follow = false;

      for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
          case "--agent":
            agents.push(args[++i]);
            break;
          case "--domain":
            domains.push(args[++i]);
            break;
          case "--title":
            title = args[++i];
            break;
          case "--body":
            body = args[++i];
            break;
          case "--mode":
            mode = args[++i];
            break;
          case "--follow":
            follow = true;
            break;
          default:
            console.error(`Unknown flag: ${args[i]}`);
            process.exit(1);
        }
      }

      if (!title || agents.length === 0) {
        console.error("Usage: cortex run --title <title> --body <body> --agent @role [--follow]");
        process.exit(1);
      }

      const room = await client.createRoom({ title, body, agents, domains, mode });
      const roomData = room as { roomId: string; status: string };
      console.log(`Room created: ${roomData.roomId} (${roomData.status})`);

      if (follow) {
        await followRoom(roomData.roomId);
      }
      break;
    }

    case "rooms": {
      const rooms = (await client.listRooms()) as Array<{
        roomId: string;
        name: string;
        status: string;
        agentCount: number;
        messageCount: number;
      }>;
      if (rooms.length === 0) {
        console.log("No rooms.");
        break;
      }
      for (const room of rooms) {
        console.log(
          `${room.roomId}  ${room.status.padEnd(10)}  ${room.name}  (${room.agentCount} agents, ${room.messageCount} msgs)`,
        );
      }
      break;
    }

    case "show": {
      const roomId = args[0];
      if (!roomId) {
        console.error("Usage: cortex show <room-id>");
        process.exit(1);
      }
      const detail = await client.getRoom(roomId);
      console.log(JSON.stringify(detail, null, 2));
      break;
    }

    case "messages": {
      const roomId = args[0];
      if (!roomId) {
        console.error("Usage: cortex messages <room-id> [--follow]");
        process.exit(1);
      }

      if (args.includes("--follow")) {
        await followRoom(roomId);
      } else {
        const messages = (await client.getMessages(roomId)) as Array<{
          from: string;
          type: string;
          content: string;
        }>;
        for (const msg of messages) {
          printMessage(msg);
        }
      }
      break;
    }

    case "agents": {
      const roomId = args[0];
      if (!roomId) {
        console.error("Usage: cortex agents <room-id>");
        process.exit(1);
      }
      const agents = (await client.getAgents(roomId)) as Array<{
        name: string;
        fsm: string;
        energy: number;
        initiative: number;
      }>;
      for (const agent of agents) {
        console.log(
          `${agent.name.padEnd(20)}  ${agent.fsm.padEnd(15)}  energy=${agent.energy}  initiative=${agent.initiative.toFixed(1)}`,
        );
      }
      break;
    }

    case "inject": {
      const roomId = args[0];
      const content = args.slice(1).join(" ");
      if (!roomId || !content) {
        console.error('Usage: cortex inject <room-id> "message"');
        process.exit(1);
      }
      await client.injectMessage(roomId, content);
      console.log("Message injected.");
      break;
    }

    case "stop": {
      const roomId = args[0];
      if (!roomId) {
        console.error("Usage: cortex stop <room-id>");
        process.exit(1);
      }
      await client.stopRoom(roomId);
      console.log(`Room ${roomId} stopped.`);
      break;
    }

    default:
      console.log(`cortex — agent coordination engine

Commands:
  run       Create and start a room
  rooms     List all rooms
  show      Show room detail
  messages  Show room messages
  agents    Show agent states
  inject    Inject a message into a room
  stop      Stop a room
  health    Check daemon health

Usage:
  cortex run --title "Review" --body "..." --agent @devops --agent @qa [--follow]
  cortex rooms
  cortex show <room-id>
  cortex messages <room-id> [--follow]
  cortex agents <room-id>
  cortex inject <room-id> "message"
  cortex stop <room-id>
  cortex health`);
      break;
  }
}

function printMessage(msg: { from: string; type: string; content: string }) {
  if (msg.type === "status_signal") {
    console.log(`  * ${msg.from} ${msg.content}`);
  } else if (msg.type === "scene" || msg.type === "system") {
    console.log(`  [${msg.type}] ${msg.content}`);
  } else {
    console.log(`  [${msg.from}] ${msg.content}`);
  }
}

async function followRoom(roomId: string) {
  let lastSeen = 0;
  console.log("Following room... (Ctrl-C to stop)\n");

  while (true) {
    try {
      const detail = (await client.getRoom(roomId)) as {
        status: string;
        messages: Array<{ from: string; type: string; content: string }>;
      };

      const newMessages = detail.messages.slice(lastSeen);
      for (const msg of newMessages) {
        printMessage(msg);
      }
      lastSeen = detail.messages.length;

      if (
        detail.status === "completed" ||
        detail.status === "stopped" ||
        detail.status === "failed"
      ) {
        console.log(`\nRoom ${detail.status}.`);
        break;
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
