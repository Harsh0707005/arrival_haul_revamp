require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const axios = require("axios");

const prisma = new PrismaClient();

async function syncExchangeRates() {
    try {
        let countries = await prisma.country.findMany();

        const countryCodeMap = {};
        countries.forEach(country => {
            if (!countryCodeMap[country.currency]) {
                countryCodeMap[country.currency] = [];
            }
            countryCodeMap[country.currency].push(country.id);
        });

        for (const country of countries) {
            const fromId = parseInt(country.id)
            const currency = country.currency

            const url = `https://api.exchangerate-api.com/v4/latest/${currency}`;
            console.log(`Fetching rates for ${currency}...`);

            try {
                const res = await axios.get(url);
                const rates = res.data.rates;

                for (const [toCode, rate] of Object.entries(rates)) {
                    const toIds = countryCodeMap[toCode];
                    if (!toIds) continue;
                    for (const toId of toIds) {
                        await prisma.exchangeRate.upsert({
                            where: {
                                fromId_toId: {
                                    fromId,
                                    toId
                                }
                            },
                            update: {
                                rate,
                                updatedAt: new Date()
                            },
                            create: {
                                fromId,
                                toId,
                                rate
                            }
                        });
                    }
                }

                console.log(`✅ Synced rates for ${currency}`);
            } catch (err) {
                console.error(`❌ Failed for ${currency}:`, err.message);
            }
        }
    } catch (err) {
        console.error("Error syncing exchange rates:", err);
    } finally {
        await prisma.$disconnect();
    }
}

syncExchangeRates();
