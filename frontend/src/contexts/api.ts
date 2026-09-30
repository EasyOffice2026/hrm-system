function _injectBrandId(path: string): string {
  // Auto-inject brand_id query param from localStorage
  const saved = localStorage.getItem("selectedBrandId");
  if (!saved || saved === "group") return path; // group = no filter
  if (path.includes("all_brands=1")) return path; // explicit cross-brand request
  if (path.includes("brand_id=")) return path; // already specified
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}brand_id=${saved}`;
}

function _injectBrandIdForm(body: FormData | URLSearchParams): void {
  const saved = localStorage.getItem("selectedBrandId");
  if (!saved || saved === "group") return;
  if (!body.has("brand_id")) {
    body.append("brand_id", saved);
  }
}

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  // Auto-inject brand_id for GET requests
  const finalPath = (!opts.method || opts.method === "GET") ? _injectBrandId(path) : path;

  const res = await fetch(finalPath, { ...opts, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
  }
  return res;
}

export async function apiGet(path: string) {
  const res = await apiFetch(path);
  return res.json();
}

export async function apiPost(path: string, body: FormData | URLSearchParams) {
  _injectBrandIdForm(body);
  const res = await apiFetch(path, { method: "POST", body });
  return res.json();
}

export async function apiPut(path: string, body: FormData | URLSearchParams) {
  const res = await apiFetch(path, { method: "PUT", body });
  return res.json();
}

export async function apiDelete(path: string) {
  const res = await apiFetch(path, { method: "DELETE" });
  return res.json();
}

export async function apiDownload(path: string, filename: string) {
  const res = await apiFetch(path);
  if (!res.ok) {
    alert("Export failed");
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
