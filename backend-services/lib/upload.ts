import path from "node:path"
import "dotenv/config"
import { cloudinary } from "./cloudinary.ts"

const cloudName = process.env.CLOUDINARY_CLOUD_NAME
const apiKey = process.env.CLOUDINARY_API_KEY
const apiSecret = process.env.CLOUDINARY_API_SECRET
const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET

if (!cloudName) {
	throw new Error("Missing CLOUDINARY_CLOUD_NAME in environment variables")
}
if ((!apiKey || !apiSecret) && !uploadPreset) {
	throw new Error(
		"Missing Cloudinary credentials: define CLOUDINARY_API_KEY & CLOUDINARY_API_SECRET (signed uploads, recommended) or CLOUDINARY_UPLOAD_PRESET (unsigned uploads)."
	)
}

// Logged once at startup. The previous version printed this for every uploaded
// file, which buried real errors under thousands of identical lines.
console.log("[upload] Cloudinary mode:", apiKey && apiSecret ? "SIGNED" : "UNSIGNED")

export async function uploadFile(filename: string, rootPath: string, folder: string) {
	const relativePath = path.relative(rootPath, filename).split(path.sep).join("/")
	const relativeDirectory = path.posix.dirname(relativePath)
	const uploadFolder = relativeDirectory === "." ? folder : `${folder}/${relativeDirectory}`

	const uploadOptions: Record<string, unknown> = {
		folder: uploadFolder,
		resource_type: "raw",
		public_id: path.basename(filename),
		overwrite: true
	}

	if (apiKey && apiSecret) {
		return cloudinary.uploader.upload(filename, uploadOptions)
	}
	return cloudinary.uploader.unsigned_upload(filename, uploadPreset!, uploadOptions)
}
