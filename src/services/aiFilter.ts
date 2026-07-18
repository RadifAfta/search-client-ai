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

    const systemPrompt = `You are a Senior Sales Engineer and Lead Qualification Specialist targeting local businesses in Indonesia.
Your task is to analyze a business lead (from Twitter or Google Maps) along with its website audit result, and determine if it represents a good sales opportunity for custom web development, website revamp, or bug-fixing services.

Analyze the lead based on these Indonesian market signals:
1. "Web mati": The website is DOWN (returns 4xx/5xx or network errors). This is a strong candidate for "Bug Fixing" or "Website Revamp".
2. "Belum punya website kustom": The website URL points to Instagram, Facebook, or other social media. Indonesian businesses using Instagram/FB as their primary page can be pitched a custom landing page/website under "New Website Development".
3. "Butuh perbaikan fitur": The lead source is Twitter and they are actively looking for developer support (e.g. "nyari dev laravel", "bisa benerin web"). These are prime candidates for "Bug Fixing" or "New Website Development".
4. "Website Up": If the website is UP (status code 200), they might still be a candidate for a "Website Revamp" if their business niche requires advanced features (like booking or e-commerce) and their description/keyword suggests deficiencies. Otherwise, keep shouldPitch as false.

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
      confidenceScore = 0.8;
    } else if (lead.source === 'GoogleMaps') {
      if (auditResult.status === 'NO_CUSTOM_WEBSITE') {
        shouldPitch = true;
        painPointDetected = 'Bisnis hanya menggunakan profil sosial media, belum memiliki website kustom sendiri.';
        recommendedService = 'New Website Development';
        confidenceScore = 0.75;
      } else if (auditResult.status === 'DOWN') {
        shouldPitch = true;
        painPointDetected = `Website bisnis tidak dapat diakses atau mati (Status Code: ${auditResult.statusCode || 'None'}).`;
        recommendedService = 'Bug Fixing';
        confidenceScore = 0.85;
      } else if (auditResult.status === 'UP') {
        // Fallback checks
        shouldPitch = false;
        painPointDetected = 'Website bisnis aktif dan berjalan normal.';
        recommendedService = 'Website Revamp';
        confidenceScore = 0.3;
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
