import { PrismaClient } from '../generated/heart-client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('123456', 10);
  
  // Limpar tabelas caso já tenham dados
  // await prisma.user.deleteMany();
  // await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: {
      name: '7bar',
      databaseName: '7bar',
      databaseUrl: process.env.DATABASE_URL_TENANT || `mysql://root:@localhost:3307/7bar`,
      status: 'active',
      users: {
        create: {
          name: 'Lucas Souza',
          email: 'admin@7bar.com.br',
          password,
          role: 'admin'
        }
      }
    }
  });

  console.log('Seed created successfully:');
  console.log(tenant);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
