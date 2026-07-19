/**
 * Cloudinary Service (chat feature) — delegates to the real production
 * implementation in `src/services/cloudinaryService.ts`.
 */

export {
  uploadStoryImage,
  uploadImage,
  deleteCloudinaryAsset,
  type CloudinaryUploadResult,
} from '@/src/services/cloudinaryService';
