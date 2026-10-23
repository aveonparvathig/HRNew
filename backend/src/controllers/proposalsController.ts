import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { CATALOG } from '../data/proposalCatalog';
import { FEATURED_CLIENTS } from '../data/cmsClients';
import { renderProposalHtml } from '../services/proposalService';
import { renderCmsFeatureDoc } from '../services/cmsFeatureDoc';
import { orgBrand } from '../services/orgBrand';

// MARKETING users only ever see proposals they generated themselves
const ownScope = (req: any) => {
  const actor = req.actor;
  return actor?.role === 'MARKETING' ? { createdById: actor.id } : {};
};

export const proposalsController = {
  // Catalog for the builder UI (modules trimmed of long feature lists)
  async getCatalog(req: any, res: Response) {
    const modules: Record<string, any> = {};
    for (const [code, m] of Object.entries<any>(CATALOG.modules)) {
      modules[code] = {
        code,
        name: m.name,
        category: m.category,
        icon: m.icon || '',
        color: m.color || '#1565C0',
        shortDesc: m.short_desc || '',
        price: m.default_price_per_student || 0,
        featureCount: (m.sub_features || []).length,
        tag: m.tag || '',
      };
    }
    const bundles: Record<string, any> = {};
    for (const [code, b] of Object.entries<any>(CATALOG.bundles)) {
      bundles[code] = {
        code,
        name: b.name,
        tagline: b.tagline || '',
        modules: b.modules,
        price: b.bundle_price_per_student,
        standaloneTotal: b.standalone_total,
        oneTimeFee: b.one_time_implementation_fee || 0,
        waiveDefault: Boolean(b.waive_one_time_default),
        heroColor: b.hero_color,
      };
    }
    res.json({ modules, bundles, categories: CATALOG.categories, clients: FEATURED_CLIENTS.map(c => c.name) });
  },

  // Render the document for the builder's live preview — nothing is saved.
  async preview(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const d = req.body || {};
    const clientName = String(d.clientName || '').trim() || 'Your Institution';
    const brand = await orgBrand(orgId);
    const { html, pricing } = renderProposalHtml(brand, { ...d, clientName });
    res.json({ html, grandTotal: pricing.grandTotal });
  },

  async generate(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const d = req.body || {};
    const clientName = String(d.clientName || '').trim();
    if (!clientName) throw new AppError(400, 'Client name is required');
    if (d.selectionMode === 'BUNDLE' && !CATALOG.bundles[d.bundle]) {
      throw new AppError(400, 'Pick a bundle');
    }
    if (d.selectionMode !== 'BUNDLE' && !(d.selectedModules || []).length) {
      throw new AppError(400, 'Select at least one module');
    }

    const brand = await orgBrand(orgId);
    const { html, pricing, selectionLabel } = renderProposalHtml(brand, { ...d, clientName });

    // Revision chain per client (case-insensitive match, like the original)
    const last = await prisma.proposalRecord.findFirst({
      where: { organizationId: orgId, clientName: { equals: clientName, mode: 'insensitive' } },
      orderBy: { revision: 'desc' },
    });

    const record = await prisma.proposalRecord.create({
      data: {
        organizationId: orgId,
        clientName,
        revision: (last?.revision || 0) + 1,
        selectionLabel,
        totalAmount: pricing.grandTotal,
        formData: d,
        html,
        createdById: (req as any).actor?.id || null,
      },
    });
    res.status(201).json({
      id: record.id,
      clientName: record.clientName,
      revision: record.revision,
      selectionLabel: record.selectionLabel,
      totalAmount: record.totalAmount,
    });
  },

  async getHistory(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const q = String(req.query.q || '').trim();
    const records = await prisma.proposalRecord.findMany({
      where: {
        organizationId: orgId,
        ...ownScope(req),
        ...(q ? { clientName: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true, clientName: true, revision: true, selectionLabel: true,
        totalAmount: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ records, total: records.length });
  },

  async getRecord(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const record = await prisma.proposalRecord.findFirst({
      where: { id: req.params.recordId, organizationId: orgId, ...ownScope(req) },
    });
    if (!record) throw new AppError(404, 'Proposal not found');
    // Full revision chain for this client so the viewer can jump between revisions
    const revisions = await prisma.proposalRecord.findMany({
      where: {
        organizationId: orgId,
        ...ownScope(req),
        clientName: { equals: record.clientName, mode: 'insensitive' },
      },
      select: { id: true, revision: true, totalAmount: true, selectionLabel: true, createdAt: true },
      orderBy: { revision: 'asc' },
    });
    // Re-render the HTML from the stored inputs so template and layout fixes
    // apply to existing proposals too — record.html is only a frozen snapshot
    // from creation time. Fall back to the snapshot if a legacy record has no
    // usable formData.
    let html = record.html;
    if (record.formData && typeof record.formData === 'object') {
      try {
        const brand = await orgBrand(orgId);
        html = renderProposalHtml(brand, { ...(record.formData as any), clientName: record.clientName }).html;
      } catch { /* keep the stored snapshot */ }
    }
    res.json({ ...record, html, revisions });
  },

  // Print-ready CMS ERP product specifications document (16 chapters,
  // every module's full 9-part spec) — for demos, tenders and RFP responses.
  async getCmsFeatures(req: any, res: Response) {
    const brand = await orgBrand(req.user?.organizationId);
    res.json({
      html: renderCmsFeatureDoc(brand),
      filename: 'Aveon_CMS_ERP_Product_Specifications_v2026.html',
    });
  },

  async deleteRecord(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const record = await prisma.proposalRecord.findFirst({
      where: { id: req.params.recordId, organizationId: orgId },
    });
    if (!record) throw new AppError(404, 'Proposal not found');
    await prisma.proposalRecord.delete({ where: { id: record.id } });
    res.json({ message: `Deleted ${record.clientName} Rev ${record.revision}` });
  },
};
