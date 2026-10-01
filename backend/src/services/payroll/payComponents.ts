// The pay-component catalogue: the starter list, and the components that
// arrears and final settlements write payslip lines against.
import { prisma } from '../../config/database';

// Starter catalogue for a new organization — the usual one-off pay items.
export const DEFAULT_COMPONENTS: [string, string, string][] = [
  ['BONUS', 'Bonus', 'EARNING'],
  ['INCENTIVE', 'Incentive', 'EARNING'],
  ['PERFORMANCE_BONUS', 'Performance Bonus', 'EARNING'],
  ['OVERTIME', 'Overtime', 'EARNING'],
  ['JOINING_BONUS', 'Joining Bonus', 'EARNING'],
  ['REFERRAL_BONUS', 'Referral Bonus', 'EARNING'],
  ['RELOCATION_BONUS', 'Relocation Bonus', 'EARNING'],
  ['VARIABLE_PAY', 'Variable Pay', 'EARNING'],
  ['LEAVE_ENCASHMENT', 'Leave Encashment', 'EARNING'],
  ['OTHER_EARNINGS', 'Other Earnings', 'EARNING'],
  ['OTHER_DEDUCTION', 'Other Deduction', 'DEDUCTION'],
  ['NOTICE_PAY_RECOVERY', 'Notice Period Recovery', 'DEDUCTION'],
];

export async function ensureDefaultComponents(organizationId: string) {
  const existing = await prisma.payComponent.count({ where: { organizationId } });
  if (existing > 0) return;
  await prisma.payComponent.createMany({
    data: DEFAULT_COMPONENTS.map(([code, name, type], i) => ({
      organizationId, code, name, type, taxable: type === 'EARNING', sortOrder: i,
    })),
    skipDuplicates: true,
  });
}

// Components whose lines the system writes itself. Gratuity is not taxed:
// what the formula gives is within the exempt limit.
const MANAGED: Record<string, { name: string; type: string; taxable: boolean }> = {
  SALARY_ARREARS: { name: 'Salary Arrears', type: 'EARNING', taxable: true },
  PF_ON_ARREARS: { name: 'PF on Arrears', type: 'DEDUCTION', taxable: true },
  ESI_ON_ARREARS: { name: 'ESI on Arrears', type: 'DEDUCTION', taxable: true },
  LEAVE_ENCASHMENT: { name: 'Leave Encashment', type: 'EARNING', taxable: true },
  GRATUITY: { name: 'Gratuity', type: 'EARNING', taxable: false },
  NOTICE_PAY: { name: 'Notice Pay', type: 'EARNING', taxable: true },
  NOTICE_PAY_RECOVERY: { name: 'Notice Period Recovery', type: 'DEDUCTION', taxable: true },
  SETTLEMENT_ADJUSTMENT: { name: 'Settlement Adjustment', type: 'EARNING', taxable: true },
  SETTLEMENT_RECOVERY: { name: 'Settlement Recovery', type: 'DEDUCTION', taxable: true },
};
export type ManagedCode = keyof typeof MANAGED;

// The catalogue component for a managed code, created on first use.
export async function managedComponent(organizationId: string, code: string) {
  await ensureDefaultComponents(organizationId);
  const found = await prisma.payComponent.findUnique({ where: { organizationId_code: { organizationId, code } } });
  if (found) return found;
  const def = MANAGED[code];
  if (!def) throw new Error(`Unknown managed component ${code}`);
  const last = await prisma.payComponent.findFirst({ where: { organizationId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  return prisma.payComponent.create({
    data: { organizationId, code, name: def.name, type: def.type, taxable: def.taxable, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
}

// Write the lines a feature owns on a payslip: one per code with an amount,
// none where the amount is nil. A line typed by hand for the same component
// is taken over. The entry must be recomputed afterwards.
export async function writeManagedLines(
  organizationId: string, entryId: string, source: 'ARREAR' | 'SETTLEMENT', amounts: Record<string, number>,
) {
  for (const [code, raw] of Object.entries(amounts)) {
    const amount = Math.round(Number(raw || 0) * 100) / 100;
    // A component joins the catalogue only when a line first needs it
    const component = amount > 0
      ? await managedComponent(organizationId, code)
      : await prisma.payComponent.findUnique({ where: { organizationId_code: { organizationId, code } } });
    if (!component) continue;
    if (amount > 0) {
      await prisma.payslipLine.upsert({
        where: { entryId_componentId: { entryId, componentId: component.id } },
        create: { organizationId, entryId, componentId: component.id, name: component.name, type: component.type, amount, source },
        update: { amount, source, name: component.name, type: component.type },
      });
    } else {
      await prisma.payslipLine.deleteMany({ where: { entryId, componentId: component.id, source } });
    }
  }
}
