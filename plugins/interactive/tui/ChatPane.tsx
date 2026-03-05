import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RoomMessage } from '../types.js';

interface ChatPaneProps {
  messages: RoomMessage[];
  height: number;
}

export function ChatPane({ messages, height }: ChatPaneProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [userScrolled, setUserScrolled] = useState(false);
  const prevMessageCount = useRef(messages.length);

  // Visible area: reserve 2 lines for the top/bottom border
  const visibleLines = Math.max(1, height - 2);

  // Auto-scroll to bottom when new messages arrive (unless user has scrolled up)
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      if (!userScrolled) {
        setScrollOffset(Math.max(0, messages.length - visibleLines));
      }
      prevMessageCount.current = messages.length;
    }
  }, [messages.length, visibleLines, userScrolled]);

  // Keyboard navigation
  useInput((_input, key) => {
    const maxOffset = Math.max(0, messages.length - visibleLines);

    if (key.upArrow) {
      setScrollOffset((prev) => {
        const next = Math.max(0, prev - 1);
        if (next < maxOffset) setUserScrolled(true);
        return next;
      });
    } else if (key.downArrow) {
      setScrollOffset((prev) => {
        const next = Math.min(maxOffset, prev + 1);
        if (next >= maxOffset) setUserScrolled(false);
        return next;
      });
    } else if (key.pageUp) {
      setScrollOffset((prev) => {
        const next = Math.max(0, prev - Math.floor(visibleLines / 2));
        if (next < maxOffset) setUserScrolled(true);
        return next;
      });
    } else if (key.pageDown) {
      setScrollOffset((prev) => {
        const next = Math.min(maxOffset, prev + Math.floor(visibleLines / 2));
        if (next >= maxOffset) setUserScrolled(false);
        return next;
      });
    }
  });

  // Slice visible window
  const visibleMessages = messages.slice(scrollOffset, scrollOffset + visibleLines);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      height={height}
      overflow="hidden"
    >
      {visibleMessages.map((msg) => (
        <MessageLine key={msg.id} message={msg} />
      ))}

      {/* Fill remaining space so the box keeps its height */}
      {visibleMessages.length < visibleLines && (
        <Box flexGrow={1} />
      )}

      {/* Scroll indicator */}
      {messages.length > visibleLines && (
        <Box justifyContent="flex-end">
          <Text dimColor>
            {userScrolled
              ? `-- scroll: ${scrollOffset + 1}-${Math.min(scrollOffset + visibleLines, messages.length)} of ${messages.length} --`
              : `-- ${messages.length} messages --`}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function MessageLine({ message }: { message: RoomMessage }) {
  switch (message.type) {
    case 'scene':
      return (
        <Text color="yellow" italic>
          [SCENE] {message.content}
        </Text>
      );

    case 'system':
      return (
        <Text dimColor>
          [System] {message.content}
        </Text>
      );

    case 'emote': {
      const content = message.content.startsWith('*')
        ? message.content
        : `*${message.content}*`;
      return (
        <Text color="green" italic>
          [{message.from}] {content}
        </Text>
      );
    }

    case 'message': {
      if (message.from === 'You') {
        return (
          <Text>
            <Text color="cyan" bold>[You]</Text>
            <Text color="cyan"> {message.content}</Text>
          </Text>
        );
      }
      return (
        <Text>
          <Text color="magenta" bold>[{message.from}]</Text>
          <Text> {message.content}</Text>
        </Text>
      );
    }

    default:
      return <Text>{message.content}</Text>;
  }
}
