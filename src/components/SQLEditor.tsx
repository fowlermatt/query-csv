import React, { useEffect, useMemo, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as monacoNs from "monaco-editor";
import type { TableSchema } from "../workers/contracts";

const SQL_KEYWORDS = [
  "SELECT","FROM","WHERE","GROUP BY","ORDER BY","LIMIT","OFFSET","JOIN","LEFT JOIN","RIGHT JOIN","FULL JOIN",
  "ON","USING","CREATE VIEW","DROP VIEW","CREATE TABLE","WITH","AS","AND","OR","NOT","IN","BETWEEN","LIKE",
  "UNION","ALL","DISTINCT","CAST","COUNT","SUM","AVG","MIN","MAX"
];

type Props = {
  value: string;
  onChange: (next: string) => void;
  onRun: () => void;
  schema: TableSchema[];
};

export const SQLEditor: React.FC<Props> = ({ value, onChange, onRun, schema }) => {
  // hold the runtime monaco API
  const monacoRef = useRef<typeof monacoNs | null>(null);
  // keep the latest word list accessible to the provider even if schema changes
  const wordsRef = useRef<string[]>([]);
  const disposeRef = useRef<(() => void) | null>(null);

  const dynamicWords = useMemo(() => {
    const tableNames = schema.map((s) => s.table);
    const columnNames = schema.flatMap((s) => s.columns.map((c) => c.name));
    return [...new Set([...tableNames, ...columnNames])];
  }, [schema]);

  useEffect(() => {
    wordsRef.current = dynamicWords;
  }, [dynamicWords]);

  const onMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;

    const provider = monaco.languages.registerCompletionItemProvider("sql", {
      triggerCharacters: [" ", ".", '"'],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        );

        const suggestions: monacoNs.languages.CompletionItem[] = [];

        // Keywords
        for (const kw of SQL_KEYWORDS) {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
          });
        }

        for (const w of wordsRef.current) {
          suggestions.push({
            label: w,
            kind: monaco.languages.CompletionItemKind.Field,
            insertText: /[^a-zA-Z0-9_]/.test(w) ? `"${w}"` : w,
            range,
          });
        }

        return { suggestions };
      },
    });

    disposeRef.current = () => provider.dispose();

    // Cmd/Ctrl + Enter to run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRun());
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      disposeRef.current?.();
    };
  }, []);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
      <Editor
        height="220px"
        defaultLanguage="sql"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        onMount={onMount}
        options={{
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: 2,
          renderWhitespace: "selection",
          automaticLayout: true,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "#fafafa", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ color: "#6b7280", fontSize: 12 }}>Tip: Run with ⌘/Ctrl + Enter</div>
        <button
          onClick={onRun}
          style={{ fontSize: 13, border: "1px solid #d1d5db", padding: "6px 10px", borderRadius: 8, background: "white" }}
        >
          Run ▶
        </button>
      </div>
    </div>
  );
};
