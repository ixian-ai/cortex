import type { ComposedScene, ComposeInput } from "../types.js";

/**
 * SceneComposer interface — the contract between Cortex and whatever
 * composes scenes (MVP: BuiltinComposer; future: University).
 */
export interface SceneComposer {
  compose(input: ComposeInput): Promise<ComposedScene>;
  readonly name: string;
}
