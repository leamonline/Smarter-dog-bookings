import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const assetsDir = './public/assets';
const outputDir = './public/assets';

// List of images to convert
const imagesToConvert = [
    'client-dog-1.jpg',
    'client-dog-2.jpg',
    'client-dog-3.jpg',
    'client-dog-4.jpg',
    'client-dog-5.jpg',
    'client-dog-9.jpg',
    'client-dog-10.jpg',
    'drynamite.jpg',
    'houndsly-shampoo.jpg',
    'sticker.jpg'
];

async function convertToWebP() {
    console.log('🖼️  Converting images to WebP format...\n');

    for (const imageName of imagesToConvert) {
        const inputPath = path.join(assetsDir, imageName);
        const outputName = imageName.replace('.jpg', '.webp');
        const outputPath = path.join(outputDir, outputName);

        try {
            const inputStats = fs.statSync(inputPath);

            await sharp(inputPath)
                .webp({ quality: 85 })
                .toFile(outputPath);

            const outputStats = fs.statSync(outputPath);
            const savings = ((1 - outputStats.size / inputStats.size) * 100).toFixed(1);

            console.log(`✅ ${imageName} → ${outputName}`);
            console.log(`   ${(inputStats.size / 1024).toFixed(0)}KB → ${(outputStats.size / 1024).toFixed(0)}KB (${savings}% smaller)\n`);
        } catch (error) {
            console.error(`❌ Error converting ${imageName}:`, error.message);
        }
    }

    console.log('🎉 Conversion complete!');
}

convertToWebP();
