import { prisma } from "@/lib/prisma";

export async function createProductImageFromBuffer(opts: {
    productId: number;
    buffer: Buffer;
    mimeType: string;
}): Promise<{ id: number; url: string }> {
    const mime = opts.mimeType.split(";")[0]?.trim() || "image/png";

    const created = await prisma.productImage.create({
        data: {
            productId: opts.productId,
            imageUrl: "",
            imageData: new Uint8Array(opts.buffer),
            mimeType: mime,
            storedInDb: true,
        },
    });

    const url = `/api/product-images/${created.id}`;
    await prisma.productImage.update({
        where: { id: created.id },
        data: { imageUrl: url },
    });

    return { id: created.id, url };
}
