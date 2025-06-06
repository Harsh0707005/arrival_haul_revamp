const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.submitProductFeedback = async (req, res) => {
    try {
        const { product_id, isPriceAccurate } = req.body;
        const userId = req.user.id;

        if (!product_id || typeof isPriceAccurate !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: "Missing required fields or invalid data types"
            });
        }

        const product = await prisma.product.findUnique({
            where: { id: parseInt(product_id) }
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        const feedback = await prisma.productFeedback.upsert({
            where: {
                userId_productId: {
                    userId: userId,
                    productId: parseInt(product_id)
                }
            },
            update: {
                isPriceAccurate: isPriceAccurate
            },
            create: {
                userId: userId,
                productId: parseInt(product_id),
                isPriceAccurate: isPriceAccurate
            }
        });

        return res.json({
            success: true,
            message: "Product feedback submitted successfully",
            feedback: {
                product_id: feedback.productId,
                is_price_accurate: feedback.isPriceAccurate,
                updated_at: feedback.updatedAt
            }
        });

    } catch (err) {
        console.error("Error in submitProductFeedback:", err);
        res.status(500).json({
            success: false,
            message: "Internal Server Error"
        });
    }
}; 