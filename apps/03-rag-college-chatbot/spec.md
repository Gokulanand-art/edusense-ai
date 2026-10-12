# 🎓 RAG-Based College Chatbot

An AI-powered college information assistant that uses **Retrieval-Augmented Generation (RAG)** to answer student questions using official college documents.

Instead of relying only on an LLM's general knowledge, the chatbot retrieves relevant information from uploaded college documents and uses that context to generate grounded answers with source references.

---

## ✨ Features

### Student Features

* 🔐 Secure authentication
* 💬 AI-powered college chatbot
* 📚 Answers based on official college documents
* 🔎 Semantic document search
* 📄 Source/reference display
* 🧠 Conversation context
* 🕘 Chat history
* 👍 / 👎 answer feedback
* 💡 Suggested questions
* ⚡ Streaming AI responses
* 📱 Responsive interface

### Admin Features

* 📊 Admin dashboard
* 📤 Document upload
* 📚 Document management
* 🗑️ Document deletion
* 🔄 Document reprocessing
* 📈 Processing statistics
* 🏷️ Document categorization
* 📄 Document metadata
* 📊 Basic usage analytics

---

# 🧠 How RAG Works

The chatbot follows a real Retrieval-Augmented Generation pipeline.

```text
                COLLEGE DOCUMENTS
                       │
                       ▼
                Text Extraction
                       │
                       ▼
                    Chunking
                       │
                       ▼
                 Embeddings
                       │
                       ▼
              PostgreSQL + pgvector
                       │
                       │
Student Question ─────┘
       │
       ▼
Question Embedding
       │
       ▼
Vector Similarity Search
       │
       ▼
Relevant Document Chunks
       │
       ▼
Context Construction
       │
       ▼
         LLM
       │
       ▼
Grounded Answer + Sources
```

The system does **not** simply send the user's question directly to an LLM.

---

# 🛠️ Technology Stack

## Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS
* shadcn/ui
* Lucide Icons

## Backend

* Next.js API routes/server actions
* TypeScript

## Database

* PostgreSQL
* Prisma ORM
* pgvector

## Authentication

* Auth.js / NextAuth

## AI

* Configurable LLM provider
* Configurable embedding provider

## Documents

Supported formats:

* PDF
* DOCX
* TXT
* Markdown

---

# 📁 Project Structure

```text
college-rag-chatbot/
│
├── app/
│   ├── page.tsx
│   ├── login/
│   ├── register/
│   ├── chat/
│   ├── history/
│   ├── profile/
│   └── admin/
│
├── components/
│   ├── chat/
│   ├── documents/
│   ├── admin/
│   ├── layout/
│   └── ui/
│
├── lib/
│   ├── auth/
│   ├── db/
│   ├── rag/
│   ├── embeddings/
│   ├── llm/
│   ├── documents/
│   ├── storage/
│   └── utils/
│
├── prisma/
│   └── schema.prisma
│
├── scripts/
│   ├── seed.ts
│   └── process-document.ts
│
├── tests/
│   ├── auth/
│   ├── rag/
│   └── documents/
│
├── public/
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

---

# 🚀 Getting Started

## 1. Clone the Repository

```bash
git clone <repository-url>

cd college-rag-chatbot
```

---

## 2. Install Dependencies

```bash
npm install
```

---

# 🐘 3. Start PostgreSQL + pgvector

Using Docker:

```bash
docker compose up -d
```

Verify that PostgreSQL is running.

---

# 🔑 4. Configure Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Configure the required values:

```env
DATABASE_URL=

AUTH_SECRET=

LLM_API_KEY=
LLM_MODEL=

EMBEDDING_API_KEY=
EMBEDDING_MODEL=

STORAGE_PROVIDER=local

STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
STORAGE_ENDPOINT=

MIN_RELEVANCE_SCORE=0.70
RAG_TOP_K=5
CHUNK_SIZE=700
CHUNK_OVERLAP=100
```

Never commit `.env` or real API keys.

---

# 🗄️ 5. Setup Database

Run Prisma migrations:

```bash
npx prisma migrate dev
```

Generate Prisma client:

```bash
npx prisma generate
```

---

# 🌱 6. Seed the Database

```bash
npm run seed
```

This creates development data such as:

* Admin user
* Student user
* Sample records

Use only development credentials locally.

---

# ▶️ 7. Start the Application

```bash
npm run dev
```

Open the application at:

```text
http://localhost:3000
```

---

# 📚 Using the Application

## Student

1. Create an account.
2. Login.
3. Open the chatbot.
4. Ask a college-related question.
5. The system searches the document knowledge base.
6. Relevant chunks are retrieved.
7. The LLM generates a grounded answer.
8. Sources are displayed below the answer.

Example:

```text
Student:
What is the minimum attendance required for semester exams?

Assistant:
According to the Academic Regulations, students must maintain
the required attendance percentage to be eligible for the
semester examination.

Sources:
📄 Academic Regulations 2026
Page 24
```

---

# 👨‍💼 Admin Workflow

An administrator can upload college documents.

Example:

```text
Admin uploads PDF
       ↓
File validation
       ↓
Text extraction
       ↓
Text cleaning
       ↓
Chunking
       ↓
Embedding generation
       ↓
pgvector storage
       ↓
Document marked READY
```

Once processing finishes, the document becomes available to the chatbot.

---

# 🔍 RAG Query Workflow

When a student asks:

> What are the hostel rules?

The application performs:

```text
Question
   ↓
Generate query embedding
   ↓
Search pgvector
   ↓
Retrieve top 5 chunks
   ↓
Build context
   ↓
Send context + question to LLM
   ↓
Generate answer
   ↓
Attach source references
   ↓
Display answer
```

---

# 🚫 Unknown Questions

The chatbot is designed to avoid hallucination.

If the required information cannot be found:

```text
I couldn't find reliable information about that in the college
documents currently available to me.
```

The system should not invent:

* Fees
* Dates
* Policies
* Eligibility requirements
* Exam schedules
* Department information
* Scholarship details

---

# 📄 Document Processing

Supported formats:

| Format      | Support      |
| ----------- | ------------ |
| PDF         | ✅            |
| DOCX        | ✅            |
| TXT         | ✅            |
| Markdown    | ✅            |
| Scanned PDF | Optional OCR |

Documents are converted into chunks before embeddings are generated.

Default configuration:

```text
Chunk size: 700 tokens
Overlap: 100 tokens
Top K: 5
Minimum relevance: 0.70
```

These values can be changed through environment variables.

---

# 🗃️ Database

The application uses PostgreSQL with pgvector.

Main entities:

```text
User
 │
 ├── Conversation
 │      └── Message
 │             └── MessageSource
 │
 └── Feedback


Document
 │
 └── DocumentChunk
          │
          └── Embedding
```

---

# 🔐 Security

The application implements:

* Password hashing
* Authentication
* Session management
* Role-based authorization
* Protected admin routes
* Server-side authorization
* File validation
* File size limits
* Input validation
* Environment-based secrets
* API key protection

API keys must never be exposed to the browser.

---

# 🧪 Testing

Run tests using:

```bash
npm test
```

Tests should cover:

### Authentication

* Registration
* Login
* Invalid credentials
* Protected routes
* Admin authorization

### Document Processing

* PDF extraction
* DOCX extraction
* Chunk generation
* Metadata preservation
* Failure handling

### RAG

* Query embedding
* Vector retrieval
* Context generation
* Source attribution
* Unknown-question handling

---

# 📊 RAG Evaluation

The project can use a small evaluation dataset containing questions with expected sources.

Example:

```json
{
  "question": "What is the minimum attendance requirement?",
  "expectedSource": "Academic Regulations",
  "expectedPage": 24
}
```

Evaluation should consider:

* Retrieval relevance
* Source accuracy
* Answer grounding
* Unknown-question handling

---

# 🚢 Deployment

The application is designed for deployment using:

```text
Frontend / Backend
       ↓
Vercel or equivalent

Database
       ↓
PostgreSQL + pgvector

File Storage
       ↓
S3-compatible storage
```

Before deploying:

1. Create a production PostgreSQL database.
2. Enable pgvector.
3. Configure production environment variables.
4. Configure object/file storage.
5. Run database migrations.
6. Build the application.
7. Deploy.
8. Upload official college documents.
9. Verify document processing.
10. Test RAG responses.

---

# 🌟 Bonus Features

Possible future improvements:

* 🌐 Multilingual chatbot
* 🎙️ Voice input
* 🔊 Voice responses
* 📂 Department-wise collections
* 🔎 Hybrid keyword + vector search
* 🧠 Re-ranking
* 📷 OCR
* 📑 Source highlighting
* 📊 Admin analytics
* 🤖 Automatic FAQ generation
* 📝 Document summarization
* 📤 Conversation export
* 🔐 Advanced role-based access
* 📈 RAG evaluation dashboard

---

# 🎯 Project Objective

The primary objective is to demonstrate a complete production-style **Retrieval-Augmented Generation system**.

The project must demonstrate:

```text
Document ingestion
        ↓
Text extraction
        ↓
Chunking
        ↓
Embedding generation
        ↓
Vector database
        ↓
Semantic retrieval
        ↓
Context augmentation
        ↓
LLM generation
        ↓
Source attribution
```

A chatbot connected directly to an LLM without this retrieval pipeline does **not** satisfy the project requirements.

---

# ✅ Final Checklist

## Core

* [ ] Authentication
* [ ] Student chat
* [ ] Admin dashboard
* [ ] Document upload
* [ ] PDF processing
* [ ] DOCX processing
* [ ] Text extraction
* [ ] Chunking
* [ ] Embeddings
* [ ] Vector database
* [ ] Semantic search
* [ ] RAG pipeline
* [ ] LLM integration
* [ ] Source display
* [ ] Unknown question handling
* [ ] Chat history
* [ ] Document management
* [ ] Database integration
* [ ] Frontend/backend integration
* [ ] Deployment

## Bonus

* [ ] Multilingual support
* [ ] Voice
* [ ] OCR
* [ ] Hybrid search
* [ ] Re-ranking
* [ ] Analytics
* [ ] FAQ generation
* [ ] Document summarization
* [ ] Feedback
* [ ] Source highlighting

---

# 📜 License

Add the project's chosen license here.

---

# 👨‍💻 Project

**RAG-Based College Chatbot**

Built as an AI/RAG project demonstrating how college-specific knowledge can be made accessible through semantic retrieval and grounded language-model generation.
