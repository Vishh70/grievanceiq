// src/services/aiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');
const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

/**
 * Extracts JSON from a markdown string (handles ```json ... ``` blocks).
 */
const extractJson = (text) => {
  try {
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('Failed to parse Gemini response as JSON.');
  }
};

/**
 * Analyze the complaint using Gemini.
 * Expects the complaint text and an optional base64 image string.
 */
async function analyzeComplaint(text, imageBase64 = null, mimeType = null) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ GEMINI_API_KEY is not set. Using fallback mock analysis.');
    return {
      category: 'Other',
      priority: 'Medium',
      recommendedDepartment: 'General Admin',
      keywords: [],
      severityScore: 5,
      safetyHazards: [],
      suggestedAction: 'Field inspection and municipal assessment required'
    };
  }

  const prompt = `
You are an expert AI civic assistant for the GrievanceIQ platform.
Analyze the following civic complaint and provide a structured JSON response.

Categories must be one of: "Roads", "Water Supply", "Electricity", "Drainage", "Waste Management", "Public Infrastructure", "Other".
Priority must be one of: "Critical", "High", "Medium", "Low".
Determine the most appropriate Indian municipal "recommendedDepartment".
Extract 3-5 relevant "keywords" summarizing the core issue (e.g., ["pothole", "accident risk", "MG road"]).

Additional Triage Fields:
- "severityScore": An integer from 1 to 10 rating the hazard severity (10 = immediate life risk / disaster, 1 = minor cosmetic issue).
- "safetyHazards": Array of 1-3 concise strings identifying detected physical risks (e.g. ["Live Wire Hazard", "Traffic Obstruction", "Flooding Risk"]). If no hazards, return [].
- "suggestedAction": A concise 1-sentence actionable remediation step for the municipal engineer or field response team.

Rules:
- "Critical" priority (severityScore 8-10) for major safety hazards or immediate health risks (e.g., exposed live wire, severe water contamination, major road collapse).
- "High" priority (severityScore 6-7) for significant disruptions to daily life (e.g., power outage, no water supply for days).
- "Medium" priority (severityScore 4-5) for standard civic issues (e.g., potholes, uncollected garbage, broken streetlights).
- "Low" priority (severityScore 1-3) for minor aesthetic or long-term requests (e.g., park maintenance, faded road signs).

Respond strictly with ONLY a JSON object in this format:
{
  "category": "...",
  "priority": "...",
  "recommendedDepartment": "...",
  "keywords": ["...", "..."],
  "severityScore": 8,
  "safetyHazards": ["...", "..."],
  "suggestedAction": "..."
}

Complaint Text: "${text}"
`;

  try {
    let result;
    if (imageBase64 && mimeType) {
      const imagePart = {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      };
      result = await model.generateContent([prompt, imagePart]);
    } else {
      result = await model.generateContent(prompt);
    }

    const responseText = result.response.text();
    const json = extractJson(responseText);

    const parsedSeverity = parseInt(json.severityScore, 10);

    return {
      category: json.category || 'Other',
      priority: json.priority || 'Medium',
      recommendedDepartment: json.recommendedDepartment || 'General Admin',
      keywords: Array.isArray(json.keywords) ? json.keywords : [],
      severityScore: (!isNaN(parsedSeverity) && parsedSeverity >= 1 && parsedSeverity <= 10) ? parsedSeverity : 5,
      safetyHazards: Array.isArray(json.safetyHazards) ? json.safetyHazards : [],
      suggestedAction: json.suggestedAction || 'Field inspection required'
    };
  } catch (err) {
    console.error('Gemini Analysis Error:', err.message);
    return {
      category: 'Other',
      priority: 'Medium',
      recommendedDepartment: 'General Admin',
      keywords: [],
      severityScore: 5,
      safetyHazards: [],
      suggestedAction: 'Field inspection and municipal assessment required'
    };
  }
}

module.exports = { analyzeComplaint };

