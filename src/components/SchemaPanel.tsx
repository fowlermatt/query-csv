import React from "react";
import type { TableSchema } from "../workers/contracts";

type Props = {
  schema: TableSchema[];
  onInsert?: (sql: string) => void;
  isLoading?: boolean;
};

export const SchemaPanel: React.FC<Props> = ({ schema, onInsert, isLoading = false }) => {
  return (
    <aside style={{ width: 280, borderRight: "1px solid #e5e7eb", padding: "12px", overflow: "auto" }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Schema</div>
      {isLoading ? (
        <div style={{ color: "#6b7280" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    height: 16,
                    width: "60%",
                    backgroundColor: "#e5e7eb",
                    borderRadius: 4,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
                <div
                  style={{
                    height: 12,
                    width: "80%",
                    backgroundColor: "#f3f4f6",
                    borderRadius: 4,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
                <div
                  style={{
                    height: 12,
                    width: "70%",
                    backgroundColor: "#f3f4f6",
                    borderRadius: 4,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              </div>
            ))}
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
          `}</style>
        </div>
      ) : schema.length === 0 ? (
        <div style={{ color: "#6b7280" }}>No tables loaded.</div>
      ) : (
        schema.map((t) => (
          <div key={t.table} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <code style={{ fontWeight: 600 }}>{t.table}</code>
              <button
                onClick={() => onInsert?.(`SELECT * FROM "${t.table}" LIMIT 100;`)}
                style={{ fontSize: 12, border: "1px solid #d1d5db", padding: "2px 6px", borderRadius: 6, background: "white" }}
                title="Insert quick select"
              >
                Insert
              </button>
            </div>
            <table style={{ width: "100%", fontSize: 12, marginTop: 6 }}>
              <tbody>
                {t.columns.map((c) => (
                  <tr key={c.name}>
                    <td style={{ width: "60%", padding: "2px 0" }}>
                      <code>{c.name}</code>
                    </td>
                    <td style={{ width: "40%", textAlign: "right", color: "#6b7280" }}>{c.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </aside>
  );
};
