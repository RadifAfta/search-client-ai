import { PipelineRunner } from '../src/services/pipelineRunner';

async function main() {
  const runner = new PipelineRunner();
  const result = await runner.run({
    city: 'Jember',
    leadsPerQuery: 4,
    scoringMode: 'cashflow_cepat',
  });

  if (!result.success) {
    console.error('❌ Pipeline run gagal:', result.error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('💥 Fatal pipeline error:', err);
    process.exit(1);
  });
}
