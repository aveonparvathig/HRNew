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
}

export async function orgBrand(organizationId: string): Promise<OrgBrand> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  const addressLine = [org?.address, org?.city, org?.state, org?.country]
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
  };
}

export const brandContactLine = (b: OrgBrand) =>
  [b.phone, b.email, b.website].filter(Boolean).join(' · ');
