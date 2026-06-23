import { Job, Queue } from 'bullmq';
import { NotificationProducer } from './notification.producer';
import { NotificationJobData, NotificationJobName } from './notification.queue';

describe('NotificationProducer', () => {
  const queue = {
    add: jest.fn(),
    getJobs: jest.fn(),
  } as unknown as Queue<NotificationJobData>;
  const producer = new NotificationProducer(queue);

  beforeEach(() => {
    jest.clearAllMocks();
    (queue.add as jest.Mock).mockImplementation(
      async (_name: string, _data: unknown, options: { jobId: string }) => ({
        id: options.jobId,
      }),
    );
  });

  it('uses deterministic daily medicine reminder job ids', async () => {
    const jobIds = await producer.scheduleDailyMedicineReminders(
      'patient-1',
      'profile-1',
      '07:30',
      new Date(2026, 6, 3, 6, 0, 0),
    );

    expect(jobIds).toEqual([
      'medicine:profile-1:before:2026-07-03',
      'medicine:profile-1:time:2026-07-03',
      'medicine:profile-1:skip:2026-07-03',
    ]);
    expect(queue.add).toHaveBeenCalledWith(
      NotificationJobName.MEDICINE_REMINDER,
      expect.objectContaining({ kind: 'BEFORE', reminderDate: '2026-07-03' }),
      expect.objectContaining({
        jobId: 'medicine:profile-1:before:2026-07-03',
      }),
    );
  });

  it('moves missed reminder kinds to the next medicine date', async () => {
    await producer.scheduleDailyMedicineReminders(
      'patient-1',
      'profile-1',
      '07:30',
      new Date(2026, 6, 3, 8, 0, 0),
    );

    expect(queue.add).toHaveBeenCalledWith(
      NotificationJobName.MEDICINE_REMINDER,
      expect.objectContaining({ kind: 'BEFORE', reminderDate: '2026-07-04' }),
      expect.objectContaining({
        jobId: 'medicine:profile-1:before:2026-07-04',
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      NotificationJobName.MEDICINE_SKIP_EVALUATION,
      expect.objectContaining({ reminderDate: '2026-07-03' }),
      expect.objectContaining({
        jobId: 'medicine:profile-1:skip:2026-07-03',
      }),
    );
  });

  it('removes pending jobs for a closed episode', async () => {
    const matchingRemove = jest.fn();
    const otherRemove = jest.fn();
    (queue.getJobs as jest.Mock).mockResolvedValue([
      { data: { patientProfileId: 'profile-1' }, remove: matchingRemove },
      { data: { patientProfileId: 'profile-2' }, remove: otherRemove },
    ] as unknown as Job<NotificationJobData>[]);

    const removed = await producer.cancelPendingProfileJobs('profile-1');

    expect(removed).toBe(1);
    expect(matchingRemove).toHaveBeenCalledTimes(1);
    expect(otherRemove).not.toHaveBeenCalled();
  });
});
