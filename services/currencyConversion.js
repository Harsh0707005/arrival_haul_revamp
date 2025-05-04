const { PrismaClient } = require('@prisma/client');
const asyncHandler = require('express-async-handler');
const prisma = new PrismaClient();

const calculatePriceDifference = asyncHandler(async (
    sourceCountryId,
    destinationCountryId,
    sourcePrice,
    destinationPrice
) => {
    if (!sourceCountryId || !destinationCountryId) {
        throw new Error('Source and destination country IDs are required');
    }

    if (sourcePrice === undefined || sourcePrice === null ||
        destinationPrice === undefined || destinationPrice === null) {
        throw new Error('Source and destination prices are required');
    }

    const parsedSourcePrice = parseFloat(sourcePrice);
    const parsedDestinationPrice = parseFloat(destinationPrice);

    if (isNaN(parsedSourcePrice) || isNaN(parsedDestinationPrice)) {
        throw new Error('Invalid price values provided');
    }

    const exchangeRateDetails = await getExchangeRate(sourceCountryId, destinationCountryId);
    const exchangeRate = exchangeRateDetails.exchangeRate;

    const sourcePriceInDestinationCurrency = parseFloat((parsedSourcePrice * exchangeRate).toFixed(2));
    const destinationPriceInSourceCurrency = parseFloat((parsedDestinationPrice / exchangeRate).toFixed(2));

    const sourceCurrency = exchangeRateDetails.sourceCurrency;
    const destinationCurrency = exchangeRateDetails.destinationCurrency;

    const priceDifference = sourcePriceInDestinationCurrency - parsedDestinationPrice;
    let percentageDifference = 0;

    if (sourcePriceInDestinationCurrency > 0) {
        percentageDifference = (priceDifference / sourcePriceInDestinationCurrency) * 100;
    }

    percentageDifference = parseFloat(percentageDifference.toFixed(2));

    return {
        sourcePriceOriginal: parsedSourcePrice,
        destinationPriceOriginal: parsedDestinationPrice,
        sourcePriceConverted: sourcePriceInDestinationCurrency,
        destinationPriceConverted: destinationPriceInSourceCurrency,
        sourceCurrency: sourceCurrency,
        destinationCurrency: destinationCurrency,
        exchangeRate,
        percentageDifference,
        isNegative: percentageDifference < 0,
        absolutePercentageDifference: Math.abs(percentageDifference),
        isCheaperAtDestination: percentageDifference > 0
    };
});

const getExchangeRate = async (sourceCountryId, destinationCountryId) => {
    const sourceCountry = await prisma.country.findUnique({
        where: { id: sourceCountryId },
        select: { currency: true, currencySymbol: true }
    });

    const destinationCountry = await prisma.country.findUnique({
        where: { id: destinationCountryId },
        select: { currency: true, currencySymbol: true }
    });

    if (!sourceCountry || !destinationCountry) {
        throw new Error('Could not find specified countries');
    }

    const exchangeRate = await prisma.exchangeRate.findUnique({
        where: {
            fromId_toId: {
                fromId: sourceCountryId,
                toId: destinationCountryId
            }
        },
        select: { rate: true }
    });

    if (!exchangeRate) {
        throw new Error(`Exchange rate not found for ${sourceCountry.currency} to ${destinationCountry.currency}`);
    }

    return {
        exchangeRate: parseFloat(exchangeRate.rate),
        sourceCurrency: sourceCountry.currencySymbol,
        destinationCurrency: destinationCountry.currencySymbol
    };
};

module.exports = { calculatePriceDifference };