import { useRef, useState } from 'react';
import { Button } from './Button';

// Shrink a picture in the browser before it is stored: longest side at
// most `max` pixels. PNG keeps a transparent background; a picture still
// too heavy as PNG is flattened onto white and saved as JPEG.
export function resizeImage(file: File, max: number, maxChars = Infinity): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let data = canvas.toDataURL('image/png');
      if (data.length > maxChars) {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        data = canvas.toDataURL('image/jpeg', 0.85);
      }
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

// A picture with Upload / Change / Remove, for logos and signatures.
export default function ImageUpload({ value, onChange, noun, max = 512, maxChars, width = 140, height = 72 }: {
  value: string;
  onChange: (data: string) => void;
  noun: string;          // "logo", "signature"
  max?: number;
  maxChars?: number;
  width?: number;
  height?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      onChange(await resizeImage(file, max, maxChars));
      setError('');
    } catch {
      setError('Could not read that image');
    }
  };

  return (
    <div className="cluster pd-image-upload">
      {/* Frame size comes from the caller's width/height props. */}
      <div className="pd-image-frame" style={{ width, height }}>
        {value
          ? <img src={value} alt={noun} />
          : <span className="text-sm-muted">No {noun}</span>}
      </div>
      <div className="cluster">
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          {value ? `Change ${noun}` : `Upload ${noun}`}
        </Button>
        {value && <Button variant="ghost" size="sm" onClick={() => onChange('')}>Remove</Button>}
        {error && <span className="pd-error-text">{error}</span>}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
      </div>
    </div>
  );
}
