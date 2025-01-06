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
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
    }
});

async function uploadToCloudinary(req, id, relPath, imageURL = null) {
    if (req.file) {
        try {
            const result = await cloudinary.v2.uploader.upload(
                "uploads/" + req.file.filename,
                {
                    folder: `chatterbox/${relPath}/`,
                    resource_type: 'image',
                    public_id: id
                }
            );
            fs.rm("uploads/" + req.file.filename, (err) => {
                if (err) logger.error("Failed to delete file:", err);
            });
            if (result.secure_url) return result.secure_url;
            return imageURL;
        } catch (error) {
            logger.error("Cloudinary upload failed:", error);
            return imageURL;
        }
    }
}
module.exports = { uploadToCloudinary, upload };