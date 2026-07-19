/**
 * Cloudinary Service — Production
 * Unsigned upload (no backend required).
 * Supports: profile photos, story images, room covers.
 */

import { CLOUDINARY_CONFIG, isCloudinaryConfigured } from '../config/cloudinary';
import { auth } from '../config/firebase';

export type CloudinaryUploadResult = {
  url: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
};

type UploadOptions = {
  folder?: string;       // e.g. 'vee/avatars', 'vee/stories'
  transformation?: string; // e.g. 'c_fill,w_400,h_400,q_auto'
};

/**
 * Upload any image to Cloudinary.
 * @param localUri  - expo-image-picker result URI
 * @param options   - optional folder + transformation
 */
export async function uploadImage(
  localUri: string,
  options: UploadOptions = {},
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured()) {
    // Cloudinary not configured — return local URI as a dev fallback
    return {
      url: localUri,
      publicId: `local_${Date.now()}`,
      width: 400,
      height: 400,
      format: 'jpeg',
    };
  }

  const { cloudName, uploadPreset } = CLOUDINARY_CONFIG;
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const formData = new FormData();
  formData.append('file', {
    uri: localUri,
    type: 'image/jpeg',
    name: `upload_${Date.now()}.jpg`,
  } as unknown as Blob);
  formData.append('upload_preset', uploadPreset);

  if (options.folder) {
    formData.append('folder', options.folder);
  }
  // NOTE: Cloudinary rejects a `transformation` form field on unsigned
  // uploads ("Transformation parameter is not allowed when using unsigned
  // upload."). Do NOT send it in the upload request — instead apply the
  // transformation afterwards by inserting it into the returned secure_url.

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Cloudinary upload failed (${response.status})`);
  }

  const data = await response.json();
  const rawUrl = data.secure_url as string;

  return {
    url: options.transformation ? applyTransformation(rawUrl, options.transformation) : rawUrl,
    publicId: data.public_id as string,
    width: data.width as number,
    height: data.height as number,
    format: data.format as string,
  };
}

/**
 * Insert a Cloudinary transformation string into a delivery URL, e.g.
 *   https://res.cloudinary.com/<cloud>/image/upload/v123/vee/avatars/foo.jpg
 *   → https://res.cloudinary.com/<cloud>/image/upload/c_fill,w_400,h_400/v123/vee/avatars/foo.jpg
 * This is the supported way to apply transformations to unsigned uploads
 * (which cannot carry a `transformation` param in the upload request itself).
 */
function applyTransformation(url: string, transformation: string): string {
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const insertAt = idx + marker.length;
  return `${url.slice(0, insertAt)}${transformation}/${url.slice(insertAt)}`;
}

/**
 * Profile photo upload — 400×400 crop, auto quality.
 */
export async function uploadProfilePhoto(localUri: string): Promise<CloudinaryUploadResult> {
  return uploadImage(localUri, {
    folder: 'vee/avatars',
    transformation: 'c_fill,w_400,h_400,q_auto,f_auto',
  });
}

/**
 * Story image upload — full quality, stories folder.
 */
export async function uploadStoryImage(localUri: string): Promise<CloudinaryUploadResult> {
  return uploadImage(localUri, {
    folder: 'vee/stories',
    transformation: 'q_auto,f_auto',
  });
}

/**
 * Room cover upload — 800×450 landscape crop.
 */
export async function uploadRoomCover(localUri: string): Promise<CloudinaryUploadResult> {
  return uploadImage(localUri, {
    folder: 'vee/rooms',
    transformation: 'c_fill,w_800,h_450,q_auto,f_auto',
  });
}

/**
 * Delete a Cloudinary asset via the authenticated backend endpoint.
 * Uses the production API server at https://vee-api.onrender.com.
 * CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are configured on the server.
 *
 * RC8-B1 Security Fix: request now includes the caller's Firebase ID token in
 * the Authorization header. The server verifies the token with Firebase Admin
 * SDK before performing the deletion — unauthenticated callers receive 401.
 */
export async function deleteCloudinaryAsset(publicId: string): Promise<void> {
  if (!publicId || publicId.startsWith('local_')) return;

  const apiBase = 'https://vee-api.onrender.com';

  try {
    // Obtain the caller's Firebase ID token for server-side verification.
    const idToken = (await auth.currentUser?.getIdToken()) ?? null;
    if (!idToken) {
      // User is not authenticated — skip deletion silently (non-critical).
      return;
    }

    const res = await fetch(`${apiBase}/api/cloudinary/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ publicId }),
    });
    if (!res.ok) {
      // Non-critical: asset deletion failure does not affect the user experience.
      // Errors are swallowed intentionally — stale assets are cleaned up by server-side jobs.
    }
  } catch {
    // Network errors are non-critical and intentionally swallowed.
  }
}
