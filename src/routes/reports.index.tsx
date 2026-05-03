import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Upload, Download, Folder, FileText, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listDrive, getDriveDownloadUrl, uploadToDrive, type DriveFile } from "@/server/drive.functions";

export const Route = createFileRoute("/reports/")({
  head: () => ({
    meta: [
      { title: "Reports — Google Drive" },
      { name: "description", content: "Browse and upload reports stored in Google Drive." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <ReportsPage />
      </AppLayout>
    </RequireAuth>
  ),
});

type Crumb = { id: string; name: string };

function formatSize(s?: string) {
  if (!s) return "";
  const n = Number(s);
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function ReportsPage() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: "root", name: "My Drive" }]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const currentId = crumbs[crumbs.length - 1].id;

  const load = useCallback(async (folderId: string) => {
    setLoading(true);
    try {
      const res = await listDrive({ data: { folderId } });
      setFiles(res.files);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load Drive");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(currentId); }, [currentId, load]);

  const openFolder = (f: DriveFile) => {
    setCrumbs((c) => [...c, { id: f.id, name: f.name }]);
  };
  const goTo = (idx: number) => setCrumbs((c) => c.slice(0, idx + 1));

  const download = async (f: DriveFile) => {
    if (f.mimeType.startsWith("application/vnd.google-apps")) {
      if (f.webViewLink) window.open(f.webViewLink, "_blank");
      else toast.error("Google native files must be opened in Drive");
      return;
    }
    try {
      toast.info("Preparing download…");
      const res = await getDriveDownloadUrl({ data: { fileId: f.id } });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.name; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast.error("Max 20MB per file");
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      const base64 = btoa(bin);
      await uploadToDrive({
        data: {
          folderId: currentId,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          base64,
        },
      });
      toast.success("Uploaded");
      load(currentId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center justify-between bg-card">
        <div className="flex items-center gap-2 min-w-0">
          {crumbs.length > 1 && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => goTo(crumbs.length - 2)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
          <h1 className="text-base font-semibold tracking-tight">Reports</h1>
          <nav className="text-sm text-muted-foreground flex items-center gap-1 min-w-0 ml-2 truncate">
            {crumbs.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1 min-w-0">
                <button onClick={() => goTo(i)} className="hover:text-foreground truncate max-w-[200px]">
                  {c.name}
                </button>
                {i < crumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => load(currentId)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <input ref={fileInput} type="file" className="hidden" onChange={onPick} />
          <Button size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
            <Upload className="w-4 h-4 mr-1.5" /> {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </header>
      <div className="p-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading Drive…</div>
        ) : files.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-base font-semibold">This folder is empty</h2>
            <p className="text-sm text-muted-foreground mb-4">Upload a file to get started.</p>
            <Button onClick={() => fileInput.current?.click()}><Upload className="w-4 h-4 mr-1.5" /> Upload</Button>
          </Card>
        ) : (
          <div className="border border-border rounded-md overflow-hidden bg-card">
            <div className="grid grid-cols-[1fr_120px_180px_120px] px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border">
              <div>Name</div><div>Size</div><div>Modified</div><div className="text-right">Actions</div>
            </div>
            {files.map((f) => {
              const isFolder = f.mimeType === "application/vnd.google-apps.folder";
              return (
                <div key={f.id} className="grid grid-cols-[1fr_120px_180px_120px] px-4 py-2 items-center border-b border-border last:border-0 hover:bg-muted/40">
                  <button onClick={() => isFolder ? openFolder(f) : download(f)} className="flex items-center gap-2 min-w-0 text-left">
                    {isFolder ? <Folder className="w-4 h-4 text-primary shrink-0" /> : <FileText className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <span className="truncate text-sm">{f.name}</span>
                  </button>
                  <div className="text-xs text-muted-foreground">{isFolder ? "—" : formatSize(f.size)}</div>
                  <div className="text-xs text-muted-foreground">{f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : ""}</div>
                  <div className="flex justify-end gap-1">
                    {f.webViewLink && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(f.webViewLink, "_blank")} title="Open in Drive">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {!isFolder && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => download(f)} title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}