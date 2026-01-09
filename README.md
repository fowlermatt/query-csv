# QueryBox

> **In-Browser SQL Query Engine & Data Visualization Tool**

QueryBox is a high-performance, serverless SQL sandbox that enables users to execute analytical queries on local datasets (CSV and Parquet) directly within the browser. 

By leveraging **DuckDB-WASM** and **Web Workers**, QueryBox moves heavy computation off the main thread, ensuring a buttery-smooth UI even when processing large datasets. It features a zero-copy data architecture using **Apache Arrow**, eliminating serialization overhead.

---

## Key Features

* **Serverless SQL Execution:** Run full SQL queries on local files without uploading data to a backend.
* **High-Performance Architecture:** Non-blocking query execution using Web Workers.
* **Format Support:** Native support for `.csv` and `.parquet` files.
* **Virtualized Rendering:** Efficiently displays result sets of 10,000+ rows using TanStack Table + react-virtual.
* **Persistent Workflow:** Implemented persistent query history using `localStorage` to save user sessions.
* **Data Export:** Export results to CSV or copy directly to the clipboard.
* **Telemetry:** Integrated **Plausible Analytics** for privacy-friendly usage tracking.
* **Privacy First:** All data processing happens locally on the client machine; no data is sent to a server.

---

## Tech Stack

* **Frontend:** React, TypeScript, Vite
* **Engine:** DuckDB-WASM
* **Data Transport:** Apache Arrow (IPC Buffers)
* **Concurrency:** Web Workers
* **UI/Visualization:** TanStack Table, react-virtual
* **Analytics:** Plausible Analytics
* **Deployment:** Vercel

---

## Architecture & Engineering

This project was built to solve specific frontend performance bottlenecks associated with browser-based data processing.

### 1. Off-Main-Thread Execution (Web Workers)
Designed a Web Worker architecture for parallel query execution. The DuckDB instance runs entirely on a background thread, maintaining a responsive React interface even during heavy computational tasks.

### 2. Zero-Copy Data Transfer (Apache Arrow)
Optimized data transfer between threads using **Apache Arrow IPC buffers**. 
* The Worker generates an Arrow Table.
* The memory ownership is transferred (not copied) to the Main Thread.
* This results in zero-copy communication and significantly improved performance.

### 3. DOM Virtualization
Built a virtualized results table with **TanStack Table** and **react-virtual**. This allows the application to handle over 10,000 rows efficiently by only rendering the DOM nodes currently visible in the viewport.

### System Flow
```mermaid
sequenceDiagram
    participant User
    participant React_UI as React Main Thread
    participant Worker as Web Worker (DuckDB)
    
    User->>React_UI: Uploads CSV/Parquet
    React_UI->>Worker: Send File Buffer
    Worker->>Worker: Register Table
    User->>React_UI: Types "SELECT * FROM data"
    React_UI->>Worker: Post Message (Query)
    Worker->>Worker: Execute SQL
    Worker->>React_UI: Return Apache Arrow Buffer (Zero-Copy)
    React_UI->>User: Render Virtualized Table
 ```

## ⚡ Getting Started

| Project | Live Demo |
| :--- | :--- |
| **QueryCSV** | [QueryCSV](https://querycsv.vercel.app) |

---

##  Usage

1.  Click **"Load File"** to select a local CSV or Parquet file.
2.  The file is automatically registered as a table (e.g., `my_data`).
3.  Type standard SQL into the editor:
    ```sql
    SELECT * FROM my_data WHERE value > 100 ORDER BY date DESC LIMIT 50;
    ```
4.  Hit **Run** (or `Ctrl + Enter`).
5.  View results in the virtualized grid or download as CSV.

---
