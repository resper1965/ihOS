// Check gateway exports
const gw = require('@ai-sdk/gateway');
console.log('--- Gateway exports ---');
console.log(Object.keys(gw).join('\n'));

// Check if CoreMessage exists
const ai = require('ai');
console.log('\n--- Message types/schemas ---');
const msgKeys = Object.keys(ai).filter(k => k.toLowerCase().includes('message') || k.toLowerCase().includes('model'));
console.log(msgKeys.join('\n'));

// Check streamText signature
console.log('\n--- streamText result keys ---');
// We can check its return shape from docs

// Check createTextStreamResponse
console.log('\n--- Has toDataStreamResponse? ---');
console.log('createTextStreamResponse:', typeof ai.createTextStreamResponse);
console.log('createUIMessageStreamResponse:', typeof ai.createUIMessageStreamResponse);

// Check Output
console.log('\n--- Output ---');
console.log('Output:', typeof ai.Output);
console.log('Output keys:', Object.keys(ai.Output || {}));
