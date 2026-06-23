import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  SchemaType,
  HarmCategory,
  HarmBlockThreshold,
  FinishReason,
} from '@google/generative-ai';
import { AiRiskLevel } from '../common/enums/ai-risk-level.enum';
import type { RedactedPayload } from './pii-redactor.service';

export interface GeminiAssessmentResult {
  risk_level: AiRiskLevel;
  summary: string;
  recommendation: string | null;
  should_consult_doctor: boolean;
  raw_response: Record<string, unknown>;
  prompt_snapshot: string;
  model_name: string;
}

@Injectable()
export class GeminiAdapterService {
  private readonly logger = new Logger(GeminiAdapterService.name);

  constructor(private readonly configService: ConfigService) {}

  async assess(payload: RedactedPayload): Promise<GeminiAssessmentResult> {
    const apiKey = this.configService.getOrThrow<string>('GEMINI_API_KEY');
    const modelName = this.configService.get<string>(
      'GEMINI_MODEL',
      'gemini-3-flash-preview',
    );
    const timeoutMs = this.configService.get<number>(
      'GEMINI_TIMEOUT_MS',
      20000,
    );

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel(
      {
        model: modelName,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              risk_level: {
                type: SchemaType.STRING,
                format: 'enum',
                enum: ['LOW', 'MEDIUM', 'HIGH'],
              },
              summary: { type: SchemaType.STRING },
              recommendation: { type: SchemaType.STRING, nullable: true },
              should_consult_doctor: { type: SchemaType.BOOLEAN },
            },
            required: ['risk_level', 'summary', 'should_consult_doctor'],
          },
        },
      },
      { timeout: timeoutMs },
    );

    const prompt = this.buildPrompt(payload);
    const startedAt = Date.now();

    const result = await model.generateContent(prompt);
    const response = result.response;

    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(`Gemini blocked the prompt: ${blockReason}`);
    }

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (!candidate || (finishReason && finishReason !== FinishReason.STOP)) {
      throw new Error(
        `Gemini did not finish normally: ${finishReason ?? 'no candidate'}`,
      );
    }

    const text = response.text();
    const parsed = this.parseAndValidate(text);

    this.logger.log({
      msg: 'gemini_assessment_done',
      model: modelName,
      latency_ms: Date.now() - startedAt,
      total_tokens: response.usageMetadata?.totalTokenCount,
      risk_level: parsed.risk_level,
    });

    return { ...parsed, prompt_snapshot: prompt, model_name: modelName };
  }

  private buildPrompt(payload: RedactedPayload): string {
    const dataJson = JSON.stringify(payload.days, null, 2);

    return `Kamu adalah sistem pemantauan kepatuhan pengobatan Tuberkulosis (TB). Tugasmu menganalisis TREN gejala dan kepatuhan minum obat pasien selama periode pemantauan, lalu menghasilkan early warning.

ATURAN WAJIB:
- Ini BUKAN diagnosis medis, melainkan sistem peringatan dini untuk membantu pemantauan.
- JANGAN menyarankan pasien berhenti minum obat atau mengubah dosis dalam kondisi apa pun.
- JANGAN membuat klaim diagnosis pasti atau menyebut nama penyakit selain konteks pemantauan TB.
- JANGAN mengarang gejala atau data yang tidak ada dalam input. Dasarkan seluruh penilaian HANYA pada data yang diberikan.
- Jika risiko tinggi, arahkan pasien untuk berkonsultasi dengan tenaga medis.

CARA MEMBACA DATA:
- Setiap objek = satu hari, diurutkan dari paling lama ke paling baru.
- "has_taken_medicine": apakah pasien minum obat hari itu. PENTING: dosis terlewat berturut-turut pada TB meningkatkan risiko resistensi obat — ini sinyal serius.
- "severity": tingkat keparahan keluhan hari itu — "MILD" (ringan), "MODERATE" (sedang), "SEVERE" (berat). Nilai null artinya pasien TIDAK ada keluhan hari itu (bukan data hilang).
- "symptoms": daftar gejala yang dilaporkan hari itu.

FOKUS ANALISIS:
1. Arah tren gejala: memburuk, membaik, atau stabil dari hari ke hari.
2. Pola kepatuhan: jumlah hari terlewat dan apakah terlewat berturut-turut.
3. Tanda bahaya TB bila muncul: batuk berdarah, sesak napas berat, demam tinggi berkepanjangan, atau gejala SEVERE yang menetap/meningkat.

Data check-in pasien (anonim, sudah tanpa identitas):
${dataJson}

Hasilkan penilaian dalam bahasa Indonesia. Pada "summary", sebutkan tren yang benar-benar teramati dari data (mis. arah keparahan dan kepatuhan). Pedoman risk_level:
- LOW: gejala ringan/tidak ada dan kepatuhan minum obat baik.
- MEDIUM: gejala sedang, ATAU kepatuhan tidak konsisten, ATAU tren mulai memburuk.
- HIGH: gejala berat/meningkat, ATAU ada tanda bahaya, ATAU dosis terlewat berturut-turut — set should_consult_doctor = true.

Isi "summary" dengan ringkasan tren (1-3 kalimat). Isi "recommendation" dengan langkah tindak lanjut konkret untuk pasien (atau null jika tidak ada).`;
  }

  private parseAndValidate(text: string): {
    risk_level: AiRiskLevel;
    summary: string;
    recommendation: string | null;
    should_consult_doctor: boolean;
    raw_response: Record<string, unknown>;
  } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Gemini returned invalid JSON: ${text.slice(0, 200)}`);
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Gemini response is not an object');
    }
    const obj = parsed as Record<string, unknown>;

    if (!Object.values(AiRiskLevel).includes(obj.risk_level as AiRiskLevel)) {
      throw new Error(`Invalid risk_level: ${String(obj.risk_level)}`);
    }
    if (typeof obj.summary !== 'string' || obj.summary.trim() === '') {
      throw new Error('Invalid or missing summary');
    }
    if (typeof obj.should_consult_doctor !== 'boolean') {
      throw new Error('Invalid should_consult_doctor');
    }

    return {
      risk_level: obj.risk_level as AiRiskLevel,
      summary: obj.summary.trim(),
      recommendation:
        typeof obj.recommendation === 'string'
          ? obj.recommendation.trim()
          : null,
      should_consult_doctor: obj.should_consult_doctor,
      raw_response: obj,
    };
  }
}
