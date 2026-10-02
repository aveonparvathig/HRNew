import { useState } from 'react';
import type { ReactNode } from 'react';
import { downloadFile } from '../api/files';
import { toast } from './feedback';

// A button that fetches a file from the API and saves it. Making a PDF
// takes a moment, so the button says so while it works.
export default function DownloadButton({ path, params, children, className = 'btn btn-secondary', busyLabel = 'Preparing…', onDone }: {
  path: string;
  params?: Record<string, string>;
  children: ReactNode;
  className?: string;
  busyLabel?: string;
  onDone?: (result: { filename: string; headers: Record<string, string> }) => void;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await downloadFile(path, params);
      onDone?.(result);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} disabled={busy} onClick={run}>
      {busy ? busyLabel : children}
    </button>
  );
}
