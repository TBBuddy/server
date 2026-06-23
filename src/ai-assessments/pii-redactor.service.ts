import { Injectable } from '@nestjs/common';
import type { DayData } from './period-collector.service';

export interface RedactedPayload {
  days: {
    date: string;
    has_taken_medicine: boolean;
    severity: string | null;
    symptoms: string[];
  }[];
}

@Injectable()
export class PiiRedactorService {
  redact(days: DayData[]): RedactedPayload {
    return {
      days: days.map((d) => ({
        date: d.date,
        has_taken_medicine: d.has_taken_medicine,
        severity: d.severity,
        symptoms: d.symptom_names,
      })),
    };
  }
}
