import { describe, expect, it } from "vitest";
import { SearchableSelectList, type SearchableSelectListTheme } from "./searchable-select-list.js";

const mockTheme: SearchableSelectListTheme = {
  selectedPrefix: (t) => `[${t}]`,
  selectedText: (t) => `**${t}**`,
  description: (t) => `(${t})`,
  scrollInfo: (t) => `~${t}~`,
  noMatch: (t) => `!${t}!`,
  searchPrompt: (t) => `>${t}<`,
  searchInput: (t) => `|${t}|`,
  matchHighlight: (t) => `*${t}*`,
};

const testItems = [
  {
    value: "ollama/gpt-oss-120b",
    label: "ollama/gpt-oss-120b",
    description: "GPT OSS 120B",
  },
  {
    value: "ollama/gpt-oss-20b",
    label: "ollama/gpt-oss-20b",
    description: "GPT OSS 20B",
  },
  { value: "ollama/gpt-oss-7b", label: "ollama/gpt-oss-7b", description: "GPT OSS 7B" },
  { value: "ollama/oss-pro", label: "ollama/oss-pro", description: "OSS Pro" },
  { value: "ollama/oss-lite", label: "ollama/oss-lite", description: "OSS Lite" },
];

describe("SearchableSelectList", () => {
  it("renders all items when no filter is applied", () => {
    const list = new SearchableSelectList(testItems, 5, mockTheme);
    const output = list.render(80);

    // Should have search prompt line, spacer, and items
    expect(output.length).toBeGreaterThanOrEqual(3);
    expect(output[0]).toContain("search");
  });

  it("filters items when typing", () => {
    const list = new SearchableSelectList(testItems, 5, mockTheme);

    // Simulate typing "pro" - unique enough to narrow down
    list.handleInput("p");
    list.handleInput("r");
    list.handleInput("o");

    const selected = list.getSelectedItem();
    expect(selected?.value).toBe("ollama/oss-pro");
  });

  it("prioritizes exact substring matches over fuzzy matches", () => {
    // Add items where one has early exact match, others are fuzzy or late matches
    const items = [
      { value: "ollama/auto", label: "ollama/auto", description: "Routes to best" },
      { value: "opus-direct", label: "opus-direct", description: "Direct opus model" },
      {
        value: "ollama/gpt-oss-opus",
        label: "ollama/gpt-oss-opus",
        description: "OSS Opus",
      },
    ];
    const list = new SearchableSelectList(items, 5, mockTheme);

    // Type "opus" - should match "opus-direct" first (earliest exact substring)
    for (const ch of "opus") {
      list.handleInput(ch);
    }

    // First result should be "opus-direct" where "opus" appears at position 0
    const selected = list.getSelectedItem();
    expect(selected?.value).toBe("opus-direct");
  });

  it("keeps exact label matches ahead of description matches", () => {
    const longPrefix = "x".repeat(250);
    const items = [
      { value: "late-label", label: `${longPrefix}opus`, description: "late exact match" },
      { value: "desc-first", label: "provider/other", description: "opus in description" },
    ];
    const list = new SearchableSelectList(items, 5, mockTheme);

    for (const ch of "opus") {
      list.handleInput(ch);
    }

    const selected = list.getSelectedItem();
    expect(selected?.value).toBe("late-label");
  });

  it("exact label match beats description match", () => {
    const items = [
      {
        value: "provider/other",
        label: "provider/other",
        description: "This mentions opus in description",
      },
      { value: "provider/opus-model", label: "provider/opus-model", description: "Something else" },
    ];
    const list = new SearchableSelectList(items, 5, mockTheme);

    for (const ch of "opus") {
      list.handleInput(ch);
    }

    // Label match should win over description match
    const selected = list.getSelectedItem();
    expect(selected?.value).toBe("provider/opus-model");
  });

  it("orders description matches by earliest index", () => {
    const items = [
      { value: "first", label: "first", description: "prefix opus value" },
      { value: "second", label: "second", description: "opus suffix value" },
    ];
    const list = new SearchableSelectList(items, 5, mockTheme);

    for (const ch of "opus") {
      list.handleInput(ch);
    }

    const selected = list.getSelectedItem();
    expect(selected?.value).toBe("second");
  });

  it("filters items with fuzzy matching", () => {
    const list = new SearchableSelectList(testItems, 5, mockTheme);

    // Simulate typing "gpt" which should match gpt-oss models
    list.handleInput("g");
    list.handleInput("p");
    list.handleInput("t");

    const selected = list.getSelectedItem();
    expect(selected?.value).toContain("gpt");
  });

  it("preserves fuzzy ranking when only fuzzy matches exist", () => {
    const items = [
      { value: "xg---4", label: "xg---4", description: "Worse fuzzy match" },
      { value: "gpt-oss-4", label: "gpt-oss-4", description: "Better fuzzy match" },
    ];
    const list = new SearchableSelectList(items, 5, mockTheme);

    for (const ch of "g4") {
      list.handleInput(ch);
    }

    const selected = list.getSelectedItem();
    expect(selected?.value).toBe("gpt-oss-4");
  });

  it("highlights matches in rendered output", () => {
    const list = new SearchableSelectList(testItems, 5, mockTheme);

    for (const ch of "gpt") {
      list.handleInput(ch);
    }

    const output = list.render(80).join("\n");
    expect(output).toContain("*gpt*");
  });

  it("shows no match message when filter yields no results", () => {
    const list = new SearchableSelectList(testItems, 5, mockTheme);

    // Type something that won't match
    list.handleInput("x");
    list.handleInput("y");
    list.handleInput("z");

    const output = list.render(80);
    expect(output.some((line) => line.includes("No matches"))).toBe(true);
  });

  it("navigates with arrow keys", () => {
    const list = new SearchableSelectList(testItems, 5, mockTheme);

    // Initially first item is selected
    expect(list.getSelectedItem()?.value).toBe("ollama/gpt-oss-120b");

    // Press down arrow (escape sequence for down arrow)
    list.handleInput("\x1b[B");

    expect(list.getSelectedItem()?.value).toBe("ollama/gpt-oss-20b");
  });

  it("calls onSelect when enter is pressed", () => {
    const list = new SearchableSelectList(testItems, 5, mockTheme);
    let selectedValue: string | undefined;

    list.onSelect = (item) => {
      selectedValue = item.value;
    };

    // Press enter
    list.handleInput("\r");

    expect(selectedValue).toBe("ollama/gpt-oss-120b");
  });

  it("calls onCancel when escape is pressed", () => {
    const list = new SearchableSelectList(testItems, 5, mockTheme);
    let cancelled = false;

    list.onCancel = () => {
      cancelled = true;
    };

    // Press escape
    list.handleInput("\x1b");

    expect(cancelled).toBe(true);
  });
});
