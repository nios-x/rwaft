
import { v2 as cloudinary } from 'cloudinary';
import path from 'node:path';
import "dotenv/config";

export async function uploadFile(filename: string, rootPath: string, folder: string) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    console.log("[upload] env check:", {
        hasCloudName: !!cloudName,
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret,
        hasPreset: !!uploadPreset,
        mode: (apiKey && apiSecret) ? "SIGNED" : "UNSIGNED"
    });

    if (!cloudName) {
        throw new Error("Missing CLOUDINARY_CLOUD_NAME in environment variables");
    }

    if ((!apiKey || !apiSecret) && !uploadPreset) {
        throw new Error(
            "Missing Cloudinary credentials in .env: please define CLOUDINARY_API_KEY & CLOUDINARY_API_SECRET (recommended for signed uploads) or CLOUDINARY_UPLOAD_PRESET (for unsigned uploads)."
        );
    }

    const relativePath = path.relative(rootPath, filename).split(path.sep).join('/');
    const relativeDirectory = path.posix.dirname(relativePath);
    const uploadFolder = relativeDirectory === '.'
        ? folder
        : `${folder}/${relativeDirectory}`;
    const publicId = path.basename(filename);

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
    });

    const uploadOptions: Record<string, any> = {
        folder: uploadFolder,
        resource_type: 'raw',
        public_id: publicId,
        overwrite: true
    };

    if (apiKey && apiSecret) {
        // Authenticated signed upload using API Key and Secret
        return cloudinary.uploader.upload(filename, uploadOptions);
    }

    // Unsigned upload fallback using upload preset
    return cloudinary.uploader.unsigned_upload(filename, uploadPreset!, uploadOptions);
};