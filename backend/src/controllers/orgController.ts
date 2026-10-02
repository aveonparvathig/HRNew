import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { INDIAN_STATES } from '../services/payroll/constants';
import { IMAGE_DATA_URI, LOGO_POSITIONS, MAX_SIGNATURE_CHARS } from '../services/masters';
import {
  LOGIN_RESULT_LABELS, POLICY_LABELS, POLICY_LIMITS, PasswordPolicyLike, ROLES,
  expiryState, lockState, passwordProblem, policyInput, tempPasswordExpired,
} from '../services/passwordPolicy';
import { LOGIN_EVENT_DAYS, policyFor, setPassword } from '../services/accountSecurity';
import { actorName, logPayrollAudit } from '../services/payroll/audit';
import { MAIL_SECURITY, mailProblem, mailSettingsFor, mailSettingsJSON, sendMail } from '../services/mailer';
import { seal } from '../services/secretBox';
import { pdfEngine } from '../services/pdf';
import { isEmail } from '../services/payroll/payslipFiles';
import { sendWelcomeMail } from '../services/notifications';

const str = (v: any) => String(v ?? '');


async function requireOwner(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'Only a Super Admin can do this');
  }
  return user;
}

const POLICY_KEYS = Object.keys(POLICY_LIMITS) as (keyof PasswordPolicyLike)[];
const policyJSON = (p: any) => Object.fromEntries(POLICY_KEYS.map(k => [k, p[k]]));

// Where a member's sign-in stands under the policy
function securityOf(u: any, policy: PasswordPolicyLike, now: Date) {
  const lock = lockState(u.lockedUntil, now);
  const expiry = expiryState(policy, u.passwordChangedAt, now);
  return {
    lastLoginAt: u.lastLoginAt || null,
    failedAttempts: lock.locked || !u.lockedUntil ? u.failedAttempts : 0,
    locked: lock.locked,
    lockedUntil: lock.locked && !lock.indefinite ? lock.until : null,
    passwordChangedAt: u.passwordChangedAt || null,
    passwordExpired: expiry.expired,
    passwordDaysLeft: expiry.daysLeft,
    tempPasswordExpired: tempPasswordExpired(policy, u.mustChangePassword, u.passwordChangedAt, now),
  };
}

const memberJSON = (u: any, policy?: PasswordPolicyLike) => ({
  ...(policy ? securityOf(u, policy, new Date()) : {}),
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  role: u.role,
  isActive: u.isActive,
  personId: u.personId || null,
  personName: u.person?.name || null,
  mustChangePassword: u.mustChangePassword || false,
  createdAt: u.createdAt,
});

// Readable random temp password, e.g. "kite-9382-lamp"
function tempPassword(): string {
  const words = ['kite', 'lamp', 'rock', 'leaf', 'moon', 'star', 'wave', 'fern', 'sand', 'bell',
    'drum', 'gate', 'hill', 'iris', 'jade', 'knot', 'lion', 'mint', 'nest', 'opal'];
  const w = () => words[Math.floor(Math.random() * words.length)];
  return `${w()}-${1000 + Math.floor(Math.random() * 9000)}-${w()}`;
}

export const orgController = {
  // ---- Company profile ---------------------------------------------------
  async getProfile(req: any, res: Response) {
    const org = await prisma.organization.findUnique({
      where: { id: req.user?.organizationId },
    });
    if (!org) throw new AppError(404, 'Organization not found');
    res.json({ ...org, states: INDIAN_STATES });
  },

  async updateProfile(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const b = req.body;
    const data: any = {};
    if (b.name !== undefined) {
      const name = str(b.name).trim();
      if (!name) throw new AppError(400, 'Organization name is required');
      data.name = name;
    }
    for (const f of ['tagline', 'address', 'city', 'country', 'phone',
      'email', 'website', 'jurisdiction', 'logoData',
      'signatoryName', 'signatoryDesignation']) {
      if (b[f] !== undefined) data[f] = str(b[f]);
    }
    // In India the state is one of the list, so it always matches the
    // state on work locations and tax policies. A state already saved is
    // not questioned until it is changed.
    if (b.state !== undefined) {
      const state = str(b.state).trim();
      const before = await prisma.organization.findUnique({ where: { id: req.user?.organizationId }, select: { state: true, country: true } });
      const country = str(b.country ?? before?.country).trim().toLowerCase();
      if (state && state !== before?.state && (country === 'india' || !country) && !INDIAN_STATES.includes(state)) {
        throw new AppError(400, 'Pick the state from the list');
      }
      data.state = state;
    }
    if (b.signatureData !== undefined) {
      const image = str(b.signatureData);
      if (image && !IMAGE_DATA_URI.test(image)) throw new AppError(400, 'The signature must be a PNG or JPG image');
      if (image.length > MAX_SIGNATURE_CHARS) throw new AppError(400, 'The signature image is too large. Use a smaller picture.');
      data.signatureData = image;
    }
    if (b.logoPosition !== undefined) {
      if (!LOGO_POSITIONS.includes(b.logoPosition)) throw new AppError(400, 'Pick left, centre or right for the logo');
      data.logoPosition = b.logoPosition;
    }
    for (const f of ['brandPrimary', 'brandAccent']) {
      if (b[f] !== undefined) {
        if (!/^#[0-9a-fA-F]{6}$/.test(b[f])) throw new AppError(400, 'Colors must be hex like #4f46e5');
        data[f] = b[f];
      }
    }
    const org = await prisma.organization.update({
      where: { id: req.user?.organizationId },
      data,
    });
    res.json(org);
  },

  // ---- Team --------------------------------------------------------------
  async getTeam(req: any, res: Response) {
    const users = await prisma.user.findMany({
      where: { organizationId: req.user?.organizationId },
      include: { person: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const me = users.find(u => u.id === req.user?.userId);
    const policy = await policyFor(req.user?.organizationId);
    const linkedIds = users.map(u => u.personId).filter(Boolean) as string[];
    const withoutLogin = await prisma.person.count({
      where: {
        organizationId: req.user?.organizationId,
        isEmployee: true,
        employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] },
        id: { notIn: linkedIds },
      },
    });
    res.json({
      members: users.map(u => memberJSON(u, policy)),
      passwordMinLength: policy.minLength,
      myRole: me?.role || 'EMPLOYEE',
      myId: req.user?.userId,
      employeesWithoutLogin: withoutLogin,
    });
  },

  // One click: a login for every active employee that doesn't have one yet.
  // Responds with an XLSX credential sheet (name, email, temp password);
  // every generated account must change its password at first sign-in.
  async generateEmployeeLogins(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const orgId = req.user?.organizationId;
    const linked = (await prisma.user.findMany({
      where: { organizationId: orgId, personId: { not: null } },
      select: { personId: true },
    })).map(u => u.personId as string);
    const employees = await prisma.person.findMany({
      where: {
        organizationId: orgId, isEmployee: true,
        employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] },
        id: { notIn: linked },
      },
      orderBy: { name: 'asc' },
    });

    const created: { name: string; email: string; password: string; mail: string }[] = [];
    const sentBy = await actorName(req.user?.userId);
    const skipped: { name: string; reason: string }[] = [];
    for (const p of employees) {
      const email = (p.officialEmail || p.email || '').trim().toLowerCase();
      if (!email) { skipped.push({ name: p.name, reason: 'no email on record' }); continue; }
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) { skipped.push({ name: p.name, reason: `email ${email} already has a login` }); continue; }
      const password = tempPassword();
      const [firstName, ...rest] = p.name.split(' ');
      await prisma.user.create({
        data: {
          email,
          password: await bcrypt.hash(password, 10),
          firstName, lastName: rest.join(' '),
          organizationId: orgId,
          role: 'EMPLOYEE',
          personId: p.id,
          mustChangePassword: true,
          passwordChangedAt: new Date(),
        },
      });
      // With welcome mails on, each new login is mailed its temporary password
      const mail = await sendWelcomeMail(orgId, { name: p.name, email, password, personId: p.id }, sentBy);
      created.push({ name: p.name, email, password, mail });
    }

    const Excel = await import('exceljs');
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Logins');
    ws.addRow(['Name', 'Email (login)', 'Temporary password', 'Note']);
    ws.getRow(1).font = { bold: true };
    for (const c of created) {
      ws.addRow([c.name, c.email, c.password, `Must change password at first sign-in${c.mail === 'SENT' ? '. Welcome mail sent.' : c.mail === 'FAILED' ? '. Welcome mail could not be sent.' : ''}`]);
    }
    if (skipped.length) {
      ws.addRow([]);
      ws.addRow(['Skipped', '', '', '']).font = { bold: true };
      for (const s of skipped) ws.addRow([s.name, '', '', s.reason]);
    }
    ws.columns.forEach((c: any) => { c.width = 32; });
    res.setHeader('X-Created-Count', String(created.length));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="employee-logins-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  },

  async addMember(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const { email, password, firstName, lastName, role } = req.body;
    if (!email || !password) throw new AppError(400, 'Email and password are required');
    const problem = passwordProblem(await policyFor(req.user?.organizationId), String(password));
    if (problem) throw new AppError(400, problem);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, 'A user with this email already exists');
    const user = await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        firstName: str(firstName),
        lastName: str(lastName),
        organizationId: req.user?.organizationId,
        role: ROLES.includes(role) ? role : 'EMPLOYEE',
        // The admin knows this password, so it is a temporary one
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    const welcomeMail = await sendWelcomeMail(
      user.organizationId, { name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email, email: user.email, password: String(password) },
      await actorName(req.user?.userId),
    );
    res.status(201).json({ ...memberJSON(user), welcomeMail });
  },

  async updateMember(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const orgId = req.user?.organizationId;
    const member = await prisma.user.findFirst({
      where: { id: req.params.memberId, organizationId: orgId },
    });
    if (!member) throw new AppError(404, 'Team member not found');

    const b = req.body;
    const data: any = {};
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) throw new AppError(400, 'Invalid role');
      data.role = b.role;
    }
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);
    if (b.firstName !== undefined) data.firstName = str(b.firstName);
    if (b.lastName !== undefined) data.lastName = str(b.lastName);
    if (b.personId !== undefined) data.personId = b.personId || null;

    // Never lock the org out: keep at least one active Super Admin.
    const becomesInactiveOrDemoted =
      (data.isActive === false || (data.role && data.role !== 'SUPER_ADMIN'));
    if (becomesInactiveOrDemoted && member.role === 'SUPER_ADMIN') {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          organizationId: orgId, role: 'SUPER_ADMIN', isActive: true,
          id: { not: member.id },
        },
      });
      if (otherActiveAdmins === 0) {
        throw new AppError(400, 'The organization needs at least one active Super Admin');
      }
    }
    const updated = await prisma.user.update({ where: { id: member.id }, data });
    if (updated.role !== member.role) {
      await logPayrollAudit(req, [{ action: 'LOGIN_ROLE_CHANGED', field: member.email, oldValue: member.role, newValue: updated.role }]);
    }
    res.json(memberJSON(updated));
  },

  async resetMemberPassword(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const member = await prisma.user.findFirst({
      where: { id: req.params.memberId, organizationId: req.user?.organizationId },
    });
    if (!member) throw new AppError(404, 'Team member not found');
    const own = member.id === req.user?.userId;
    // A password set for someone else is temporary: they choose their own
    // at next sign-in, and their open sessions are closed.
    await setPassword(member, String(req.body.password || ''), await policyFor(member.organizationId), { temporary: !own });
    if (!own) await prisma.refreshToken.deleteMany({ where: { userId: member.id } });
    await logPayrollAudit(req, [{ action: 'PASSWORD_RESET', field: member.email }]);
    res.json({
      message: own ? 'Your password has been changed.'
        : `Password reset for ${member.email}. They must choose their own at next sign-in.`,
    });
  },

  // Lift a lock and clear the count of wrong passwords.
  async unlockMember(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const member = await prisma.user.findFirst({
      where: { id: req.params.memberId, organizationId: req.user?.organizationId },
    });
    if (!member) throw new AppError(404, 'Team member not found');
    await prisma.user.update({ where: { id: member.id }, data: { failedAttempts: 0, lockedUntil: null } });
    await logPayrollAudit(req, [{ action: 'ACCOUNT_UNLOCKED', field: member.email }]);
    res.json({ message: `${member.email} can sign in again.` });
  },

  // ---- Sign-in security -----------------------------------------------------
  async getSecurity(req: any, res: Response) {
    const policy = await policyFor(req.user?.organizationId);
    res.json({ policy: policyJSON(policy), limits: POLICY_LIMITS, labels: POLICY_LABELS });
  },

  async updateSecurity(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const organizationId = req.user?.organizationId;
    const before = await policyFor(organizationId);
    const { policy, error } = policyInput(req.body, policyJSON(before) as any);
    if (error) throw new AppError(400, error);
    const updated = await prisma.passwordPolicy.update({ where: { organizationId }, data: policy });
    await logPayrollAudit(req, POLICY_KEYS.filter(k => before[k] !== updated[k]).map(k => ({
      action: 'SECURITY_POLICY_UPDATED' as const, field: POLICY_LABELS[k], oldValue: String(before[k]), newValue: String(updated[k]),
    })));
    res.json({ policy: policyJSON(updated), limits: POLICY_LIMITS, labels: POLICY_LABELS });
  },

  // ---- Email ------------------------------------------------------------------
  async getMailSettings(req: any, res: Response) {
    const settings = await mailSettingsFor(req.user?.organizationId);
    res.json({
      settings: mailSettingsJSON(settings), securityOptions: MAIL_SECURITY,
      problem: mailProblem(settings), engine: pdfEngine(),
    });
  },

  // The password is write-only: it is stored encrypted and never sent back.
  // Leaving it blank keeps the one already saved.
  async updateMailSettings(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const organizationId = req.user?.organizationId;
    const before = await mailSettingsFor(organizationId);
    const b = req.body;
    const data: any = {};
    if (b.host !== undefined) {
      const host = str(b.host).trim().toLowerCase();
      if (host && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host)) throw new AppError(400, 'The mail server is a host name such as smtp.gmail.com');
      data.host = host;
    }
    if (b.port !== undefined) {
      const port = Number(b.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AppError(400, 'The port is a number from 1 to 65535');
      data.port = port;
    }
    if (b.security !== undefined) {
      if (!MAIL_SECURITY.some(o => o.value === b.security)) throw new AppError(400, 'Pick how the connection is secured');
      data.security = b.security;
    }
    if (b.username !== undefined) data.username = str(b.username).trim();
    if (b.fromName !== undefined) data.fromName = str(b.fromName).trim().replace(/[\r\n"<>]/g, '').slice(0, 80);
    for (const [field, label] of [['fromEmail', 'sender'], ['replyTo', 'reply-to']]) {
      if (b[field] === undefined) continue;
      const value = str(b[field]).trim();
      if (value && !isEmail(value)) throw new AppError(400, `The ${label} address is not an email address`);
      data[field] = value;
    }
    if (b.clearPassword) data.passwordEnc = '';
    else if (b.password) data.passwordEnc = seal(String(b.password));
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);
    if (b.welcomeMail !== undefined) data.welcomeMail = Boolean(b.welcomeMail);
    if (b.appUrl !== undefined) {
      const url = str(b.appUrl).trim().replace(/\/+$/, '');
      if (url && !/^https?:\/\/[^\s<>"']+$/i.test(url)) throw new AppError(400, 'The sign-in address starts with https:// (or http://)');
      data.appUrl = url.slice(0, 200);
    }

    const next = { ...before, ...data };
    if (next.enabled) {
      const problem = mailProblem(next);
      if (problem) throw new AppError(400, `${problem}. Fill it in before switching email on.`);
    }
    const updated = await prisma.mailSettings.update({ where: { organizationId }, data });
    const changed = (['enabled', 'host', 'port', 'security', 'username', 'fromName', 'fromEmail', 'replyTo', 'welcomeMail', 'appUrl'] as const)
      .filter(f => before[f] !== updated[f])
      .map(f => ({ action: 'MAIL_SETTINGS_UPDATED' as const, field: f, oldValue: String(before[f]), newValue: String(updated[f]) }));
    // The password itself is never written to the log
    if (before.passwordEnc !== updated.passwordEnc) {
      changed.push({ action: 'MAIL_SETTINGS_UPDATED' as const, field: 'password' as any, oldValue: '', newValue: updated.passwordEnc ? 'Changed' : 'Removed' });
    }
    await logPayrollAudit(req, changed);
    res.json({
      settings: mailSettingsJSON(updated), securityOptions: MAIL_SECURITY,
      problem: mailProblem(updated), engine: pdfEngine(),
    });
  },

  // Send one mail with the saved settings, switched on or not, to prove they work.
  async testMail(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const organizationId = req.user?.organizationId;
    const to = str(req.body.to).trim();
    if (!isEmail(to)) throw new AppError(400, 'Enter the address to send the test to');
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    const result = await sendMail(organizationId, {
      kind: 'TEST', to,
      subject: `Test mail from ${org?.name || 'Aveon HR'}`,
      text: `This is a test from ${org?.name || 'Aveon HR'}.\n\nIf you are reading it, the mail settings work.`,
      sentBy: await actorName(req.user?.userId),
    }, { force: true });
    res.json(result);
  },

  async getMailLog(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 25, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const where: any = { organizationId };
    if (req.query.failed === '1') where.status = 'FAILED';
    const [rows, total] = await Promise.all([
      prisma.mailLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      prisma.mailLog.count({ where }),
    ]);
    res.json({ rows, total, limit, offset });
  },

  // Sign-in attempts on the organization's accounts, newest first.
  async getLoginHistory(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    await prisma.loginEvent.deleteMany({
      where: { organizationId, createdAt: { lt: new Date(Date.now() - LOGIN_EVENT_DAYS * 24 * 60 * 60 * 1000) } },
    });
    const where: any = { organizationId };
    if (req.query.failed === '1') where.result = { not: 'SUCCESS' };
    if (req.query.userId) where.userId = String(req.query.userId);
    const [rows, total] = await Promise.all([
      prisma.loginEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      prisma.loginEvent.count({ where }),
    ]);
    res.json({
      rows: rows.map(r => ({
        id: r.id, email: r.email, result: r.result,
        resultLabel: (LOGIN_RESULT_LABELS as any)[r.result] || r.result,
        ip: r.ip, userAgent: r.userAgent, createdAt: r.createdAt,
      })),
      total, limit, offset, keptDays: LOGIN_EVENT_DAYS,
    });
  },
};
