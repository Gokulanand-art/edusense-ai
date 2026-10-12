"use client";

import { useState, useRef } from "react";
import { Upload, FileUp, CheckCircle, AlertCircle, Loader2, Sparkles } from "lucide-react";

interface DocumentUploaderProps {
  onSuccess: () => void;
}

const CATEGORIES = ["Academics", "Hostel", "Fees & Scholarships", "Placements", "General"];

export function DocumentUploader({ onSuccess }: DocumentUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Academics");
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      if (!title) {
        setTitle(selected.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || isUploading) return;

    setIsUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title || file.name);
    formData.append("category", category);

    try {
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to upload document");
      }

      setMessage({
        type: "success",
        text: `"${title || file.name}" processed and indexed successfully (${data.chunksProcessed} chunks)!`,
      });

      // Reset form
      setFile(null);
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      onSuccess();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An error occurred during ingestion" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-white/10 space-y-4 sm:space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 sm:p-2.5 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
          <FileUp className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-bold text-white">Upload College Document</h3>
          <p className="text-xs text-slate-400">
            Ingest PDF, DOCX, TXT, or Markdown documents into the pgvector knowledge base
          </p>
        </div>
      </div>

      <form onSubmit={handleUpload} className="space-y-4">
        {/* Drag and drop box */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-5 sm:p-8 rounded-2xl border-2 border-dashed cursor-pointer transition active:scale-[0.99] ${
            isDragging
              ? "border-purple-500 bg-purple-500/10"
              : file
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-white/15 bg-slate-900/60 hover:bg-slate-900/90 hover:border-purple-500/30"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.markdown"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 mb-2 sm:mb-3">
            <Upload className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>

          {file ? (
            <div className="text-center space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-emerald-300 break-all">{file.name}</p>
              <p className="text-[11px] sm:text-xs text-slate-400">
                {(file.size / 1024 / 1024).toFixed(2)} MB • Tap to change file
              </p>
            </div>
          ) : (
            <div className="text-center space-y-1">
              <p className="text-xs sm:text-sm font-medium text-slate-200">
                Tap to browse or drop college document
              </p>
              <p className="text-[10px] sm:text-xs text-slate-400">
                Supports PDF, Word (.docx), TXT, Markdown up to 15MB
              </p>
            </div>
          )}
        </div>

        {/* Metadata Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Document Display Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Academic Regulations 2026"
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Category / Department
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm text-white focus:border-purple-500 focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Feedback message */}
        {message && (
          <div
            className={`p-3 sm:p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
              message.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="break-all">{message.text}</span>
          </div>
        )}

        {/* Submit button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!file || isUploading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 px-5 py-3 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-purple-600/25 transition active:scale-95"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing & Generating Embeddings...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Process & Ingest Document</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
