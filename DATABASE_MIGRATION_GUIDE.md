# Income Module Database Migration Guide

## Current Status
✅ **In-Memory Storage** - Fully functional and tested
🔄 **Database Migration** - Ready to implement

## Architecture

### Current Implementation (In-Memory)
- **Storage**: JavaScript `Map` objects in `backend/src/controllers/incomeController.ts`
- **Data Models**: 
  - `clients` Map - IncomeClient records
  - `billings` Map - ClientBilling records  
  - `payments` Map - ClientPayment records
- **Persistence**: Lost on server restart (acceptable for MVP)
- **Performance**: O(1) lookups, instant response times

### Target Implementation (PostgreSQL + Prisma)
The database schema is already defined in `prisma/schema.prisma`:

```prisma
model IncomeClient {
  id              String   @id @default(cuid())
  organization    Organization @relation(...)
  organizationId  String
  name            String
  agreementStatus String?  // "signed", "pending", "unsigned"
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  billings        ClientBilling[]
  payments        ClientPayment[]
}

model ClientBilling {
  id              String   @id @default(cuid())
  client          IncomeClient @relation(...)
  clientId        String
  year            Int
  rate            Float
  gstAmount       Float    @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  payments        ClientPayment[]
}

model ClientPayment {
  id              String   @id @default(cuid())
  billing         ClientBilling @relation(...)
  billingId       String
  client          IncomeClient @relation(...)
  clientId        String
  amount          Float
  paymentDate     DateTime
  paymentMode     String?
  referenceNumber String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

## Migration Steps

### Step 1: Fix Prisma Setup (BLOCKER)
**Issue**: Prisma RC version (8.0.0-rc.13) doesn't generate client properly in Docker build
**Solution**: Upgrade Prisma to stable version

```bash
# In backend/package.json
npm install @prisma/client@latest prisma@latest
```

### Step 2: Initialize Database Tables
```bash
# Run migration to create tables
cd backend
npx prisma migrate deploy

# Or generate Prisma client if needed
npx prisma generate
```

### Step 3: Update Income Controller

Replace in-memory Maps with Prisma queries:

```typescript
// Before (in-memory)
const clientList = Array.from(clients.values()).filter(c => c.organizationId === orgId);

// After (Prisma)
const clientList = await prisma.incomeClient.findMany({
  where: { organizationId: orgId },
  orderBy: { createdAt: 'desc' }
});
```

### Step 4: Create Prisma Service Layer
Create `backend/src/services/incomeService.ts`:

```typescript
import { getPrismaClient } from '../lib/prisma';

export const incomeService = {
  async getClients(orgId: string) {
    const prisma = await getPrismaClient();
    return prisma.incomeClient.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' }
    });
  },

  async createClient(orgId: string, data: any) {
    const prisma = await getPrismaClient();
    return prisma.incomeClient.create({
      data: { ...data, organizationId: orgId }
    });
  },

  // ... other methods
};
```

### Step 5: Update Controller to Use Service
```typescript
import { incomeService } from '../services/incomeService';

export const incomeController = {
  async getClients(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const clients = await incomeService.getClients(orgId);
    res.json({ clients, total: clients.length });
  },
  // ...
};
```

## API Endpoints (Already Implemented)

### Clients
- `GET /api/income/clients` - List all clients
- `POST /api/income/clients` - Create new client
- `GET /api/income/clients/:clientId` - Get client detail
- `PUT /api/income/clients/:clientId` - Update client

### Billing
- `GET /api/income/clients/:clientId/billing` - List billing for client
- `POST /api/income/billing` - Create billing record

### Payments
- `GET /api/income/payments` - List all payments
- `POST /api/income/payments` - Record payment

### Analytics
- `GET /api/income/analytics` - Get analytics summary

## Testing

### Test Data Creation
```bash
# Seed test data after migration
curl -X POST http://localhost:3000/api/income/clients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Client","agreementStatus":"signed"}'
```

### Verify Migration
```bash
# Check database directly
psql $DATABASE_URL

SELECT * FROM "IncomeClient" WHERE "organizationId" = 'org_xxx';
SELECT * FROM "ClientBilling" WHERE "clientId" = 'client_xxx';
SELECT * FROM "ClientPayment";
```

## Rollback Plan

If migration fails, revert to in-memory by:
1. Keep current `incomeController.ts` as backup
2. Keep `backend/src/lib/prisma.ts` for future use
3. Can switch back instantly by reverting controller code

## Performance Considerations

### In-Memory vs Database
| Aspect | In-Memory | PostgreSQL |
|--------|-----------|-----------|
| Response Time | <1ms | 10-50ms |
| Data Persistence | Lost on restart | Persistent |
| Scalability | ~1000 records | Millions |
| Concurrent Users | Single instance | Multiple instances |

### Optimization for Prisma
- Add database indexes on `organizationId`, `clientId`, `createdAt`
- Use connection pooling (pgBouncer)
- Cache frequently accessed data (Redis optional)
- Batch queries where possible

## Frontend Consistency

The frontend already fetches data from these endpoints:
- `useIncomeStore` (Zustand) caches data in memory
- Automatic API retry on 401 (token refresh)
- No changes needed in frontend for database migration

## Next Steps

1. **Immediate**: Upgrade Prisma to stable version
2. **Priority 1**: Create migration files
3. **Priority 2**: Update controller with Prisma calls
4. **Priority 3**: Add service layer for better organization
5. **Priority 4**: Write unit tests for Prisma queries
6. **Priority 5**: Add database transaction support for complex operations

## Migration Completion Checklist

- [ ] Upgrade Prisma version
- [ ] Run migrations to create tables
- [ ] Update Income Controller with Prisma
- [ ] Create Income Service layer
- [ ] Test all API endpoints
- [ ] Test multi-tenant isolation
- [ ] Load test with 1000+ records
- [ ] Update API documentation
- [ ] Deploy to production
