# 🚀 Deployment Guide: College RAG Chatbot

This comprehensive guide will walk you through pushing your project to **GitHub** and deploying it to **Vercel** (recommended for Next.js full-stack) and/or **Render**.

---

## 📌 Architecture Note: Why Next.js is Full-Stack
This project is built using **Next.js 14 App Router**. In Next.js:
* **Frontend**: React UI components, Tailwind CSS, Chat interface, Admin dashboard.
* **Backend**: Serverless API routes located in `app/api/*` (handles auth, chat, document processing, database calls).
* **Database**: MongoDB Atlas (`college_rag` cluster).

> 💡 **Recommended Setup**: Deploying the full-stack app directly to **Vercel** automatically hosts both the frontend and backend serverless API functions together with 0 configuration.

---

## 🛠️ Step 1: Push Code to GitHub

### 1.1 Verify `.gitignore`
A `.gitignore` file has already been added to your project. It automatically prevents sensitive files like `.env`, `node_modules`, and local build artifacts from being uploaded to GitHub.

### 1.2 Initialize Git & Commit
Open your terminal in the project directory (`C:\Users\venka\OneDrive\Desktop\Project`) and run:

```bash
# 1. Initialize git repository
git init

# 2. Add all project files
git add .

# 3. Commit the changes
git commit -m "Initial commit: College RAG Chatbot with MongoDB Atlas"

# 4. Set the main branch
git branch -M main
```

### 1.3 Create a GitHub Repository & Push
1. Go to **[GitHub](https://github.com/new)** and create a new repository (e.g., `college-rag-chatbot`).
2. Do **not** check "Initialize with a README" (your project already has one).
3. Copy your repository URL and run:

```bash
# Replace with your actual repository URL
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/college-rag-chatbot.git

# Push code to GitHub
git push -u origin main
```

---

## 🌐 Step 2: Deploy to Vercel (Recommended ⚡)

Vercel is the creator of Next.js and provides zero-config full-stack hosting.

### 2.1 Import Repository
1. Go to **[Vercel Dashboard](https://vercel.com/dashboard)**.
2. Click **"Add New..."** ➔ **"Project"**.
3. Select your GitHub account and click **"Import"** next to `college-rag-chatbot`.

### 2.2 Configure Build Settings
Vercel automatically detects Next.js:
* **Framework Preset**: `Next.js`
* **Root Directory**: `./`
* **Build Command**: `prisma generate && next build` *(automatically detected)*
* **Output Directory**: `.next`

### 2.3 Add Environment Variables
Under the **"Environment Variables"** section in Vercel, add the following key-value pairs:

| Key | Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `mongodb+srv://venkatvantakula45_db_user:QtTjfBpdEvQZSPHM@chatbot.uht7czj.mongodb.net/college_rag?retryWrites=true&w=majority&appName=Chatbot` | Your MongoDB Atlas connection string |
| `NEXTAUTH_SECRET` | `super-secret-production-nextauth-key-32-chars-min-12345` | Secure random key for session encryption |
| `NEXTAUTH_URL` | `https://your-app-name.vercel.app` *(or update after deploy)* | Your live production Vercel URL |
| `AUTH_SECRET` | `super-secret-production-nextauth-key-32-chars-min-12345` | Same as NEXTAUTH_SECRET |
| `LLM_PROVIDER` | `local` *(or `gemini` / `openai`)* | LLM reasoning engine |
| `LLM_API_KEY` | `local-dev-mock-key` *(or your Gemini/OpenAI API key)* | API Key |
| `EMBEDDING_PROVIDER` | `local` *(or `gemini` / `openai`)* | Embedding provider |
| `EMBEDDING_API_KEY` | `local-dev-mock-key` *(or your Gemini/OpenAI API key)* | Embedding API Key |
| `STORAGE_PROVIDER` | `local` | Document storage provider |
| `MIN_RELEVANCE_SCORE` | `0.70` | RAG retrieval threshold |
| `RAG_TOP_K` | `5` | Top context chunks to retrieve |

### 2.4 Deploy
Click **"Deploy"**. Vercel will build and launch your application in ~1 minute!

---

## 🖥️ Step 3: Deploy to Render (Alternative Option)

If you prefer to deploy on Render:

### 3.1 Create a Web Service
1. Go to **[Render Dashboard](https://dashboard.render.com/)**.
2. Click **"New +"** ➔ **"Web Service"**.
3. Connect your GitHub repository `college-rag-chatbot`.

### 3.2 Service Settings
* **Name**: `college-rag-chatbot`
* **Region**: Choose the closest region to you (e.g., Singapore, Oregon, Frankfurt).
* **Branch**: `main`
* **Runtime**: `Node`
* **Build Command**: `npm install && npm run build`
* **Start Command**: `npm run start`
* **Instance Type**: `Free`

### 3.3 Add Environment Variables on Render
Under **Environment Variables**, add:
* `DATABASE_URL`: `mongodb+srv://venkatvantakula45_db_user:QtTjfBpdEvQZSPHM@chatbot.uht7czj.mongodb.net/college_rag?retryWrites=true&w=majority&appName=Chatbot`
* `NEXTAUTH_SECRET`: `super-secret-production-nextauth-key-32-chars-min-12345`
* `NEXTAUTH_URL`: `https://college-rag-chatbot.onrender.com`
* `AUTH_SECRET`: `super-secret-production-nextauth-key-32-chars-min-12345`
* `LLM_PROVIDER`: `local`
* `LLM_API_KEY`: `local-dev-mock-key`
* `EMBEDDING_PROVIDER`: `local`
* `EMBEDDING_API_KEY`: `local-dev-mock-key`
* `STORAGE_PROVIDER`: `local`
* `MIN_RELEVANCE_SCORE`: `0.70`
* `RAG_TOP_K`: `5`
* `NODE_ENV`: `production`

### 3.4 Deploy
Click **"Create Web Service"**. Render will build and host your service.

---

## 🔒 Security Checklist Before Going Live
1. **MongoDB Network Access**: In MongoDB Atlas ➔ **Network Access**, ensure `0.0.0.0/0` is added so Vercel/Render serverless functions can connect to MongoDB.
2. **Never Commit `.env`**: Always ensure `.env` is inside `.gitignore` (already configured).
3. **Change Default Credentials**: Log into the Admin account (`admin@college.edu` / `Admin@123`) and create your own administrative credentials in production.

---

## 🎉 Done!
Your College RAG Chatbot is now ready for production on the web!
