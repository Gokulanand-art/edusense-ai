# 🎓 College RAG Chatbot

An AI-powered college information assistant that uses **Retrieval-Augmented Generation (RAG)** to answer student questions strictly based on official college documents with verified source citations, preventing hallucination.

Instead of relying on general LLM speculation, the chatbot searches vector embeddings in **PostgreSQL (pgvector)**, retrieves relevant document chunks, and synthesizes grounded answers with exact source references (document title, category, page, and chunk snippets).

---

## ✨ Features

### 👨‍🎓 Student Features
* 🔐 **Secure Authentication**: NextAuth session management with role-based access.
* 💬 **AI Campus Chatbot**: Interactive chat interface with real-time streaming answers.
* 📚 **Official Document Grounding**: Strict anti-hallucination guardrails adhering to college policies.
* 🔎 **Semantic Vector Search**: pgvector cosine similarity matching (`<=>`).
* 📄 **Verified Sources Drawer**: Inspect matched document title, page number, relevance %, and chunk text.
* 💡 **Suggested Questions**: 1-click starter prompts for attendance, hostels, fees, and placements.
* 🧠 **Conversation History**: Multi-turn context memory with persistent conversation history.
* 👍 / 👎 **Answer Feedback**: Rate chatbot responses to help improve college knowledge clarity.

### 👨‍💼 Admin Features
* 📊 **Admin Dashboard**: Live metrics for documents, chunks, queries, and feedback satisfaction.
* 📤 **Multi-Format Ingestion**: Upload PDF, Word (.docx), Plain Text (.txt), and Markdown (.md).
* 🔄 **Automated RAG Pipeline**: Text cleaning, token sliding-window chunking, and embedding generation.
* 👁️ **Chunk Inspector**: Inspect individual chunk segments, token counts, and section headers.
* 🔁 **Document Reprocessing**: Re-extract, re-chunk, and re-embed documents with one click.
* 🗑️ **Cascading Deletions**: Cleanly delete documents and all associated vector embeddings.

---

## 🧠 How RAG Works

```text
                COLLEGE DOCUMENTS (PDF / DOCX / TXT / MD)
                               │
                               ▼
                        Text Extraction
                               │
                               ▼
                       Chunking & Overlap
                               │
                               ▼
                           Embeddings
                               │
                               ▼
                     PostgreSQL + pgvector
                               │
Student Question ──────────────┤
       │                       ▼
       ▼             Vector Similarity Search
Question Embedding             │
       │                       ▼
       └─────────────► Top K Context Chunks
                               │
                               ▼
                        Configurable LLM
                               │
                               ▼
                 Grounded Answer + Sources Drawer
```

---

## 🛠️ Technology Stack

* **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Lucide Icons
* **Backend**: Next.js API Routes & Server Actions, TypeScript
* **Database & ORM**: PostgreSQL 16, pgvector, Prisma ORM
* **Authentication**: NextAuth.js / Auth.js (Credentials Provider, Bcrypt)
* **AI & Embeddings**: Unified adapter supporting Google Gemini (`text-embedding-004`, `gemini-1.5-flash`), OpenAI (`text-embedding-3-small`, `gpt-4o-mini`), and built-in Local deterministic vector engine
* **Document Parsers**: `pdf-parse` for PDF, `mammoth` for DOCX, native UTF-8 parsers for TXT/MD
* **Testing**: Vitest unit test suite

---

## 🚀 Getting Started (Step-by-Step Local Setup)

Follow these steps to run the complete project locally on your machine:

### 1. Prerequisites

Ensure you have the following installed:
* **Node.js**: `v18.17+` or `v20+` ([Download Node.js](https://nodejs.org/))
* **Docker Desktop**: For running PostgreSQL + pgvector container ([Download Docker](https://www.docker.com/))
  *(Or an existing PostgreSQL instance with pgvector extension enabled)*
* **Git**: ([Download Git](https://git-scm.com/))

---

### 2. Clone the Repository & Navigate

```bash
git clone <repository-url>
cd college-rag-chatbot
```

---

### 3. Install Dependencies

```bash
npm install
```

---

### 4. Start PostgreSQL with pgvector (Docker)

Start the pre-configured PostgreSQL 16 container with `pgvector` enabled:

```bash
docker compose up -d
```

Verify that the container is healthy:
```bash
docker ps
```
*(The container `college-rag-postgres` will be running on port `5432`)*

---

### 5. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` and review the settings:

```env
# Database Connection (Default matches docker-compose.yml)
DATABASE_URL="postgresql://postgres:postgres_password@localhost:5432/college_rag?schema=public"

# NextAuth Secret
NEXTAUTH_SECRET="super-secret-nextauth-key-change-in-production-123456"
NEXTAUTH_URL="http://localhost:3000"
AUTH_SECRET="super-secret-nextauth-key-change-in-production-123456"

# LLM & Embedding Configuration
# Use "local" for offline testing or "gemini" / "openai" with your API key
LLM_PROVIDER="local"
LLM_API_KEY="local-dev-mock-key"
LLM_MODEL="gemini-1.5-flash"

EMBEDDING_PROVIDER="local"
EMBEDDING_API_KEY="local-dev-mock-key"
EMBEDDING_MODEL="text-embedding-004"

# RAG Hyperparameters
MIN_RELEVANCE_SCORE=0.70
RAG_TOP_K=5
CHUNK_SIZE=700
CHUNK_OVERLAP=100
```

> **Tip**: You can run the application immediately in `local` mode without any paid API keys! To use Google Gemini or OpenAI, simply set `LLM_PROVIDER="gemini"` or `"openai"` and insert your API key.

---

### 6. Setup Database & Run Migrations

Generate Prisma Client and apply database schema:

```bash
npx prisma db push
```
*(Or `npx prisma migrate dev --name init`)*

---

### 7. Seed the Database

Populate initial admin and student accounts, along with 4 official college documents (Academic Regulations 2026, Hostel Rules, Fee Structure, and Placement Guidelines) with pre-indexed vector chunks:

```bash
npm run seed
```

---

### 8. Start the Development Server

```bash
npm run dev
```

Open your browser and navigate to:
```text
http://localhost:3000
```

---

## 🔑 Demo Credentials

Use these seeded accounts to test the application locally:

| Role | Email | Password | Access |
| :--- | :--- | :--- | :--- |
| **Student** | `student@college.edu` | `Student@123` | Chatbot, History, Sources, Feedback |
| **Admin** | `admin@college.edu` | `Admin@123` | Document Upload, Chunk Inspector, Reprocessing, Analytics |

*(You can also register a new student account at `/register` or use the 1-click Quick Login buttons on the `/login` page)*

---

## 📚 Example Student Queries to Try

Once logged in as a student, try asking:
1. **Attendance Rules**: *"What is the minimum attendance required to appear for semester exams?"*
2. **Hostel Rules**: *"What are the hostel curfew timings and guest rules?"*
3. **Grading & Honors**: *"What CGPA is required to graduate with a Degree with Honours?"*
4. **Placements**: *"What is the Dream Offer policy for campus placements?"*
5. **Scholarships**: *"What is the Presidential Scholar Award and how much fee waiver is provided?"*
6. **Unknown Question Handling**: *"What is the syllabus for Aeronautical Rocket Propulsion?"* *(The chatbot will politely refuse without hallucinating facts)*

---

## 🧪 Running Automated Tests

Run the Vitest test suite covering document chunking, RAG retrieval math, and authentication:

```bash
npm test
```

To run in watch mode:
```bash
npm run test:watch
```

---

## 📄 Ingesting Documents via CLI

In addition to the web admin dashboard, you can ingest any document directly from the command line:

```bash
npm run process-doc <path-to-file> [category]
```

Example:
```bash
npm run process-doc ./sample-docs/library_rules.pdf Academics
```

---

## 📁 Project Structure

```text
college-rag-chatbot/
│
├── app/
│   ├── page.tsx                    # Landing page & RAG visualizer
│   ├── layout.tsx                  # Root layout & providers
│   ├── globals.css                 # Glassmorphism & design system tokens
│   ├── login/page.tsx              # Login page with 1-click demo accounts
│   ├── register/page.tsx           # Student registration
│   ├── chat/page.tsx               # AI chatbot with source drawer
│   ├── history/page.tsx            # Student conversation history
│   ├── admin/page.tsx              # Admin dashboard with authorization
│   └── api/
│       ├── auth/                   # NextAuth & registration routes
│       ├── chat/route.ts           # RAG chat & message persistence
│       ├── conversations/          # Conversation management
│       ├── feedback/route.ts       # Student feedback (thumbs up/down)
│       └── admin/                  # Admin documents & analytics APIs
│
├── components/
│   ├── chat/                       # ChatInterface, MessageItem, SourceDrawer
│   ├── admin/                      # AdminDashboard, DocumentUploader, DocumentTable
│   └── layout/                     # Navbar, Footer
│
├── lib/
│   ├── auth/                       # Auth options & session helpers
│   ├── db/                         # Prisma client singleton
│   ├── rag/                        # RAG engine, pgvector store, prompt guardrails
│   ├── embeddings/                 # Gemini, OpenAI, & Local vector embeddings
│   ├── llm/                        # Gemini, OpenAI, & Local grounded reasoning
│   ├── documents/                  # Text extractor, cleaner, token chunker
│   └── storage/                    # Local & abstracted file storage
│
├── prisma/
│   └── schema.prisma               # Prisma schema with pgvector vector models
│
├── scripts/
│   ├── seed.ts                     # Database seeder (users & official docs)
│   └── process-document.ts         # CLI document processor
│
├── tests/                          # Vitest automated test suites
├── docker-compose.yml              # PostgreSQL 16 + pgvector container
└── README.md                       # Documentation
```

---

## 📜 License

This project is built for educational, campus, and production demonstration purposes.
