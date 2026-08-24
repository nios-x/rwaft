
import "dotenv/config"
import { v2 as cloudinary } from "cloudinary"

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
})

export const getRawAssetUrl = (publicId: string): string => cloudinary.url(publicId, {
    type: "upload",
    resource_type: "raw",
    secure: true
})

export { cloudinary }