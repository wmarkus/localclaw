export type ConfiguredEntry = {
  key: string;
  ref: { provider: string; model: string };
  tags: Set<string>;
  aliases: string[];
};

export type ModelRow = {
  key: string;
  name: string;
  input: string;
  contextWindow: number | null;
  local: boolean | null;
  tags: string[];
  missing: boolean;
};
