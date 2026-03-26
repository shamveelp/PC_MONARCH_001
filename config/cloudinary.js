import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'product-images',
    format: async (req, file) => 'webp',
    public_id: (req, file) => {
      const filename = file.originalname.split('.')[0];
      return Date.now() + '-' + filename;
    },
  },
});

const uploadBuffer = (buffer, folder = 'product-images') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: folder, resource_type: 'image', format: 'webp' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
};

const uploadBase64 = (base64String, folder = 'product-images') => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      base64String,
      { folder: folder, resource_type: 'image', format: 'webp' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
  });
};

export { cloudinary, storage, uploadBuffer, uploadBase64 };
