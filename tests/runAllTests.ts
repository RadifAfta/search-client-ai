import { runPhoneDetectorTests } from './phoneDetector.test';
import { runChannelSelectorTests } from './channelSelector.test';
import { runClaimValidatorTests } from './claimValidator.test';
import { runDeduplicatorTests } from './deduplicator.test';
import { runFollowUpSchedulerTests } from './followUpScheduler.test';
import { runLeadScoringTests } from './leadScoring.test';

async function runAllTests() {
  console.log(`================================================================`);
  console.log(`🧪 Menjalankan Semua Unit Test Suite untuk Lead Gen System`);
  console.log(`================================================================\n`);

  let passed = 0;
  let total = 6;

  try {
    runPhoneDetectorTests();
    passed++;
    console.log('');

    runChannelSelectorTests();
    passed++;
    console.log('');

    runClaimValidatorTests();
    passed++;
    console.log('');

    runDeduplicatorTests();
    passed++;
    console.log('');

    runFollowUpSchedulerTests();
    passed++;
    console.log('');

    runLeadScoringTests();
    passed++;
    console.log('');

    console.log(`================================================================`);
    console.log(`🎉 HASIL PENGUJIAN: ${passed}/${total} TEST SUITE LULUS (100% SUCCESS)`);
    console.log(`================================================================\n`);
  } catch (err: any) {
    console.error(`\n❌ TEST GAGAL:`, err.message);
    process.exit(1);
  }
}

runAllTests();

