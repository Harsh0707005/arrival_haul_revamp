const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const file = fs.readFileSync('products.json', 'utf8');
    const products = JSON.parse(file);

    for (const product of products) {
        const {
            product_url,
            product_unique_id,
            product_description,
            product_name,
            product_images,
            product_price,
            product_brand_name,
            website_logo,
            product_category,
            product_country
        } = product;

        const numericPrice = parseFloat(product_price.replace(/[^0-9.]/g, '')) || 0;
        const brand = await prisma.brand.upsert({
            where: { name: product_brand_name },
            update: { image: website_logo },
            create: {
                name: product_brand_name,
                image: website_logo
            }
        });

        const category = await prisma.category.upsert({
            where: { name: product_category },
            update: {},
            create: {
                name: product_category
            }
        });

        await prisma.product.create({
            data: {
                name: product_name,
                description: product_description,
                url: product_url,
                sku_id: product_unique_id,
                images: product_images,
                price: numericPrice,
                country: {
                    connect: { id: parseInt(product_country.country_id) }
                },
                brand: {
                    connect: { id: brand.id }
                },
                category: {
                    connect: { id: category.id }
                }
            }
        });

        console.log(`Imported: ${product_name}`);
    }

    console.log('✅ Import finished.');
}

main()
    .catch((e) => {
        console.error('❌ Error:', e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
