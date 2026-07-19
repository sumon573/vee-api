/**
 * Cloudinary Config — Vee App
 */

export const CLOUDINARY_CONFIG = {
  cloudName: 'db6yriudg',
  uploadPreset: 'vee_uploads',
};

export function isCloudinaryConfigured(): boolean {
  return (
    CLOUDINARY_CONFIG.cloudName !== 'YOUR_CLOUD_NAME' &&
    CLOUDINARY_CONFIG.uploadPreset !== 'YOUR_UPLOAD_PRESET'
  );
}
