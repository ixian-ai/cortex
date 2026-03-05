import React from 'react';
import { Box, Text } from 'ink';
import type { Character } from '../types.js';
import type { FSMState } from '../types.js';

interface StatusSidebarProps {
  characters: Character[];
  tickCount: number;
  tickRate: number;
}

/**
 * Render a progress bar using block characters.
 * Uses filled (U+2588) and empty (U+2591) blocks.
 */
function renderBar(value: number, max: number, width: number): string {
  const clamped = Math.max(0, Math.min(value, max));
  const filled = Math.round((clamped / max) * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

/** Map FSM states to display colors */
function fsmColor(state: FSMState): string {
  switch (state) {
    case 'IDLE':        return 'gray';
    case 'LISTENING':   return 'yellow';
    case 'RESPONDING':  return 'green';
    case 'EMOTING':     return 'cyan';
    case 'COOLDOWN':    return 'red';
    default:            return 'white';
  }
}

/** Deterministic color for character names based on index */
const NAME_COLORS = ['blue', 'magenta', 'cyan', 'green', 'yellow', 'red'] as const;

export function StatusSidebar({ characters, tickCount, tickRate }: StatusSidebarProps) {
  const barWidth = 10;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <Box marginBottom={1} justifyContent="center">
        <Text bold underline>Characters</Text>
      </Box>

      {characters.map((char, index) => {
        const { config, state } = char;
        const nameColor = NAME_COLORS[index % NAME_COLORS.length];

        return (
          <Box key={config.name} flexDirection="column" marginBottom={1}>
            {/* Character name */}
            <Text bold color={nameColor}>
              {config.name}
            </Text>

            {/* Energy bar */}
            <Text>
              <Text dimColor>{'Energy '}</Text>
              <Text color="green">{renderBar(state.energy, config.energy.max, barWidth)}</Text>
              <Text> {Math.round(state.energy)}</Text>
            </Text>

            {/* Boredom bar */}
            <Text>
              <Text dimColor>{'Bored  '}</Text>
              <Text color="yellow">{renderBar(state.boredom, config.boredom.threshold, barWidth)}</Text>
              <Text> {Math.round(state.boredom)}</Text>
            </Text>

            {/* FSM state */}
            <Text>
              <Text dimColor>{'State  '}</Text>
              <Text color={fsmColor(state.fsm)} bold={state.fsm === 'RESPONDING'}>
                {state.fsm}
              </Text>
            </Text>

            {/* Separator between characters */}
            {index < characters.length - 1 && (
              <Text dimColor>{'---'}</Text>
            )}
          </Box>
        );
      })}

      {/* Tick info at the bottom */}
      <Box flexGrow={1} />
      <Box>
        <Text dimColor>
          Tick: {tickCount}  Rate: {(tickRate / 1000).toFixed(0)}s
        </Text>
      </Box>
    </Box>
  );
}
