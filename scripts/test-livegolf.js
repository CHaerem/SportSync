#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local manually
const envPath = join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                process.env[key.trim()] = valueParts.join('=').trim();
            }
        }
    });
    console.log('✅ Loaded .env.local');
} else {
    console.log('⚠️  No .env.local file found');
}

// Check for API key
const API_KEY = process.env.LIVEGOLF_API_KEY;

if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    console.error('❌ LiveGolf API key not configured!');
    console.error('\nPlease:');
    console.error('1. Edit .env.local and add your LiveGolf API key');
    console.error('2. Run this script again');
    process.exit(1);
}

console.log('✅ LiveGolf API key found');
console.log('\nTesting LiveGolf API...\n');

// Import and run the golf fetch
import('./fetch/golf.js').then(async (module) => {
    try {
        const result = await module.fetchGolfESPN();
        
        console.log(`Source: ${result.source}`);
        console.log(`Tournaments: ${result.tournaments.length}`);
        
        // Show Norwegian players with tee times
        result.tournaments.forEach(tour => {
            tour.events.forEach(event => {
                if (event.norwegianPlayers && event.norwegianPlayers.length > 0) {
                    console.log(`\n📍 ${event.title} (${tour.name})`);
                    event.norwegianPlayers.forEach(player => {
                        console.log(`   🇳🇴 ${player.name}: ${player.teeTime || 'No tee time yet'}`);
                        if (player.featuredGroup) {
                            console.log(`      📺 Featured Group: ${player.featuredGroup.groupName}`);
                        }
                    });
                }
            });
        });
        
        // Save to test file
        const fs = await import('fs/promises');
        const testPath = join(__dirname, '..', 'docs', 'data', 'golf-test.json');
        await fs.writeFile(testPath, JSON.stringify(result, null, 2));
        console.log(`\n✅ Test data saved to docs/data/golf-test.json`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
});