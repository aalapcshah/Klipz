// Test thumbnail analysis directly
import { invokeLLM } from './server/_core/llm.ts';

const thumbnailUrl = 'https://scontent-lga3-1.cdninstagram.com/v/t51.2885-15/480426887_18029437298418887_5648896638820115803_n.jpg?stp=dst-jpg_e35_p1080x1080_sh0.08_tt6&_nc_ht=scontent-lga3-1.cdninstagram.com&_nc_cat=1&_nc_ohc=kj5Yx2SkfDgQ7kNvgFqSHSG&_nc_gid=c0c9d6a7a2f44b5f8b0e4e8f6d8c7a6b&edm=ANTKIIoBAAAA&ccb=7-5&oh=00_AYFYjKqR8kQwJzKqR8kQwJzKqR8kQw&oe=67A8B8C0&_nc_sid=d885a2';

console.log('Testing thumbnail analysis...');
console.log('URL:', thumbnailUrl.substring(0, 100) + '...');

try {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are an expert at analyzing social media content. Describe what you see in this image."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this Instagram post thumbnail:"
          },
          {
            type: "image_url",
            image_url: {
              url: thumbnailUrl,
              detail: "low"
            }
          }
        ]
      }
    ]
  });
  
  console.log('Response:', JSON.stringify(response, null, 2));
} catch (error) {
  console.error('Error:', error);
}
