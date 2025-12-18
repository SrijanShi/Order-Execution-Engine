import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3000;

console.log('DEX Order Engine initialized');
console.log(`Server will run on port: ${PORT}`);
