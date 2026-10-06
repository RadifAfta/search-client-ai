import Groq from 'groq-sdk';
import { Config } from '../config';
import { UnifiedLead } from '../index';
import { AuditResult } from '../auditors/webAuditor';

export interface AIQualification {
  shouldPitch: boolean;
  painPointDetected: string;
  recommendedService: 'Bug Fixing' | 'Website Revamp' | 'New Website Development' | null;
  confidenceScore: number;
}

export class AIFilter {
  private config: Config;
  private groqClient: Groq | null = null;

  constructor(config: Config) {
    this.config = config;
    if (this.config.groqApiKey) {
      this.groqClient = new Groq({
        apiKey: this.config.groqApiKey,
      });
    }
  }

  /**
   * Qualifies a lead using Groq API and Llama 3 70B model.
   * Returns a structured decision on whether to pitch and the recommended angle.
   */
  public async qualifyLead(
    lead: UnifiedLead,
    auditResult: AuditResult
  ): Promise<AIQualification> {
    // Return a default conservative fallback if Groq is not configured
    if (!this.groqClient) {
      return this.getFallbackQualification(lead, auditResult, 'Groq API Key not configured');
    }

    const modelName = this.config.groqModel;

    const systemPrompt = `You are a Senior Sales Engineer and Lead Qualification Specialist targeting local UMKM businesses in Jember, East Java, Indonesia.
Your task is to analyze a business lead (from Google Maps or Twitter) along with its website audit result, and determine if it represents a prime sales opportunity for building a custom Landing Page or Company Profile website.

CLIENT REQUIREMENT: We are strictly targeting UMKM that DO NOT have a custom landing page or company profile website yet.

Analyze the lead based on these criteria:
1. "Belum punya landing page / company profile":
   - The business has NO website at all (URL is empty or Google Maps link), OR
   - The business only uses social media (Instagram, Facebook, TikTok) or link-in-bio (Linktree, Campsite, Canva site, WhatsApp link).
   -> shouldPitch: true
   -> recommendedService: "New Website Development"
   -> painPointDetected: "Bisnis belum memiliki website landing page / company profile resmi mandiri (masih mengandalkan profil medsos/Maps)."
   -> confidenceScore: 0.9 - 1.0 (Top priority lead)

2. "Web mati / broken":
   - The website returns 4xx/5xx or network errors.
   -> shouldPitch: true
   -> recommendedService: "Bug Fixing"
   -> painPointDetected: "Website bisnis tidak dapat diakses atau mati, butuh perbaikan atau pembuatan ulang."

3. "Sudah punya website kustom aktif":
   - The website is UP (status code 200) on a custom domain and functioning normally.
   -> shouldPitch: false (Disqualify because the business already has an active custom website).
   -> painPointDetected: "Bisnis sudah memiliki website mandiri yang aktif dan berjalan normal."

4. "Twitter lead":
   - Post looking for web developers or website creation in Jember / East Java.
   -> shouldPitch: true
   -> recommendedService: "New Website Development"

You MUST respond with a raw JSON object containing these exact fields:
{
  "shouldPitch": boolean,
  "painPointDetected": "string in Indonesian explaining the specific business pain point detected",
  "recommendedService": "Bug Fixing" | "Website Revamp" | "New Website Development",
  "confidenceScore": number (a float between 0.0 and 1.0)
}

Do not include any chat formatting, markdown code blocks, or explanations outside the JSON object.`;

    const userMessage = {
      lead: {
        source: lead.source,
        keyword: lead.keyword,
        name: lead.name,
        contactInfo: lead.contactInfo,
        referenceUrl: lead.referenceUrl,
        description: lead.description,
        timestamp: lead.timestamp,
      },
      auditResult: {
        status: auditResult.status,
        statusCode: auditResult.statusCode,
      },
    };

    try {
      const response = await this.groqClient.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(userMessage) },
        ],
        // Enable JSON mode
        response_format: { type: 'json_object' },
        temperature: 0.1, // Keep it highly deterministic
      });

      const responseContent = response.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Groq returned an empty response.');
      }

      const qualification: AIQualification = JSON.parse(responseContent.trim());
      return qualification;
    } catch (err: any) {
      console.error(`⚠️ AI Lead Qualification failed for "${lead.name}":`, err.message || err);
      return this.getFallbackQualification(lead, auditResult, err.message || 'LLM parsing error');
    }
  }

  /**
   * Generate static rule-based fallback qualifications when API fails or is not available
   */
  private getFallbackQualification(
    lead: UnifiedLead,
    auditResult: AuditResult,
    reason: string
  ): AIQualification {
    let shouldPitch = false;
    let painPointDetected = `Fallback Qualification (${reason})`;
    let recommendedService: 'Bug Fixing' | 'Website Revamp' | 'New Website Development' = 'New Website Development';
    let confidenceScore = 0.5;

    // Local rules
    if (lead.source === 'Twitter') {
      shouldPitch = true;
      painPointDetected = `Pencarian aktif di Twitter/X untuk keyword: "${lead.keyword}".`;
      recommendedService = lead.keyword.includes('benerin') ? 'Bug Fixing' : 'New Website Development';
      confidenceScore = 0.85;
    } else if (lead.source === 'GoogleMaps') {
      if (auditResult.status === 'NO_CUSTOM_WEBSITE') {
        shouldPitch = true;
        painPointDetected = 'Bisnis belum memiliki website landing page atau company profile resmi mandiri (hanya mengandalkan profil Google Maps / media sosial).';
        recommendedService = 'New Website Development';
        confidenceScore = 0.95;
      } else if (auditResult.status === 'DOWN') {
        shouldPitch = true;
        painPointDetected = `Website bisnis tidak dapat diakses atau mati (Status Code: ${auditResult.statusCode || 'None'}).`;
        recommendedService = 'Bug Fixing';
        confidenceScore = 0.85;
      } else if (auditResult.status === 'UP') {
        shouldPitch = false;
        painPointDetected = 'Bisnis sudah memiliki website mandiri yang aktif berjalan normal.';
        recommendedService = 'Website Revamp';
        confidenceScore = 0.2;
      }
    }

    return {
      shouldPitch,
      painPointDetected,
      recommendedService,
      confidenceScore,
    };
  }
}
