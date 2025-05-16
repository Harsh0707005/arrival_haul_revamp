const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const countriesPath = path.join(__dirname, 'countries.json');
  const countries = JSON.parse(fs.readFileSync(countriesPath, 'utf-8'));

  for (const country of countries) {
    await prisma.country.upsert({
      where: { code: country.code },
      update: {},
      create: country,
    });
  }

  console.log('Countries seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding countries:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
