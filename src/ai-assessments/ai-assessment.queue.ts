export const AI_ASSESSMENT_QUEUE = 'ai-assessment';

export interface AiAssessmentJobData {
  patientId: string;
  patientProfileId: string;
  requestedAt: string;
}
