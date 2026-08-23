
import { v2 as cloudinary } from 'cloudinary';
import path from 'node:path';


export async function uploadFile(filename: string, rootPath: string, folder: string) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
        throw new Error("Missing Cloudinary environment variables");
    }

    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret
    });

    const relativePath = path.relative(rootPath, filename).split(path.sep).join('/');
    const relativeDirectory = path.posix.dirname(relativePath);
    const uploadFolder = relativeDirectory === '.'
        ? folder
        : `${folder}/${relativeDirectory}`;

    return cloudinary.uploader.upload(filename, {
        folder: uploadFolder,
        resource_type: 'raw',
        public_id: path.basename(filename)
    });
};