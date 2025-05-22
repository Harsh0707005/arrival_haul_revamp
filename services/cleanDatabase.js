const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const textCleaners = {
    removeCurrencyPrefix: (text) => {
        let cleaned = text.replace(/^[\s]*[$₹€£¥₩₴₦₱₲₴₸₺₼₽₾₿]?[\s]*/i, '');
        
        cleaned = cleaned.replace(/^[\d\s,]*\.?\d*[\s]*/i, '');
        
        return cleaned.trim();
    },

    removeBrandName: (text, brandName) => {
        if (!brandName) return text;
        const brandRegex = new RegExp(`^${brandName}\\s+`, 'i');
        return text.replace(brandRegex, '').trim();
    },

    removeCommonPrefixes: (text) => {
        const prefixes = ['new', 'best', 'top', 'premium', 'exclusive'];
        const prefixRegex = new RegExp(`^(${prefixes.join('|')})\\s+`, 'i');
        return text.replace(prefixRegex, '').trim();
    },

    removeSpecialChars: (text) => {
        return text.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    }
};

const databaseCleaners = {
    async cleanProductNames() {
        try {
            const products = await prisma.product.findMany({
                include: {
                    brand: true
                }
            });

            console.log(`Found ${products.length} products to clean`);

            for (const product of products) {
                let cleanedName = product.name;

                cleanedName = textCleaners.removeCurrencyPrefix(cleanedName);
                if (product.brand) {
                    cleanedName = textCleaners.removeBrandName(cleanedName, product.brand.name);
                }
                cleanedName = textCleaners.removeCommonPrefixes(cleanedName);
                cleanedName = textCleaners.removeSpecialChars(cleanedName);

                if (cleanedName !== product.name) {
                    await prisma.product.update({
                        where: { id: product.id },
                        data: { name: cleanedName }
                    });
                    console.log(`Updated product ${product.id}: "${product.name}" -> "${cleanedName}"`);
                }
            }

            console.log('Product names cleaning completed');
        } catch (error) {
            console.error('Error cleaning product names:', error);
            throw error;
        }
    },

    async cleanBrandNames() {
        try {
            const brands = await prisma.brand.findMany();

            console.log(`Found ${brands.length} brands to clean`);

            for (const brand of brands) {
                let cleanedName = brand.name;

                cleanedName = textCleaners.removeSpecialChars(cleanedName);
                cleanedName = textCleaners.removeCommonPrefixes(cleanedName);

                if (cleanedName !== brand.name) {
                    await prisma.brand.update({
                        where: { id: brand.id },
                        data: { name: cleanedName }
                    });
                    console.log(`Updated brand ${brand.id}: "${brand.name}" -> "${cleanedName}"`);
                }
            }

            console.log('Brand names cleaning completed');
        } catch (error) {
            console.error('Error cleaning brand names:', error);
            throw error;
        }
    }
};

async function cleanDatabase() {
    try {
        console.log('Starting database cleaning...');

        await databaseCleaners.cleanProductNames();

        await databaseCleaners.cleanBrandNames();

        console.log('Database cleaning completed successfully');
    } catch (error) {
        console.error('Error in database cleaning:', error);
    } finally {
        await prisma.$disconnect();
    }
}

module.exports = {
    cleanDatabase,
    databaseCleaners,
    textCleaners
};

if (require.main === module) {
    cleanDatabase();
} 