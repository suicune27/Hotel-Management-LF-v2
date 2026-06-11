/**
 * Convert a File to a base64 data URL string.
 * Returns null if the file is too large (>5MB) or the conversion fails.
 */
export function fileToBase64(file: File, maxSizeMB = 5): Promise<string | null> {
  return new Promise((resolve) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      resolve(null);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Validate file type is an image
 */
export function isValidImageType(file: File): boolean {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  return allowedTypes.includes(file.type);
}

/**
 * Get a human-readable file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get image dimensions from a data URL
 */
export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}
