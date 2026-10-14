"use client";

import { useEffect, useRef } from "react";
import Editor, { loader, type BeforeMount, type Monaco, type OnMount } from "@monaco-editor/react";
import { SCRIPT_TYPES } from "@/lib/commands/scriptTypes";

/**
 * Monaco — the editor inside VS Code — served from this site (copied out of
 * node_modules on install by scripts/copy-monaco.mjs) and loaded on first use,
 * so it costs nothing until someone opens a command's handler.
 */
loader.config({ paths: { vs: "/monaco/vs" } });

const THEME = "disbotclient-dark";

/** TypeScript diagnostics that are wrong for a script body: top-level await and return. */
const IGNORED_DIAGNOSTICS = [1108, 1375, 1378, 2304, 80005];

let configured = false;

/** The slice of Monaco's TypeScript API used here. */
interface TypeScriptApi {
  ScriptTarget: { ES2022: number };
  javascriptDefaults: {
    setCompilerOptions(options: Record<string, unknown>): void;
    setDiagnosticsOptions(options: Record<string, unknown>): void;
    addExtraLib(content: string, path: string): unknown;
  };
}

/** Theme, script globals and diagnostics: once per page, shared by every editor. */
const configure: BeforeMount = (monaco: Monaco) => {
  if (configured) return;
  configured = true;
  monaco.editor.defineTheme(THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#111214",
      "editor.lineHighlightBackground": "#1e1f22",
      "editorLineNumber.foreground": "#4e5058",
      "editorLineNumber.activeForeground": "#949ba4",
      "editorGutter.background": "#111214",
      "editorWidget.background": "#1e1f22",
      "editorSuggestWidget.background": "#1e1f22",
      "editorSuggestWidget.selectedBackground": "#35373c",
      "editorHoverWidget.background": "#1e1f22",
      "editor.selectionBackground": "#5865f255",
      "scrollbarSlider.background": "#2b2d3188",
    },
  });
  // Monaco 0.55 moved languages.typescript to the top level; accept either.
  const typescript: TypeScriptApi | undefined =
    (monaco as unknown as { typescript?: TypeScriptApi }).typescript ??
    (monaco.languages as unknown as { typescript?: TypeScriptApi }).typescript;
  if (!typescript) return;
  const javascript = typescript.javascriptDefaults;
  javascript.setCompilerOptions({
    target: typescript.ScriptTarget.ES2022,
    lib: ["es2022", "webworker"],
    allowJs: true,
    checkJs: false,
    allowNonTsExtensions: true,
    noLib: false,
  });
  javascript.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: IGNORED_DIAGNOSTICS,
  });
  javascript.addExtraLib(SCRIPT_TYPES, "file:///disbotclient-script.d.ts");
};

export interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Model path; also what the tab shows, e.g. "ping.js". */
  path: string;
  /** Ctrl/⌘+S. */
  onSave?: () => void;
  /** Focus the editor as soon as it is ready. */
  autoFocus?: boolean;
  className?: string;
  /** Receives a handle for inserting text at the cursor, and null once the editor is gone. */
  onHandle?: (handle: CodeEditorHandle | null) => void;
}

export interface CodeEditorHandle {
  /** Replaces the selection with `text`, as typing it would. */
  insert: (text: string) => void;
}

/** A JavaScript editor that behaves like VS Code, with autocomplete for every script helper. */
export function CodeEditor({
  value,
  onChange,
  path,
  onSave,
  autoFocus,
  className,
  onHandle,
}: CodeEditorProps) {
  // The save command is bound once; it reads the latest handler from here.
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  const handleMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current?.());
    if (autoFocus) editor.focus();
    onHandle?.({
      insert: (text) => {
        const selection = editor.getSelection();
        if (!selection) return;
        editor.executeEdits("insert", [{ range: selection, text, forceMoveMarkers: true }]);
        editor.pushUndoStop();
        editor.focus();
      },
    });
    editor.onDidDispose(() => onHandle?.(null));
  };

  return (
    <div
      className={className}
      // Escape closes Monaco's own widgets; it must not also close the settings page around it.
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
    >
      <Editor
        path={path}
        language="javascript"
        theme={THEME}
        value={value}
        onChange={(next) => onChange(next ?? "")}
        beforeMount={configure}
        onMount={handleMount}
        loading={<span className="text-xs text-muted">Loading the editor…</span>}
        options={{
          fontFamily: "var(--font-app-mono), ui-monospace, monospace",
          fontSize: 13,
          lineHeight: 20,
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: false,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "off",
          renderLineHighlight: "line",
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          smoothScrolling: true,
          cursorBlinking: "smooth",
          fixedOverflowWidgets: true,
          padding: { top: 10, bottom: 10 },
          quickSuggestions: { other: true, comments: false, strings: false },
          suggest: { showWords: false },
          tabCompletion: "on",
          formatOnPaste: false,
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, alwaysConsumeMouseWheel: false },
        }}
      />
    </div>
  );
}
