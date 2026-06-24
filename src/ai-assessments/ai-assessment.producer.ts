import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  AI_ASSESSMENT_QUEUE,
  AiAssessmentJobData,
} from './ai-assessment.queue';

@Injectable()
export class AiAssessmentProducer {
  constructor(
    @InjectQueue(AI_ASSESSMENT_QUEUE)
    private readonly queue: Queue<AiAssessmentJobData>,
  ) {}

  async enqueue(patientId: string, patientProfileId: string): Promise<string> {
    const jobId = [
      'ai-assessment',
      patientProfileId,
      new Date().toISOString().slice(0, 10),
    ]
      .map((part) => part.replace(/:/g, '_'))
      .join('__');
    const job = await this.queue.add(
      'assess',
      {
        patientId,
        patientProfileId,
        requestedAt: new Date().toISOString(),
      },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: true,
      },
    );
    return String(job.id);
  }
}
