import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // PDF
  "application/pdf",
  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // PowerPoint
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Text
  "text/plain",
  "text/csv",
  // ZIP
  "application/zip",
  "application/x-zip-compressed",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/x-wav",
  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const DANGEROUS_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".ps1",
  ".msi",
  ".com",
  ".scr",
  ".dll",
  ".js",
  ".vbs",
  ".jar",
]);

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".weba",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
};

function getSafeExtension(originalName, mimeType) {
  const fromMime = EXT_BY_MIME[mimeType];
  if (fromMime) return fromMime;

  const ext = path.extname(originalName || "").toLowerCase();
  if (ext && !DANGEROUS_EXTENSIONS.has(ext)) {
    return ext;
  }

  return "";
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    const ext = getSafeExtension(file.originalname, file.mimetype);
    cb(null, `${unique}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const originalExt = path.extname(file.originalname || "").toLowerCase();

  if (DANGEROUS_EXTENSIONS.has(originalExt)) {
    return cb(new Error("Executable or dangerous file types are not allowed"));
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("Unsupported file type"));
  }

  return cb(null, true);
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});

export function deleteUploadedFile(filename) {
  if (!filename) return;

  const safeName = path.basename(filename);
  const fullPath = path.join(UPLOADS_DIR, safeName);

  if (!fullPath.startsWith(UPLOADS_DIR)) return;

  fs.unlink(fullPath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("Failed to delete uploaded file:", err.message);
    }
  });
}

export function handleUploadError(err, _req, res, next) {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File size exceeds the 20 MB limit",
      });
    }

    return res.status(400).json({
      success: false,
      message: "File upload failed",
    });
  }

  if (
    err.message === "Unsupported file type" ||
    err.message === "Executable or dangerous file types are not allowed"
  ) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  return next(err);
}
