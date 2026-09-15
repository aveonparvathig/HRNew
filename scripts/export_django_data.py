"""Export one organization's data from the Django Payslip app to JSON.

Usage:
    py scripts/export_django_data.py [--db path/to/db.sqlite3] [--org 5] [--out django_export.json]

Reads the Django SQLite database directly (no Django required). For the
production cutover, point --db at a file copied from production, or run
`python manage.py dumpdata` remotely and adapt. Binary columns (photos,
stored PDFs, uploaded documents) are intentionally skipped.
"""
import argparse
import json
import sqlite3
import sys
from datetime import datetime

SKIP_COLUMNS = {"photo", "pdf", "pdf_plain", "po_document", "agreement_document", "logo"}


def rows(db, sql, params=()):
    try:
        cur = db.execute(sql, params)
    except sqlite3.OperationalError as exc:
        # Older databases predate some tables - treat as empty.
        print(f"  (skipping: {exc})")
        return []
    cols = [d[0] for d in cur.description]
    out = []
    for r in cur.fetchall():
        row = {c: v for c, v in zip(cols, r) if c not in SKIP_COLUMNS}
        out.append(row)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=r"D:\Software development\Payslip\db.sqlite3")
    ap.add_argument("--org", type=int, default=5)
    ap.add_argument("--out", default=r"D:\Software development\Payslip-v2\scripts\django_export.json")
    args = ap.parse_args()

    db = sqlite3.connect(args.db)
    org = args.org

    data = {
        "exportedAt": datetime.now().isoformat(),
        "sourceDb": args.db,
        "sourceOrgId": org,
        "organization": rows(db, "SELECT * FROM payslip_organization WHERE id = ?", (org,)),
        "incomeClients": rows(db, "SELECT * FROM payslip_incomeclient WHERE organization_id = ?", (org,)),
        "clientBillings": rows(db, """
            SELECT b.* FROM payslip_clientbilling b
            JOIN payslip_incomeclient c ON b.client_id = c.id
            WHERE c.organization_id = ?""", (org,)),
        "paymentReceipts": rows(db, """
            SELECT p.* FROM payslip_paymentreceipt p
            JOIN payslip_clientbilling b ON p.billing_id = b.id
            JOIN payslip_incomeclient c ON b.client_id = c.id
            WHERE c.organization_id = ?""", (org,)),
        "clientOnboardings": rows(db, """
            SELECT o.* FROM payslip_clientonboarding o
            JOIN payslip_incomeclient c ON o.client_id = c.id
            WHERE c.organization_id = ?""", (org,)),
        "featureStatuses": rows(db, """
            SELECT f.* FROM payslip_featurestatus f
            JOIN payslip_incomeclient c ON f.client_id = c.id
            WHERE c.organization_id = ?""", (org,)),
        "academicYears": rows(db, "SELECT * FROM payslip_academicyear WHERE organization_id = ?", (org,)),
        "employees": rows(db, "SELECT * FROM payslip_employee WHERE organization_id = ?", (org,)),
        "payrollSettings": rows(db, "SELECT * FROM payslip_payrollsettings WHERE organization_id = ?", (org,)),
        "payrollRuns": rows(db, "SELECT * FROM payslip_payrollrun WHERE organization_id = ?", (org,)),
        "payslipEntries": rows(db, """
            SELECT e.* FROM payslip_payslipentry e
            JOIN payslip_payrollrun r ON e.run_id = r.id
            WHERE r.organization_id = ?""", (org,)),
        "people": rows(db, "SELECT * FROM payslip_person WHERE organization_id = ?", (org,)),
        "interviewRounds": rows(db, """
            SELECT i.* FROM payslip_interviewround i
            JOIN payslip_person p ON i.person_id = p.id
            WHERE p.organization_id = ?""", (org,)),
        "jobOpenings": rows(db, "SELECT * FROM payslip_jobopening WHERE organization_id = ?", (org,)),
        "proposalRecords": rows(db, "SELECT * FROM payslip_proposalrecord WHERE organization_id = ?", (org,)),
    }

    # Reconciliation figures computed at the source - the import script
    # re-computes the same sums from what it inserted and must match.
    def s(table, col):
        return sum(float(r[col] or 0) for r in data[table])

    data["reconciliation"] = {
        "counts": {k: len(v) for k, v in data.items()
                   if isinstance(v, list) and k != "organization"},
        "billingNetSum": round(s("clientBillings", "net_amount"), 2),
        "billingPrevPendingSum": round(s("clientBillings", "previous_pending"), 2),
        "paymentSum": round(s("paymentReceipts", "amount"), 2),
        "employeePackageSum": round(s("employees", "current_monthly_package"), 2),
        "entryNetPayableSum": round(s("payslipEntries", "net_payable"), 2),
        "entryGrossSum": round(s("payslipEntries", "gross_salary"), 2),
    }

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, default=str)

    print(f"Exported org {org} -> {args.out}")
    for k, v in data["reconciliation"]["counts"].items():
        if v:
            print(f"  {k}: {v}")
    print("  sums:", {k: v for k, v in data["reconciliation"].items() if k != "counts"})


if __name__ == "__main__":
    sys.exit(main())
