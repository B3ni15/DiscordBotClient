import {
  ApplicationCommandOptionType,
  type APIApplicationCommandBasicOption,
  type APIApplicationCommandOption,
  type APIApplicationCommandOptionChoice,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";

/** Discord's rule for chat-input command and option names. */
export const COMMAND_NAME_PATTERN = /^[-_\p{L}\p{N}]+$/u;

export const NAME_MAX = 32;
export const DESCRIPTION_MAX = 100;
export const OPTIONS_MAX = 25;
export const CHOICES_MAX = 25;

/** Option types this editor can express; sub-commands are deliberately left out. */
export const EDITABLE_OPTION_TYPES = [
  ApplicationCommandOptionType.String,
  ApplicationCommandOptionType.Integer,
  ApplicationCommandOptionType.Number,
  ApplicationCommandOptionType.Boolean,
  ApplicationCommandOptionType.User,
  ApplicationCommandOptionType.Channel,
  ApplicationCommandOptionType.Role,
  ApplicationCommandOptionType.Mentionable,
  ApplicationCommandOptionType.Attachment,
] as const;

export type EditableOptionType = (typeof EDITABLE_OPTION_TYPES)[number];

export const OPTION_TYPE_LABELS: Record<number, string> = {
  [ApplicationCommandOptionType.Subcommand]: "Sub-command",
  [ApplicationCommandOptionType.SubcommandGroup]: "Sub-command group",
  [ApplicationCommandOptionType.String]: "Text",
  [ApplicationCommandOptionType.Integer]: "Integer",
  [ApplicationCommandOptionType.Boolean]: "Boolean",
  [ApplicationCommandOptionType.User]: "User",
  [ApplicationCommandOptionType.Channel]: "Channel",
  [ApplicationCommandOptionType.Role]: "Role",
  [ApplicationCommandOptionType.Mentionable]: "Mentionable",
  [ApplicationCommandOptionType.Number]: "Number",
  [ApplicationCommandOptionType.Attachment]: "Attachment",
};

/** Only these option types accept a fixed list of choices. */
export function supportsChoices(type: number): boolean {
  return (
    type === ApplicationCommandOptionType.String ||
    type === ApplicationCommandOptionType.Integer ||
    type === ApplicationCommandOptionType.Number
  );
}

export interface DraftChoice {
  name: string;
  value: string;
}

export interface DraftOption {
  /** Stable key for React lists; never sent to Discord. */
  key: string;
  type: EditableOptionType;
  name: string;
  description: string;
  required: boolean;
  choices: DraftChoice[];
}

export interface CommandDraft {
  name: string;
  description: string;
  options: DraftOption[];
}

export function validateCommandName(name: string): string | null {
  const value = name.trim();
  if (!value) return "Name is required.";
  if (value.length > NAME_MAX) return `Name must be at most ${NAME_MAX} characters.`;
  if (value !== value.toLowerCase()) return "Name must be lowercase.";
  if (!COMMAND_NAME_PATTERN.test(value)) {
    return "Name may only contain letters, digits, - and _ (no spaces).";
  }
  return null;
}

export function validateDescription(description: string): string | null {
  const value = description.trim();
  if (!value) return "Description is required.";
  if (value.length > DESCRIPTION_MAX) {
    return `Description must be at most ${DESCRIPTION_MAX} characters.`;
  }
  return null;
}

export function validateOption(option: DraftOption): string | null {
  const nameError = validateCommandName(option.name);
  if (nameError) return nameError;
  const descriptionError = validateDescription(option.description);
  if (descriptionError) return descriptionError;
  if (option.choices.length > CHOICES_MAX) return `At most ${CHOICES_MAX} choices are allowed.`;
  for (const choice of option.choices) {
    if (!choice.name.trim()) return "Every choice needs a label.";
    if (!choice.value.trim()) return "Every choice needs a value.";
    if (choice.name.length > NAME_MAX * 3) return "Choice label is too long.";
    if (
      option.type !== ApplicationCommandOptionType.String &&
      Number.isNaN(Number(choice.value))
    ) {
      return "Numeric options only accept numeric choice values.";
    }
  }
  return null;
}

/** First problem found in the whole draft, or `null` when it is ready to send. */
export function validateDraft(draft: CommandDraft): string | null {
  const nameError = validateCommandName(draft.name);
  if (nameError) return nameError;
  const descriptionError = validateDescription(draft.description);
  if (descriptionError) return descriptionError;
  if (draft.options.length > OPTIONS_MAX) return `At most ${OPTIONS_MAX} options are allowed.`;

  const seen = new Set<string>();
  for (const option of draft.options) {
    const optionError = validateOption(option);
    if (optionError) return `Option "${option.name || "(unnamed)"}": ${optionError}`;
    const key = option.name.trim().toLowerCase();
    if (seen.has(key)) return `Duplicate option name: ${option.name}.`;
    seen.add(key);
  }
  // Discord rejects a command whose required options come after optional ones.
  const firstOptional = draft.options.findIndex((option) => !option.required);
  if (firstOptional !== -1 && draft.options.slice(firstOptional).some((option) => option.required)) {
    return "Required options must come before optional ones.";
  }
  return null;
}

function toChoices(option: DraftOption): APIApplicationCommandOptionChoice[] | undefined {
  if (!supportsChoices(option.type) || option.choices.length === 0) return undefined;
  return option.choices.map((choice) => ({
    name: choice.name.trim(),
    value:
      option.type === ApplicationCommandOptionType.String
        ? choice.value.trim()
        : Number(choice.value),
  })) as APIApplicationCommandOptionChoice[];
}

/** Turns a validated draft into the REST body Discord expects. */
export function draftToBody(draft: CommandDraft): RESTPostAPIApplicationCommandsJSONBody {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    options: draft.options.map(
      (option) =>
        ({
          type: option.type,
          name: option.name.trim(),
          description: option.description.trim(),
          required: option.required,
          choices: toChoices(option),
        }) as APIApplicationCommandBasicOption,
    ),
  };
}

let optionKey = 0;

export function newDraftOption(): DraftOption {
  return {
    key: `option-${++optionKey}`,
    type: ApplicationCommandOptionType.String,
    name: "",
    description: "",
    required: false,
    choices: [],
  };
}

export function emptyDraft(): CommandDraft {
  return { name: "", description: "", options: [] };
}

/** Existing command -> editable draft. Unsupported option types are dropped. */
export function draftFromOptions(
  name: string,
  description: string,
  options: APIApplicationCommandOption[] | undefined,
): CommandDraft {
  const editable = new Set<number>(EDITABLE_OPTION_TYPES);
  return {
    name,
    description,
    options: (options ?? [])
      .filter((option) => editable.has(option.type))
      .map((option) => {
        const choices =
          "choices" in option && option.choices
            ? option.choices.map((choice) => ({
                name: choice.name,
                value: String(choice.value),
              }))
            : [];
        return {
          key: `option-${++optionKey}`,
          type: option.type as EditableOptionType,
          name: option.name,
          description: option.description,
          required: "required" in option ? Boolean(option.required) : false,
          choices,
        };
      }),
  };
}
