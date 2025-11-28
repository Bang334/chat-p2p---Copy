/**
 * Emoticon to Emoji Converter
 * Converts text emoticons like :) to emoji 😊
 */

// Emoticon mapping - order matters (longer patterns first to avoid partial matches)
const emoticonMap = {
  // Sad faces (process multi-char first)
  ':((': '😭',
  ':(((': '😭',
  ":'(": '😭',
  "T_T": '😭',
  "T.T": '😭',
  'ToT': '😭',
  
  // Happy faces
  ':D': '😃',
  '=D': '😃',
  'XD': '😆',
  'xD': '😆',
  ':))': '😄',
  ':)))': '😄',
  '^^': '😊',
  '^_^': '😊',
  '^-^': '😊',
  
  // Love
  '<3': '❤️',
  '<33': '💕',
  '<333': '💖',
  
  // Wink & Kiss
  ';)': '😉',
  ';-)': '😉',
  ':*': '😘',
  ':-*': '😘',
  
  // Vietnamese style
  ':v': '😏',
  ':V': '😏',
  
  // Tongue out
  ':P': '😛',
  ':-P': '😛',
  ':p': '😛',
  ':-p': '😛',
  
  // Angry
  '>:(': '😠',
  '>:-(': '😠',
  '>:[': '😡',
  
  // Confused/Skeptical
  ':/': '😕',
  ':\\': '😕',
  ':-/': '😕',
  ':-\\': '😕',
  
  // Cool
  '8)': '😎',
  'B)': '😎',
  '8-)': '😎',
  'B-)': '😎',
  
  // Neutral/Meh
  ':|': '😐',
  ':-|': '😐',
  '-_-': '😑',
  '-.-': '😑',
  
  // Surprised
  ':O': '😮',
  ':o': '😮',
  ':-O': '😮',
  ':-o': '😮',
  
  // Basic smiles (process last to avoid conflicts)
  ':)': '😊',
  ':-)': '😊',
  '=)': '😊',
  '=-)': '😊',
  
  // Basic sad (process last)
  ':(': '😞',
  ':-(': '😞',
  '=(': '😞',
  '=-(': '😞',
};

/**
 * Convert emoticons in text to emoji
 * @param {string} text - Input text with emoticons
 * @returns {string} - Text with emoticons replaced by emoji
 */
export const convertEmoticons = (text) => {
  if (!text) return text;
  
  let result = text;
  
  // Process emoticons in order (longer patterns first)
  for (const [emoticon, emoji] of Object.entries(emoticonMap)) {
    // Escape special regex characters
    const escapedEmoticon = emoticon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Replace all occurrences (with word boundaries to avoid partial matches)
    // Use (?<!\S) and (?!\S) for proper word boundaries
    const regex = new RegExp(`(?<!\\S)${escapedEmoticon}(?!\\S)`, 'g');
    result = result.replace(regex, emoji);
  }
  
  return result;
};

/**
 * Get list of supported emoticons with their emoji equivalents
 * @returns {Array} - Array of {emoticon, emoji} objects
 */
export const getEmoticonList = () => {
  return Object.entries(emoticonMap).map(([emoticon, emoji]) => ({
    emoticon,
    emoji
  }));
};

/**
 * Check if text contains emoticons
 * @param {string} text - Input text
 * @returns {boolean} - True if text contains emoticons
 */
export const hasEmoticons = (text) => {
  if (!text) return false;
  
  for (const emoticon of Object.keys(emoticonMap)) {
    if (text.includes(emoticon)) {
      return true;
    }
  }
  
  return false;
};

export default {
  convertEmoticons,
  getEmoticonList,
  hasEmoticons
};

