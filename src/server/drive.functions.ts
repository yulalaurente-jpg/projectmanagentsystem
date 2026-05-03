import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const UPLOAD = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files";

function authHeaders() {
  const lk = process.env.LOVABLE_API_KEY;
  const dk = process.env.GOOGLE_DRIVE_API_KEY;
  if (!lk) throw new Error("LOVABLE_API_KEY is not configured");
  if (!dk) throw new Error("GOOGLE_DRIVE_API_KEY is not configured");
  return {
    Authorization: `Bearer ${lk}`,
    "X-Connection-Api-Key": dk,
  } as Record<string, string>;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  iconLink?: string;
  webViewLink?: string;
  parents?: string[];
};

export const listDrive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { folderId?: string } | undefined) => ({
    folderId: input?.folderId && typeof input.folderId === "string" ? input.folderId : "root",
  }))
  .handler(async ({ data }) => {
    const q = encodeURIComponent(`'${data.folderId}' in parents and trashed = false`);
    const fields = encodeURIComponent(
      "files(id,name,mimeType,size,modifiedTime,iconLink,webViewLink,parents)"
    );
    const url = `${GATEWAY}/files?q=${q}&fields=${fields}&pageSize=200&orderBy=folder,name`;
    const res = await fetch(url, { headers: authHeaders() });
    const body = await res.text();
    if (!res.ok) throw new Error(`Drive list failed [${res.status}]: ${body}`);
    const json = JSON.parse(body) as { files: DriveFile[] };

    // Resolve folder name + parent for breadcrumbs
    let folder: { id: string; name: string; parents?: string[] } | null = null;
    if (data.folderId !== "root") {
      const fRes = await fetch(
        `${GATEWAY}/files/${data.folderId}?fields=id,name,parents`,
        { headers: authHeaders() }
      );
      if (fRes.ok) folder = await fRes.json();
    }
    return { files: json.files ?? [], folder };
  });

export const getDriveDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => {
    if (!input?.fileId || typeof input.fileId !== "string") throw new Error("fileId required");
    return input;
  })
  .handler(async ({ data }) => {
    // Fetch the file content via gateway, return as base64 data URL for browser download.
    const metaRes = await fetch(
      `${GATEWAY}/files/${data.fileId}?fields=name,mimeType`,
      { headers: authHeaders() }
    );
    if (!metaRes.ok) throw new Error(`Drive meta failed [${metaRes.status}]`);
    const meta = (await metaRes.json()) as { name: string; mimeType: string };

    const dlRes = await fetch(`${GATEWAY}/files/${data.fileId}?alt=media`, {
      headers: authHeaders(),
    });
    if (!dlRes.ok) throw new Error(`Drive download failed [${dlRes.status}]`);
    const buf = new Uint8Array(await dlRes.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    return { name: meta.name, mimeType: meta.mimeType, base64: b64 };
  });

export const uploadToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { folderId?: string; name: string; mimeType: string; base64: string }) => {
    if (!input?.name || !input?.mimeType || !input?.base64) throw new Error("Invalid upload payload");
    return {
      folderId: input.folderId && input.folderId !== "root" ? input.folderId : undefined,
      name: input.name,
      mimeType: input.mimeType,
      base64: input.base64,
    };
  })
  .handler(async ({ data }) => {
    const metadata: Record<string, unknown> = { name: data.name, mimeType: data.mimeType };
    if (data.folderId) metadata.parents = [data.folderId];

    const boundary = "lovable-" + Math.random().toString(36).slice(2);
    const bin = atob(data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\nContent-Type: ${data.mimeType}\r\n\r\n`
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head, 0);
    body.set(bytes, head.length);
    body.set(tail, head.length + bytes.length);

    const res = await fetch(`${UPLOAD}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Drive upload failed [${res.status}]: ${text}`);
    return JSON.parse(text);
  });