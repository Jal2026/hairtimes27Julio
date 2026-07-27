import { testReminderJob } from 'backend/reminderTest.web';

$w.onReady(() => {
  $w('#botonTemporal').onClick(async () => {
    const r = await testReminderJob();
    console.log('RESULTADO:', r);
  });
});