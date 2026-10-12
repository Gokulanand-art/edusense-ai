"use client";

import { useState } from "react";
import {
  FileText,
  Trash2,
  RefreshCw,
  Eye,
  CheckCircle,
  AlertCircle,
  Clock,
  Layers,
  Search,
  Filter,
} from "lucide-react";
import { formatBytes, formatDate } from "@/lib/utils/utils";
import { ChunkViewerModal } from "./ChunkViewerModal";

export interface DocumentRow {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  category: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  errorMessage?: string | null;
  createdAt: string;
  _count: {
    chunks: number;
  };
}

interface DocumentTableProps {
  documents: DocumentRow[];
  onRefresh: () => void;
}

export function DocumentTable({ documents, onRefresh }: DocumentTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [selectedDocForChunks, setSelectedDocForChunks] = useState<any | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.fileName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "All" || doc.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleViewChunks = async (docId: string) => {
    setLoadingDocId(docId);
    try {
      const res = await fetch(`/api/admin/documents/${docId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedDocForChunks(data.document);
      }
    } catch (err) {
      console.error("Failed to fetch chunks:", err);
    } finally {
      setLoadingDocId(null);
    }
  };

  const handleReprocess = async (docId: string, title: string) => {
    if (!confirm(`Are you sure you want to re-extract and re-embed "${title}"?`)) return;

    setLoadingDocId(docId);
    setActionMessage(`Reprocessing "${title}"...`);
    try {
      const res = await fetch(`/api/admin/documents/${docId}/reprocess`, { method: "POST" });
      if (res.ok) {
        setActionMessage(`"${title}" reprocessed successfully!`);
        onRefresh();
      } else {
        const data = await res.json();
        alert(`Reprocess failed: ${data.error}`);
      }
    } catch (err) {
      alert("Failed to reprocess document");
    } finally {
      setLoadingDocId(null);
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const handleDelete = async (docId: string, title: string) => {
    if (!confirm(`Delete "${title}" and all its vector chunks permanently?`)) return;

    try {
      const res = await fetch(`/api/admin/documents/${docId}`, { method: "DELETE" });
      if (res.ok) {
        onRefresh();
      } else {
        const data = await res.json();
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err) {
      alert("Failed to delete document");
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-white/10 space-y-4 sm:space-y-5">
      {/* Table Header & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-white">Document Knowledge Base</h3>
          <p className="text-xs text-slate-400">
            Official documents ingested and indexed into PostgreSQL pgvector
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search documents..."
              className="w-full rounded-xl border border-white/10 bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none"
            />
          </div>

          <button
            onClick={onRefresh}
            className="p-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition active:scale-95 shrink-0"
            title="Refresh list"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs text-purple-300">
          {actionMessage}
        </div>
      )}

      {/* Desktop / Tablet Table View */}
      <div className="overflow-x-auto rounded-xl border border-white/10 -mx-1 sm:mx-0">
        <table className="w-full text-left text-xs min-w-[640px]">
          <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[10px] border-b border-white/10">
            <tr>
              <th className="px-3.5 sm:px-4 py-3">Document</th>
              <th className="px-3 sm:px-4 py-3">Category</th>
              <th className="px-3 sm:px-4 py-3">Format & Size</th>
              <th className="px-3 sm:px-4 py-3">Chunks</th>
              <th className="px-3 sm:px-4 py-3">Status</th>
              <th className="px-3 sm:px-4 py-3">Ingested</th>
              <th className="px-3 sm:px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 bg-slate-950/40 text-slate-300">
            {filteredDocs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No documents found matching the filters.
                </td>
              </tr>
            ) : (
              filteredDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-white/5 transition">
                  <td className="px-3.5 sm:px-4 py-3.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate max-w-[180px] sm:max-w-xs">{doc.title}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px] sm:max-w-xs">{doc.fileName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-3.5">
                    <span className="rounded-md bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-300 border border-indigo-500/20 whitespace-nowrap">
                      {doc.category}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-3.5 text-slate-400 whitespace-nowrap">
                    <span className="font-mono text-slate-200">{doc.fileType}</span> •{" "}
                    {formatBytes(doc.fileSize)}
                  </td>
                  <td className="px-3 sm:px-4 py-3.5 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 font-mono text-slate-300">
                      <Layers className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                      {doc._count?.chunks || 0} chunks
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-3.5 whitespace-nowrap">
                    {doc.status === "READY" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                        <CheckCircle className="h-3 w-3" /> Ready
                      </span>
                    )}
                    {doc.status === "PROCESSING" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20 animate-pulse">
                        <Clock className="h-3 w-3" /> Processing
                      </span>
                    )}
                    {doc.status === "FAILED" && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400 border border-red-500/20"
                        title={doc.errorMessage || "Processing failed"}
                      >
                        <AlertCircle className="h-3 w-3" /> Failed
                      </span>
                    )}
                    {doc.status === "PENDING" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-500/20">
                        Pending
                      </span>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-3.5 text-[11px] text-slate-500 whitespace-nowrap">
                    {formatDate(doc.createdAt)}
                  </td>
                  <td className="px-3 sm:px-4 py-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleViewChunks(doc.id)}
                        disabled={loadingDocId === doc.id}
                        className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-purple-300 hover:bg-purple-500/10 transition active:scale-95"
                        title="View Chunks"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleReprocess(doc.id, doc.title)}
                        disabled={loadingDocId === doc.id}
                        className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-indigo-300 hover:bg-indigo-500/10 transition active:scale-95"
                        title="Reprocess Document"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingDocId === doc.id ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id, doc.title)}
                        className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition active:scale-95"
                        title="Delete Document"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Chunk Viewer Modal */}
      <ChunkViewerModal
        document={selectedDocForChunks}
        isOpen={!!selectedDocForChunks}
        onClose={() => setSelectedDocForChunks(null)}
      />
    </div>
  );
}
