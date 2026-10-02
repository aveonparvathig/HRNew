import apiClient from './client';

// A file picked on a form, as the data URI the API stores.
export const readFileAsDataUri = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read the file'));
  reader.readAsDataURL(file);
});

// Opens a stored file (a data URI) in a new tab.
export function openDataFile(fileData: string) {
  const [head, body] = fileData.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  const bytes = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  window.open(URL.createObjectURL(new Blob([bytes], { type })), '_blank');
}

// Fetch a file from the API and hand it to the browser to save. The
// server names the file. Returns the response headers, which carry counts
// for some downloads (X-Included, X-Skipped).
export async function downloadFile(path: string, params?: Record<string, string>) {
  try {
    const res = await apiClient.get(path, { params, responseType: 'blob' });
    const named = res.headers['x-file-name'];
    const filename = named ? decodeURIComponent(named) : path.split('/').pop() || 'download';
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return { filename, headers: res.headers as Record<string, string> };
  } catch (err: any) {
    // With a blob response the server's error message arrives as a blob too
    const body = err.response?.data;
    if (body instanceof Blob) {
      let message = '';
      try { message = JSON.parse(await body.text()).error; } catch { /* not JSON */ }
      throw new Error(message || 'Could not prepare the file');
    }
    throw new Error(err.response?.data?.error || 'Could not prepare the file');
  }
}
