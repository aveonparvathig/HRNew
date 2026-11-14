import { prisma } from '../config/database';

export interface OrgBrand {
  name: string;
  tagline: string;
  addressLine: string;
  phone: string;
  email: string;
  website: string;
  logoData: string;
  brandPrimary: string;
  brandAccent: string;
  signatoryName: string;
  signatoryDesignation: string;
  signatureData: string;
  logoPosition: string; // LEFT | CENTER | RIGHT
  clientLogos: { name: string; logoUri: string }[]; // custom proposal client logos
  // Address parts + GSTIN, for documents that print them separately (proforma)
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstin?: string;
}

export async function orgBrand(organizationId: string): Promise<OrgBrand> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  // The address may span lines (proforma prints them); one-line uses get commas
  const street = String(org?.address || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(', ');
  const addressLine = [street, org?.city, org?.state, org?.country]
    .filter(Boolean).join(', ');
  return {
    name: org?.name || 'Organization',
    tagline: org?.tagline || '',
    addressLine,
    phone: org?.phone || '',
    email: org?.email || '',
    website: org?.website || '',
    logoData: org?.logoData || '',
    brandPrimary: org?.brandPrimary || '#4f46e5',
    brandAccent: org?.brandAccent || '#312e81',
    signatoryName: org?.signatoryName || '',
    signatoryDesignation: org?.signatoryDesignation || '',
    signatureData: org?.signatureData || '',
    logoPosition: org?.logoPosition || 'LEFT',
    clientLogos: Array.isArray(org?.clientLogos) ? (org!.clientLogos as any) : [],
    address: org?.address || '',
    city: org?.city || '',
    state: org?.state || '',
    pincode: org?.pincode || '',
    country: org?.country || '',
    gstin: org?.gstin || '',
  };
}

// A signature image for the line someone signs on; empty when there is none.
export const signatureImg = (data: string | null | undefined, height = 44) =>
  (data ? `<img src="${data}" alt="" style="height:${height}px;max-width:200px;object-fit:contain;display:block;"/>` : '');

export const brandContactLine = (b: OrgBrand) =>
  [b.phone, b.email, b.website].filter(Boolean).join(' · ');
