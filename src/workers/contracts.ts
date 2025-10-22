export type WorkerRequest =
  | { type: "REGISTER_FILE"; fileId: string; file: File; logicalName: string }
  | { type: "EXECUTE_QUERY"; sql: string; asArrow?: boolean }                  
  | { type: "GET_SCHEMA" };                                                    

export type TableColumn = { name: string; type: string; nullable?: boolean };
export type TableSchema = { table: string; columns: TableColumn[] };

export type WorkerResponse =
  | { type: "OK" }
  | { type: "ERROR"; message: string; stack?: string }
  | { type: "QUERY_RESULT_ARROW"; buffer: ArrayBuffer }
  | { type: "QUERY_RESULT_JSON"; rows: unknown[]; schema?: unknown }
  | { type: "SCHEMA"; tables: TableSchema[] };