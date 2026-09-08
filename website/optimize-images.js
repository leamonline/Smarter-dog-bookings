
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ASSETS_DIR = 'public/assets';
const ICONS_DIR = 'public/assets/icons';

async function optimizeImages() {
    console.log('Starting image optimization...');

    // 1. Optimize Client Dogs (WebP + Resize)
    const clientDogs = fs.readdirSync(ASSETS_DIR).filter(file => file.startsWith('client-dog-') && (file.endsWith('.jpg') || file.endsWith('.png')));

    for (const file of clientDogs) {
        const inputPath = path.join(ASSETS_DIR, file);
        const outputPath = path.join(ASSETS_DIR, file.replace(/\.(jpg|png)$/, '.webp'));

        console.log(`Optimizing ${file}...`);

        await sharp(inputPath)
            .resize({ width: 800, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(outputPath);

        // Also update the original JPG for fallback (just resize)
        await sharp(inputPath)
            .resize({ width: 800, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer()
            .then(buffer => fs.writeFileSync(inputPath, buffer));
    }

    // 2. Optimize Houndsly Logo Rainbow
    console.log('Optimizing houndsly-logo-rainbow.png...');
    await sharp(path.join(ASSETS_DIR, 'houndsly-logo-rainbow.png'))
        .resize({ width: 600, withoutEnlargement: true })
        .png({ quality: 80, compressionLevel: 9 })
        .toBuffer()
        .then(buffer => fs.writeFileSync(path.join(ASSETS_DIR, 'houndsly-logo-rainbow.png'), buffer));

    // 3. Optimize Logo Text
    console.log('Optimizing logo-text.png...');
    await sharp(path.join(ASSETS_DIR, 'logo-text.png'))
        .resize({ width: 500, withoutEnlargement: true })
        .png({ quality: 80, compressionLevel: 9 })
        .toBuffer()
        .then(buffer => fs.writeFileSync(path.join(ASSETS_DIR, 'logo-text.png'), buffer));

    // 4. Optimize Icons (Convert to WebP + Resize)
    const icons = fs.readdirSync(ICONS_DIR).filter(file => file.endsWith('.jpg') || file.endsWith('.png'));

    for (const file of icons) {
        const inputPath = path.join(ICONS_DIR, file);
        // Create WebP version
        const outputWebP = path.join(ICONS_DIR, file.replace(/\.(jpg|png)$/, '.webp'));

        console.log(`Optimizing icon ${file}...`);

        await sharp(inputPath)
            .resize({ width: 250, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(outputWebP);

        // Resize original
        await sharp(inputPath)
            .resize({ width: 250, withoutEnlargement: true })
            .jpeg({ quality: 80 }) // Assuming they are jpgs based on file list
            .toBuffer()
            .then(buffer => fs.writeFileSync(inputPath, buffer));
    }

    console.log('Image optimization complete!');
}

optimizeImages().catch(console.error);
