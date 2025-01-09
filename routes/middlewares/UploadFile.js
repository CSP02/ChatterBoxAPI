const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const cloudinary = require('cloudinary');
const fs = require('fs');
const logger = require('../../config/logger.js');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        if (file) {
            const ext = path.extname(file.originalname);
            const name = crypto.randomBytes(16).toString('hex');
            cb(null, `${name}${ext}`);
        }
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 1000000 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['text/plain', 'image/jpeg', 'image/png', 'image/gif', 'image/jpg', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only text and image files are allowed'));
        }
        cb(null, true);
    }
});

async function uploadToCloudinary(req) {
    if (req.file) {
        try {
            const result = await cloudinary.v2.uploader.upload(
                "uploads/" + req.file.filename,
                {
                    folder: "chatterbox/files",
                    resource_type: 'auto',
                    public_id: req.file.filename
                }
            );
            fs.rm("uploads/" + req.file.filename, (err) => {
                if (err) logger.error("Failed to delete file:", err);
            });
            
            // req.file.rType = result.resource_type;
            if (result.secure_url) return [result.secure_url, result.resource_type];
            return null;
        } catch (error) {
            logger.error("Cloudinary upload failed:", error);
            return null;
        }
    }
}
module.exports = { uploadToCloudinary, upload };