const { PrismaClient } = require("@prisma/client");
const path = require("path");
const { spawn } = require("child_process");
const prisma = new PrismaClient();
const { calculatePriceDifference } = require("../services/currencyConversion");

const runPythonScript = (scriptPath, args = []) => {
    return new Promise((resolve, reject) => {
        const workingDirectory = path.join(__dirname, "../recommendationEngine");
        const pythonBinary = path.join(
            workingDirectory,
            process.platform === "win32" ? "venv/Scripts/python.exe" : "venv/bin/python"
        );

        const python = spawn(pythonBinary, [scriptPath, ...args], { cwd: workingDirectory });

        let stdout = "";
        let stderr = "";

        python.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        python.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        python.on("close", (code) => {
            if (code === 0) {
                try {
                    const parsed = JSON.parse(stdout.trim());
                    resolve(parsed);
                } catch (e) {
                    reject(new Error("Failed to parse script output"));
                }
            } else {
                reject(new Error(stderr || `Python process exited with code ${code}`));
            }
        });

        python.on("error", (err) => {
            reject(err);
        });
    });
};

exports.getRecommendedProducts = async (req, res) => {
    try {
        const { source_country_id, destination_country_id, id: userId } = req.user;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const scriptPath = path.join(__dirname, "../recommendationEngine/model.py");

        const recommendedIds = await runPythonScript(scriptPath, [userId, 100]);

        if (!Array.isArray(recommendedIds) || recommendedIds.length === 0) {
            return res.json({
                currentPage: 1,
                totalPages: 0,
                pageSize,
                totalItems: 0,
                recommended_products: []
            });
        }
        // console.log(recommendedIds)

        const sourceProducts = await prisma.product.findMany({
            where: {
                id: { in: recommendedIds },
                country_id: source_country_id,
                sku_id: { not: "" }
            }
        });

        const skuIds = sourceProducts.map(p => p.sku_id);
        if (skuIds.length === 0) {
            return res.json({
                currentPage: 1,
                totalPages: 0,
                pageSize,
                totalItems: 0,
                recommended_products: []
            });
        }

        const destinationProducts = await prisma.product.findMany({
            where: {
                sku_id: { in: skuIds },
                country_id: destination_country_id
            }
        });

        const matchedSkuSet = new Set(destinationProducts.map(p => p.sku_id));
        let matchedSourceProducts = sourceProducts.filter(p => matchedSkuSet.has(p.sku_id));

        const finalProducts = await Promise.all(matchedSourceProducts.map(async product => {
            const destinationProduct = destinationProducts.find(dp => dp.sku_id === product.sku_id) || { price: 0 };
            const diff = await calculatePriceDifference(source_country_id, destination_country_id, product.price, destinationProduct.price);
            const swap_diff = await calculatePriceDifference(destination_country_id, source_country_id, destinationProduct.price, product.price);

            if (diff.percentageDifference < -60 || diff.percentageDifference > 70) return null;

            const brand = await prisma.brand.findUnique({ where: { id: product.brand_id } });
            const country = await prisma.country.findUnique({ where: { id: product.country_id } });

            return {
                product_id: product.id,
                sku_id: product.sku_id,
                product_name: product.name,
                product_description: product.description,
                brand: brand ? brand.name : "Unknown",
                country_name: country ? country.name : "Unknown",
                images: [product.images[0]],
                source_country_details: {
                    original: diff.sourcePriceOriginal,
                    converted: diff.destinationPriceConverted,
                    price_difference_percentage: diff.percentageDifference,
                    currency: diff.sourceCurrency
                },
                destination_country_details: {
                    original: diff.destinationPriceOriginal,
                    converted: diff.sourcePriceConverted,
                    price_difference_percentage: swap_diff.percentageDifference,
                    currency: diff.destinationCurrency
                }
            };
        }));

        const clippedFinalProducts = finalProducts.slice(0, pageSize)
        const totalItems = clippedFinalProducts.length;
        const totalPages = Math.ceil(finalProducts.length / pageSize);

        return res.json({
            currentPage: page,
            totalPages,
            pageSize,
            totalItems,
            recommended_products: clippedFinalProducts
        });

    } catch (err) {
        console.error("Error in getRecommendedProducts:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
