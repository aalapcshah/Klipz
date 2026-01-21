import sharp from 'sharp';
import { imageHash } from 'image-hash';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const imageHashAsync = promisify(imageHash);

// @ts-ignore - hamming-distance has no types
import hammingDistance from 'hamming-distance';

/**
 * Generate a perceptual hash for an image file
 * Uses average hash (aHash) algorithm which is fast and works well for duplicates
 * 
 * @param imageBuffer - Buffer containing image data
 * @returns Perceptual hash string (16 characters hex)
 */
export async function generatePerceptualHash(imageBuffer: Buffer): Promise<string> {
  try {
    // Convert image to standard format and resize for consistent hashing
    const processedBuffer = await sharp(imageBuffer)
      .resize(256, 256, { fit: 'inside' })
      .jpeg({ quality: 90 })
      .toBuffer();

    // image-hash requires a file path, so write to temp file
    const tempPath = join(tmpdir(), `hash-${Date.now()}.jpg`);
    writeFileSync(tempPath, processedBuffer);

    try {
      // Generate perceptual hash using average hash algorithm
      const hash = await imageHashAsync(tempPath, 16, true) as string;
      return hash;
    } finally {
      // Clean up temp file
      try {
        unlinkSync(tempPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Error generating perceptual hash:', error);
    throw new Error('Failed to generate perceptual hash');
  }
}

/**
 * Generate perceptual hash for a video by sampling the first frame
 * 
 * @param videoBuffer - Buffer containing video data
 * @returns Perceptual hash string
 */
export async function generateVideoPerceptualHash(videoBuffer: Buffer): Promise<string> {
  // For videos, we'll use FFmpeg to extract the first frame
  // For now, return a placeholder - this requires FFmpeg integration
  // TODO: Implement video frame extraction and hashing
  return '';
}

/**
 * Compare two perceptual hashes and return similarity score
 * Uses Hamming distance - lower distance means more similar
 * 
 * @param hash1 - First perceptual hash
 * @param hash2 - Second perceptual hash
 * @returns Hamming distance (0 = identical, higher = more different)
 */
export function compareHashes(hash1: string, hash2: string): number {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return Infinity;
  }
  
  try {
    return hammingDistance(hash1, hash2);
  } catch (error) {
    console.error('Error comparing hashes:', error);
    return Infinity;
  }
}

/**
 * Check if two hashes represent duplicate/similar images
 * Threshold of 5 is good for finding near-duplicates
 * Threshold of 0 finds only exact duplicates
 * 
 * @param hash1 - First perceptual hash
 * @param hash2 - Second perceptual hash
 * @param threshold - Maximum Hamming distance to consider as duplicate (default: 5)
 * @returns true if images are considered duplicates
 */
export function areDuplicates(hash1: string, hash2: string, threshold: number = 5): boolean {
  const distance = compareHashes(hash1, hash2);
  return distance <= threshold;
}

/**
 * Calculate similarity percentage between two hashes
 * 
 * @param hash1 - First perceptual hash
 * @param hash2 - Second perceptual hash
 * @returns Similarity percentage (0-100)
 */
export function calculateSimilarity(hash1: string, hash2: string): number {
  const distance = compareHashes(hash1, hash2);
  if (distance === Infinity) return 0;
  
  // Convert Hamming distance to similarity percentage
  // Maximum distance for 16-char hex hash is 64 bits
  const maxDistance = hash1.length * 4; // 4 bits per hex character
  const similarity = ((maxDistance - distance) / maxDistance) * 100;
  return Math.max(0, Math.min(100, similarity));
}
