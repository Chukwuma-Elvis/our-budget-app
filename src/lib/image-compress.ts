export type CompressedImageResult = {
  base64: string;
  mimeType: "image/jpeg";
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
};

/**
 * Resizes and compresses an image file before uploading to avoid Vercel 4.5MB payload limits
 * and save mobile user data while preserving sharp receipt text for vision AI models.
 */
export async function compressImageFile(
  file: File,
  maxDimension = 1600,
  quality = 0.8,
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    // Check if we are in browser environment
    if (typeof window === "undefined" || typeof document === "undefined") {
      return reject(new Error("Image compression is only supported in browser environment"));
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Scale down proportionally if larger than maxDimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return reject(new Error("Could not initialize canvas context for image processing"));
      }

      // Draw white background in case source has transparency (e.g. PNG)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // Draw downscaled image
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const cleanBase64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

      // Approximate size from base64 length
      const compressedSize = Math.round((cleanBase64.length * 3) / 4);

      resolve({
        base64: cleanBase64,
        mimeType: "image/jpeg",
        previewUrl: dataUrl,
        originalSize: file.size,
        compressedSize,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image file for compression"));
    };

    img.src = objectUrl;
  });
}
