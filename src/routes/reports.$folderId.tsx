import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, Plus, Trash2, Upload, FileText, Download, Edit2, Save, X } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { DynamicIcon, IconPicker, ColorPicker } from "@/components/IconPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reports/$folderId")({
  head: () => ({
    meta: [
      { title: "Folder — Reports" },
      { name: "description", content: "Shared reports and files." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <FolderPage />
      </AppLayout>
    </RequireAuth>
  ),
});

type Folder = Tables<"report_folders">;
type Report = Tables<"reports">;
type FileRow = Tables<"report_files">;

function FolderPage() {
  const { folderId } = Route.useParams();
  const { user } = useAuth();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: f }, { data: r }, { data: fs }] = await Promise.all([
      supabase.from("report_folders").select("*").eq("id", folderId).maybeSingle(),
      supabase.from("reports").select("*").eq("folder_id", folderId).order("updated_at", { ascending: false }),
      supabase.from("report_files").select("*").eq("folder_id", folderId).order("created_at", { ascending: false }),
    ]);
    setFolder(f ?? null);
    setReports(r ?? []);
    setFiles(fs ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [folderId]);

  const newReport = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("reports")
      .insert({ folder_id: folderId, title: "Untitled report", content: "", created_by: user.id })
      .select()
      .single();
    if (error) return toast.error(error.message);
    if (data) {
      setReports((r) => [data, ...r]);
      setEditingReportId(data.id);
      setEditTitle(data.title);
      setEditContent(data.content ?? "");
    }
  };

  const startEdit = (r: Report) => {
    setEditingReportId(r.id);
    setEditTitle(r.title);
    setEditContent(r.content ?? "");
  };

  const saveReport = async () => {
    if (!editingReportId) return;
    const { error } = await supabase
      .from("reports")
      .update({ title: editTitle.trim() || "Untitled", content: editContent })
      .eq("id", editingReportId);
    if (error) return toast.error(error.message);
    setReports((rs) => rs.map((r) => r.id === editingReportId ? { ...r, title: editTitle, content: editContent } : r));
    setEditingReportId(null);
    toast.success("Saved");
  };

  const deleteReport = async (id: string) => {
    if (!confirm("Delete this report?")) return;
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setReports((rs) => rs.filter((r) => r.id !== id));
    toast.success("Deleted");
  };

  const uploadFile = async (file: File) => {
    if (!user) return;
    const path = `${folderId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("report-files").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { data, error } = await supabase
      .from("report_files")
      .insert({
        folder_id: folderId,
        name: file.name,
        storage_path: path,
        size_bytes: file.size,
        mime_type: file.type || null,
        uploaded_by: user.id,
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    if (data) setFiles((f) => [data, ...f]);
    toast.success(`Uploaded "${file.name}"`);
  };

  const downloadFile = async (f: FileRow) => {
    const { data, error } = await supabase.storage.from("report-files").createSignedUrl(f.storage_path, 60);
    if (error || !data) return toast.error(error?.message ?? "Failed");
    window.open(data.signedUrl, "_blank");
  };

  const deleteFile = async (f: FileRow) => {
    if (!confirm(`Delete "${f.name}"?`)) return;
    await supabase.storage.from("report-files").remove([f.storage_path]);
    const { error } = await supabase.from("report_files").delete().eq("id", f.id);
    if (error) return toast.error(error.message);
    setFiles((fs) => fs.filter((x) => x.id !== f.id));
    toast.success("Deleted");
  };

  const updateFolder = async (patch: Partial<Folder>) => {
    const { error } = await supabase.from("report_folders").update(patch).eq("id", folderId);
    if (error) return toast.error(error.message);
    setFolder((f) => f ? { ...f, ...patch } : f);
  };

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!folder) return <div className="p-6">Folder not found.</div>;

  return (
    <>
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/reports" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="w-9 h-9 rounded flex items-center justify-center" style={{ backgroundColor: `color-mix(in oklab, ${folder.color ?? "#3b82f6"} 20%, transparent)` }}>
            <DynamicIcon name={folder.icon} className="w-5 h-5" style={{ color: folder.color ?? "#3b82f6" } as React.CSSProperties} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate">{folder.name}</h1>
            <div className="text-xs text-muted-foreground truncate">{folder.description || "No description"}</div>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
          <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit folder
        </Button>
      </header>

      <Tabs defaultValue="reports" className="flex-1 flex flex-col">
        <div className="border-b border-border px-6 bg-card">
          <TabsList className="bg-transparent p-0 h-10">
            <TabsTrigger value="reports" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">
              Reports ({reports.length})
            </TabsTrigger>
            <TabsTrigger value="files" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none">
              Files ({files.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="reports" className="flex-1 overflow-auto p-6 m-0">
          <div className="flex items-center justify-end mb-4">
            <Button size="sm" onClick={newReport}><Plus className="w-4 h-4 mr-1.5" /> New report</Button>
          </div>
          {reports.length === 0 ? (
            <Card className="p-12 text-center">
              <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No reports yet.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <Card key={r.id} className="p-4">
                  {editingReportId === r.id ? (
                    <div className="space-y-2">
                      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-base font-semibold" />
                      <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={8} placeholder="Write your report…" className="text-sm font-mono" />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditingReportId(null)}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
                        <Button size="sm" onClick={saveReport}><Save className="w-3.5 h-3.5 mr-1" /> Save</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-semibold text-base">{r.title}</h3>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}><Edit2 className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteReport(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-foreground/80">{r.content || <span className="italic text-muted-foreground">Empty</span>}</p>
                      <div className="text-[10px] text-muted-foreground mt-3">Updated {new Date(r.updated_at).toLocaleString()}</div>
                    </>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="files" className="flex-1 overflow-auto p-6 m-0">
          <div className="flex items-center justify-end mb-4">
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-1.5" /> Upload file</Button>
          </div>
          {files.length === 0 ? (
            <Card className="p-12 text-center">
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No files yet.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="divide-y divide-border">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/30">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{f.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatBytes(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadFile(f)}><Download className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteFile(f)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit folder</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input defaultValue={folder.name} onBlur={(e) => e.target.value !== folder.name && updateFolder({ name: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea defaultValue={folder.description ?? ""} onBlur={(e) => updateFolder({ description: e.target.value || null })} rows={2} className="mt-1" />
            </div>
            <div>
              <Label>Color</Label>
              <div className="mt-1.5"><ColorPicker value={folder.color ?? "#3b82f6"} onChange={(v) => updateFolder({ color: v })} /></div>
            </div>
            <div>
              <Label>Icon</Label>
              <div className="mt-1.5"><IconPicker value={folder.icon ?? "folder"} onChange={(v) => updateFolder({ icon: v })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={() => setSettingsOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatBytes(b: number | null) {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}