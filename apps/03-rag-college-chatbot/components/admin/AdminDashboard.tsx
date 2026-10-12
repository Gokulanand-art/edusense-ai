"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { ShieldCheck, RefreshCw, AlertCircle, Database, Layers, Sparkles } from "lucide-react";
import { AnalyticsCards } from "./AnalyticsCards";
import { DocumentUploader } from "./DocumentUploader";
import { DocumentTable, DocumentRow } from "./DocumentTable";

export function AdminDashboard() {
  const { data: session } = useSession();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const [docsRes, analyticsRes] = await Promise.all([
        fetch("/api/admin/documents"),
        fetch("/api/admin/analytics"),
      ]);

      if (docsRes.ok) {
        const docsData = await docsRes.json();
        setDocuments(docsData.documents || []);
      }

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData.analytics || null);
      }
    } catch (err) {
      console.error("Failed to load admin data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div className="container mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-5 sm:pb-6">
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-xl shadow-purple-600/30 shrink-0">
            <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="truncate">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">Admin Knowledge Portal</h1>
              <span className="hidden sm:inline-block rounded-full bg-purple-500/20 px-2.5 py-0.5 text-xs font-semibold text-purple-300 border border-purple-500/30 shrink-0">
                Authorized Admin
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate sm:whitespace-normal">
              Manage college documents, trigger RAG re-indexing, and monitor system analytics
            </p>
          </div>
        </div>

        <button
          onClick={fetchDashboardData}
          disabled={isLoading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 sm:py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Analytics Cards */}
      <AnalyticsCards analytics={analytics} />

      {/* Upload Document Section */}
      <DocumentUploader onSuccess={fetchDashboardData} />

      {/* Document Table Section */}
      <DocumentTable documents={documents} onRefresh={fetchDashboardData} />
    </div>
  );
}
