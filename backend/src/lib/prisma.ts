let prisma: any = null;

export async function getPrismaClient() {
  if (!prisma) {
    try {
      const prismaModule: any = await import('@prisma/client');
      const PrismaClient = prismaModule.PrismaClient || prismaModule.default?.PrismaClient;
      prisma = new PrismaClient({
        errorFormat: 'pretty',
      });
    } catch (error) {
      console.error('Failed to initialize Prisma:', error);
      throw error;
    }
  }
  return prisma;
}

export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
