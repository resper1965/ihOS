import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { tool } from 'ai';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const testTool = tool({
  description: 'A mock tool that returns a score',
  inputSchema: z.object({
    item: z.string().describe('The item name')
  }),
  execute: async ({ item }) => {
    console.log('--- Tool Executing with item:', item);
    return { score: 95.5 };
  }
});

async function main() {
  console.log('Calling streamText with tool...');
  const result = streamText({
    model: openai.chat('gpt-4o'),
    messages: [
      { role: 'user', content: 'Use the mock tool to find the score of "test" and tell me.' }
    ],
    tools: {
      getScore: testTool
    },
    maxSteps: 5
  });

  console.log('Reading textStream:');
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
  console.log('\nSteps:', JSON.stringify(await result.steps, null, 2));
}

main().catch(console.error);
