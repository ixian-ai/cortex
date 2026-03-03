import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { Room } from '../core/room.js';
import type { RoomMessage, Character } from '../types.js';
import { ChatPane } from './ChatPane.js';
import { StatusSidebar } from './StatusSidebar.js';
import { InputBar } from './InputBar.js';

interface AppProps {
  room: Room;
}

export function App({ room }: AppProps) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [tickCount, setTickCount] = useState(0);

  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 40;
  const terminalWidth = stdout?.columns ?? 120;

  // Reserve 3 lines for the InputBar, calculate remaining for ChatPane
  const chatHeight = Math.max(5, terminalHeight - 3);

  // Subscribe to room events on mount
  useEffect(() => {
    const handleMessage = (msg: RoomMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    const handleStateChange = (name: string, state: import('../types.js').CharacterState) => {
      setCharacters((prev) => {
        const updated = prev.map((c) =>
          c.config.name === name ? { ...c, state: { ...state } } : c
        );
        // If the character isn't tracked yet, we can't add it without the config.
        // Characters should be seeded on room start.
        return updated;
      });
    };

    const handleTick = (event: import('../types.js').EngineEvent) => {
      if (event.type === 'tick') {
        setTickCount(event.tickNumber);
      }
    };

    // Subscribe
    room.on('roomMessage', handleMessage);
    room.on('stateChange', handleStateChange);
    room.on('event', handleTick);

    // Seed initial character state from the room
    const charMap = room.getCharacters();
    if (charMap.size > 0) {
      setCharacters(Array.from(charMap.values()));
    }

    // Start the room
    room.start();

    return () => {
      room.off('roomMessage', handleMessage);
      room.off('stateChange', handleStateChange);
      room.off('event', handleTick);
      room.stop();
    };
  }, [room]);

  const handleSubmit = (text: string) => {
    room.handlePlayerMessage(text);
  };

  // Derive tick rate from room config (fallback 5s)
  const tickRate = room.config?.tickRate ?? 5000;

  return (
    <Box flexDirection="row" width={terminalWidth} height={terminalHeight}>
      {/* Left column: chat + input */}
      <Box flexDirection="column" width="75%">
        <ChatPane messages={messages} height={chatHeight} />
        <InputBar onSubmit={handleSubmit} />
      </Box>

      {/* Right column: status sidebar */}
      <Box width="25%">
        <StatusSidebar
          characters={characters}
          tickCount={tickCount}
          tickRate={tickRate}
        />
      </Box>
    </Box>
  );
}
