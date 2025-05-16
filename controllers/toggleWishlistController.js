const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.toggleWishlist = async (req, res) => {
    try {
        const userId = req.user.id;
        const { product_id, wishlist_status } = req.body;

        if (typeof product_id !== 'number' || typeof wishlist_status !== 'boolean') {
            return res.status(400).json({ success: false, message: "Invalid input format" });
        }

        const productExists = await prisma.product.findUnique({
            where: { id: product_id }
        });

        if (!productExists) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        if (wishlist_status) {
            await prisma.wishlist.upsert({
                where: {
                    userId_productId: {
                        userId,
                        productId: product_id
                    }
                },
                update: {},
                create: {
                    userId,
                    productId: product_id
                }
            });

            return res.json({ success: true, message: "Product added to wishlist" });

        } else {
            await prisma.wishlist.deleteMany({
                where: {
                    userId,
                    productId: product_id
                }
            });

            return res.json({ success: true, message: "Product removed from wishlist" });
        }

    } catch (error) {
        console.error("Wishlist error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};
