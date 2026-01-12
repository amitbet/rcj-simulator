// ============================================================
// Test Runner - Runs tests until they pass or max attempts reached
// ============================================================

const { spawn } = require('child_process');
const path = require('path');

const MAX_ATTEMPTS = 10;
const TEST_SCRIPT = path.join(__dirname, 'test_rectangle_headless.js');

function runTest(attempt) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Attempt ${attempt}/${MAX_ATTEMPTS}`);
    console.log('='.repeat(80));
    
    const testProcess = spawn('node', [TEST_SCRIPT], {
      cwd: __dirname,
      stdio: 'inherit'
    });
    
    testProcess.on('close', (code) => {
      resolve(code === 0);
    });
    
    testProcess.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  console.log('Starting test runner...');
  console.log(`Will run up to ${MAX_ATTEMPTS} attempts until test passes.\n`);
  
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const passed = await runTest(attempt);
      
      if (passed) {
        console.log(`\n✅ Test passed on attempt ${attempt}!`);
        process.exit(0);
      } else {
        console.log(`\n❌ Test failed on attempt ${attempt}. Retrying...`);
        if (attempt < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause
        }
      }
    } catch (error) {
      console.error(`\n❌ Error on attempt ${attempt}:`, error.message);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  
  console.log(`\n❌ Test failed after ${MAX_ATTEMPTS} attempts.`);
  process.exit(1);
}

main();
