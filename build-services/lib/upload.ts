
import { cloudinary, cloudinaryConfig } from './config.ts';
import path from 'node:path';

export async function uploadFile(filename: string, rootPath: string, folder: string) {
    const cloudName = cloudinaryConfig.cloud_name || process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = cloudinaryConfig.api_key || process.env.CLOUDINARY_API_KEY;
    const apiSecret = cloudinaryConfig.api_secret || process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = cloudinaryConfig.upload_preset || process.env.CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName) {
        throw new Error("Missing CLOUDINARY_CLOUD_NAME in environment variables");
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
        return cloudinary.uploader.upload(filename, uploadOptions);
    }

    if (uploadPreset) {
        return cloudinary.uploader.unsigned_upload(filename, uploadPreset, uploadOptions);
    }

    throw new Error(
        "Missing Cloudinary credentials: define CLOUDINARY_API_KEY & CLOUDINARY_API_SECRET or CLOUDINARY_UPLOAD_PRESET"
    );
};
